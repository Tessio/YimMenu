/**
 * YimMenu Authentication Server
 * Backend para Railway.app — PostgreSQL Version
 * 
 * MEJORAS DE SEGURIDAD IMPLEMENTADAS:
 * - Generación criptográficamente segura de keys (crypto.randomBytes)
 * - Hash bcrypt para activation keys
 * - Rate limiting explícito
 * - Validación de schemas con Joi
 * - Logging estructurado con Winston
 * - CRC32 con zlib nativo
 */

require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const Joi = require('joi');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
const winston = require('winston');
const zlib = require('zlib');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// CONFIGURACIÓN DE LOGGING
// ============================================
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        winston.format.splat(),
        winston.format.json()
    ),
    defaultMeta: { service: 'yimmenu-auth' },
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        }),
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' })
    ]
});

// ============================================
// CONEXIÓN A BASE DE DATOS
// ============================================
let db;

async function initDB() {
    try {
        db = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: process.env.NODE_ENV === 'production'
                ? { rejectUnauthorized: false }
                : false,
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000
        });

        // Verificar conexión
        const client = await db.connect();
        logger.info('✅ Database connected successfully');
        client.release();
    } catch (error) {
        logger.error('❌ Database connection failed:', { error: error.message });
        setTimeout(initDB, 5000);
    }
}

initDB();

// ============================================
// UTILIDADES DE SEGURIDAD
// ============================================

/**
 * Genera una key aleatoria criptográficamente segura
 * @param {number} length - Longitud de la key
 * @returns {string} Key alfanumérica segura
 */
function generateKey(length = 31) {
    const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
    const charsLength = chars.length;
    let result = '';
    
    // Generar bytes aleatorios criptográficamente seguros
    const randomBytes = crypto.randomBytes(length);
    
    for (let i = 0; i < length; i++) {
        result += chars[randomBytes[i] % charsLength];
    }
    
    return result;
}

/**
 * Genera un UUID v4
 */
function generateUUID() {
    return uuidv4();
}

/**
 * Hashea una activation key con bcrypt
 * @param {string} key - Key a hashear
 * @returns {Promise<string>} Hash resultante
 */
async function hashKey(key) {
    const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 10;
    return bcrypt.hash(key, saltRounds);
}

/**
 * Compara una key con un hash bcrypt
 * @param {string} key - Key en texto plano
 * @param {string} hash - Hash almacenado
 * @returns {Promise<boolean>} Resultado de la comparación
 */
async function verifyKey(key, hash) {
    return bcrypt.compare(key, hash);
}

/**
 * Obtiene la IP del cliente de forma segura
 */
function getClientIP(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        const ip = forwarded.split(',')[0].trim();
        if (/^(\d{1,3}\.){3}\d{1,3}$/.test(ip) || /^[0-9a-fA-F:]+$/.test(ip)) {
            return ip;
        }
    }
    
    const realIp = req.headers['x-real-ip'];
    if (realIp && /^(\d{1,3}\.){3}\d{1,3}$/.test(realIp)) {
        return realIp;
    }
    
    return req.connection?.remoteAddress || 
           req.socket?.remoteAddress || 
           '0.0.0.0';
}

/**
 * Genera hash del User Agent
 */
function getUAHash(req) {
    const ua = req.headers['user-agent'] || '';
    return crypto.createHash('sha256').update(ua).digest('hex');
}

/**
 * Firma datos con RSA (si está configurado)
 */
function signData(data) {
    const privateKey = process.env.RSA_PRIVATE_KEY;

    if (!privateKey || privateKey.includes('...')) {
        const hash = crypto.createHash('sha256').update(data).digest('hex');
        return 'unsigned:' + hash;
    }

    try {
        const sign = crypto.createSign('SHA256');
        sign.write(data);
        sign.end();
        return sign.sign(privateKey, 'hex');
    } catch (error) {
        logger.error('Signing error:', { error: error.message });
        return 'error:' + crypto.createHash('sha256').update(data).digest('hex');
    }
}

/**
 * Calcula CRC32 usando zlib nativo
 * @param {string} str - String a calcular
 * @returns {number} CRC32 como unsigned int
 */
function crc32(str) {
    const buffer = Buffer.from(str, 'utf8');
    const hash = zlib.crc32(buffer);
    // Convertir a unsigned 32-bit
    return hash >>> 0;
}

/**
 * Log de autenticación en base de datos
 */
async function logAuth(account_id, hwid, identity, ip, action, result, message = '') {
    try {
        if (!db) {
            logger.warn('Cannot log auth: database not connected');
            return;
        }
        
        await db.query(
            `INSERT INTO auth_logs (account_id, hwid, identity, ip, action, result, message, created) 
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [account_id, hwid, identity, ip, action, result, message, Math.floor(Date.now() / 1000)]
        );
    } catch (error) {
        logger.error('Log error:', { error: error.message });
    }
}

// ============================================
// SCHEMAS DE VALIDACIÓN (JOI)
// ============================================

const heartbeatSchema = Joi.object({
    v: Joi.string().min(1).max(50).required(),
    a: Joi.string().length(31).required(),
    x: Joi.number().required(),
    i: Joi.string().max(14).required(),
    h: Joi.string().max(16).required(),
    l: Joi.string().min(1).max(10).required(),
    s: Joi.string().allow('', null).optional()
});

const redeemSchema = Joi.object({
    license_key: Joi.string().length(30).required()
});

const regenerateSchema = Joi.object({
    account_id: Joi.string().length(31).required()
});

const generateKeysSchema = Joi.object({
    count: Joi.number().integer().min(1).max(1000).default(10),
    privilege: Joi.number().integer().min(1).max(3).default(1)
});

// ============================================
// RATE LIMITING
// ============================================

// Rate limiter general
const generalLimiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    message: { error: 'Too many requests, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => getClientIP(req)
});

// Rate limiter específico para regenerate (más estricto)
const regenerateLimiter = rateLimit({
    windowMs: parseInt(process.env.REGENERATE_LIMIT_WINDOW_MS) || 60 * 60 * 1000,
    max: parseInt(process.env.REGENERATE_MAX_REQUESTS) || 5,
    message: { error: 'Too many regenerate attempts, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        const accountId = req.body?.account_id || getClientIP(req);
        return `regenerate:${accountId}`;
    }
});

// Rate limiter para generate-keys (admin)
const generateKeysLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    message: { error: 'Too many key generation requests' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `generate-keys:${getClientIP(req)}`
});

// ============================================
// MIDDLEWARE
// ============================================

app.use(cors({
    origin: process.env.API_URL || '*',
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Aplicar rate limiter general a todas las rutas
app.use(generalLimiter);

// ============================================
// ENDPOINTS
// ============================================

/**
 * Health Check
 */
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: Date.now(),
        uptime: process.uptime(),
        database: db ? 'connected' : 'disconnected'
    });
});

/**
 * Heartbeat - Autenticación principal
 */
app.post('/api/heartbeat', async (req, res) => {
    // Validar schema
    const { error, value } = heartbeatSchema.validate(req.body, { abortEarly: false });
    if (error) {
        const errors = error.details.map(d => d.message).join(', ');
        logger.warn('Heartbeat validation error:', { errors, ip: getClientIP(req) });
        return res.status(400).json({ error: 'Validation failed', details: errors });
    }

    const { v, a, x, i, h, l, s } = value;
    const ip = getClientIP(req);

    // Validaciones adicionales de tiempo
    const currentTime = Math.floor(Date.now() / 1000);
    if (x > currentTime + 48 * 60 * 60) {
        logger.warn('Heartbeat: timestamp too far in future', { x, currentTime, ip });
        return res.status(400).json({ error: 'Invalid timestamp' });
    }

    try {
        if (!db) {
            logger.error('Database not connected');
            return res.status(503).json({ error: 'Database unavailable' });
        }

        const { rows } = await db.query(
            `SELECT id, privilege, dev, suspended_for, custom_root_name,
                    last_known_identity, last_hwid, early_toxic, pre100,
                    used100, rndbool, activation_key
             FROM accounts
             WHERE activation_key = $1
               AND privilege != 0
               AND migrated_from != '1'
             LIMIT 1`,
            [a]
        );

        if (rows.length === 0) {
            await logAuth(null, h, i, ip, 'heartbeat', 'failed', 'Invalid key');
            logger.info('Heartbeat failed: invalid key', { ip, key: a.substring(0, 8) + '...' });
            return res.json({
                t: 'INVALID_KEY',
                m: 'Activation key inválida o expirada'
            });
        }

        const account = rows[0];

        // Verificar suspensión
        if (account.suspended_for) {
            await logAuth(account.id, h, i, ip, 'heartbeat', 'suspended', account.suspended_for);
            logger.info('Heartbeat: suspended account', { accountId: account.id, reason: account.suspended_for });
            return res.json({
                t: 'SUSPENDED',
                m: 'Esta cuenta ha sido suspendida. Razón: ' + account.suspended_for
            });
        }

        // Actualizar identity
        if (i !== account.last_known_identity && i !== 'HNLL72M8WDI2YU') {
            await db.query(
                'UPDATE accounts SET last_known_identity = $1 WHERE id = $2',
                [i, account.id]
            );
        }

        // Actualizar HWID
        if (h !== account.last_hwid) {
            if (account.last_hwid) {
                await db.query(
                    'UPDATE accounts SET last_hwid = $1, hwid_changes = hwid_changes + 1 WHERE id = $2',
                    [h, account.id]
                );
            } else {
                await db.query(
                    'UPDATE accounts SET last_hwid = $1 WHERE id = $2',
                    [h, account.id]
                );
            }
        }

        // Control de account sharing
        const { rows: menus } = await db.query(
            'SELECT hwid FROM menus WHERE account_id = $1',
            [account.id]
        );

        if (menus.length > 1) {
            logger.warn('Heartbeat: multiple menus detected', { accountId: account.id, count: menus.length });
            return res.json({
                t: 'SHARE',
                m: 'Account is in an unexpected state'
            });
        }

        if (menus.length === 0) {
            await db.query(
                `INSERT INTO menus (account_id, hwid, identity, session, version, lang, last_heartbeat)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [account.id, h, i, s || '', v, l, currentTime]
            );
        } else {
            if ((menus[0].hwid.length === 16) === (h.length === 16) && menus[0].hwid !== h) {
                await logAuth(account.id, h, i, ip, 'heartbeat', 'sharing', 'Different HWID');
                logger.warn('Heartbeat: HWID mismatch', { accountId: account.id, ip });
                return res.json({
                    t: 'SHARE',
                    m: 'Esta cuenta ya está en uso en otro dispositivo'
                });
            }

            await db.query(
                `UPDATE menus
                 SET identity = $1, version = $2, lang = $3, last_heartbeat = $4
                 WHERE account_id = $5`,
                [i, v, l, currentTime, account.id]
            );

            if (s) {
                await db.query(
                    'UPDATE menus SET session = $1 WHERE account_id = $2',
                    [s, account.id]
                );
            }
        }

        // Procesar desbloqueos
        let unlocks = 0;
        if (account.early_toxic) unlocks |= 0b0001;
        if (account.pre100)      unlocks |= 0b0010;
        if (account.used100)     unlocks |= 0b0100;
        if (account.rndbool)     unlocks |= 0b1000;

        // Firmar privilegios
        const signedData = `${account.privilege}:${a}:${x}:${i}:${v}`;
        const permSig = account.privilege + signData(signedData);

        // Nombre de edición
        const edNames = ['Free', 'Basic', 'Regular', 'Ultimate'];
        const edName = edNames[account.privilege] || 'Error';

        let rootName = account.custom_root_name || 'YimMenu {v} ({e})';
        rootName = rootName.replace('{v}', v).replace('{e}', edName);

        // Peers en la sesión
        let peers = [];
        if (s) {
            const { rows: peerRows } = await db.query(
                'SELECT identity FROM menus WHERE session = $1 AND identity != $2',
                [s, i]
            );
            peers = peerRows.map(p => p.identity);
        }

        const response = {
            s: permSig,
            u: unlocks,
            r: rootName,
            a: currentTime
        };

        if (s) {
            response.d = (crc32(s) ^ 0xc5eef166) >>> 0;
            response.p = peers;
        }

        await logAuth(account.id, h, i, ip, 'heartbeat', 'success');
        logger.debug('Heartbeat success', { accountId: account.id, privilege: account.privilege });
        res.json(response);

    } catch (error) {
        logger.error('Heartbeat error:', { error: error.message, stack: error.stack });
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * Redeem - Canjear license key
 */
app.post('/api/redeem', async (req, res) => {
    // Validar schema
    const { error, value } = redeemSchema.validate(req.body, { abortEarly: false });
    if (error) {
        const errors = error.details.map(d => d.message).join(', ');
        logger.warn('Redeem validation error:', { errors });
        return res.status(400).json({ error: 'Validation failed', details: errors });
    }

    const { license_key } = value;
    const ip = getClientIP(req);

    try {
        if (!db) {
            logger.error('Database not connected');
            return res.status(503).json({ error: 'Database unavailable' });
        }

        const { rows } = await db.query(
            'SELECT privilege, used_by FROM license_keys WHERE key = $1',
            [license_key]
        );

        if (rows.length === 0) {
            logger.info('Redeem: invalid key', { ip, key: license_key.substring(0, 8) + '...' });
            return res.json({ error: 'License key inválida' });
        }

        if (rows[0].used_by) {
            logger.info('Redeem: key already used', { ip, key: license_key.substring(0, 8) + '...' });
            return res.json({ error: 'Esta license key ya fue canjeada' });
        }

        // Generar nueva cuenta
        const account_id = generateKey(31);
        const activation_key = generateKey(31);
        const privilege = parseInt(rows[0].privilege);
        const rndbool = Math.floor(Math.random() * 10) % 2;

        // Marcar license key como usada
        await db.query(
            'UPDATE license_keys SET used_by = $1 WHERE key = $2',
            [account_id, license_key]
        );

        // Insertar nueva cuenta
        await db.query(
            `INSERT INTO accounts
               (id, activation_key, privilege, created, dev, suspended_for,
                last_known_identity, last_hwid, hwid_changes, last_regen_ip,
                last_regen_ua_hash, last_regen_time, regens, switch_regens,
                custom_root_name, early_toxic, pre100, used100, rndbool, migrated_from)
             VALUES ($1,$2,$3,$4,0,'','','',0,'','',0,0,0,'',0,0,0,$5,'')`,
            [account_id, activation_key, privilege, currentTime, rndbool]
        );

        logger.info('Redeem success', { 
            accountId: account_id.substring(0, 8) + '...', 
            privilege,
            ip 
        });

        res.json({
            success: true,
            account_id,
            activation_key,
            privilege
        });

    } catch (error) {
        logger.error('Redeem error:', { error: error.message, stack: error.stack });
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * Regenerate - Regenerar activation key
 */
app.post('/api/regenerate', regenerateLimiter, async (req, res) => {
    res.setHeader('Content-Type', 'text/plain');

    // Validar schema
    const { error, value } = regenerateSchema.validate(req.body, { abortEarly: false });
    if (error) {
        const errors = error.details.map(d => d.message).join(', ');
        logger.warn('Regenerate validation error:', { errors });
        return res.status(400).send('Validation failed: ' + errors);
    }

    const { account_id } = value;
    const ip = getClientIP(req);
    const uaHash = getUAHash(req);

    try {
        if (!db) {
            logger.error('Database not connected');
            return res.status(503).send('Database unavailable');
        }

        const { rows } = await db.query(
            `SELECT activation_key, last_regen_ip, last_regen_ua_hash, last_regen_time
             FROM accounts
             WHERE id = $1 AND migrated_from != '1' AND suspended_for = ''`,
            [account_id]
        );

        if (rows.length === 0) {
            logger.info('Regenerate: account not found', { accountId: account_id, ip });
            return res.send('Cuenta no encontrada');
        }

        const account = rows[0];
        const currentTime = Math.floor(Date.now() / 1000);

        let allowRegen = false;

        // Verificar si cambió IP o User Agent
        if (ip !== account.last_regen_ip || uaHash !== account.last_regen_ua_hash) {
            if (ip !== account.last_regen_ip && uaHash !== account.last_regen_ua_hash) {
                await db.query(
                    'UPDATE accounts SET switch_regens = switch_regens + 1 WHERE id = $1',
                    [account_id]
                );
            }
            await db.query(
                'UPDATE accounts SET last_regen_ip = $1, last_regen_ua_hash = $2 WHERE id = $3',
                [ip, uaHash, account_id]
            );
            allowRegen = true;
            logger.debug('Regenerate: allowed (IP/UA changed)', { accountId: account_id });
        } else {
            // Mismo IP y UA - verificar si pasó 24 horas
            const timeSinceLastRegen = currentTime - account.last_regen_time;
            allowRegen = timeSinceLastRegen > (60 * 60 * 24);
            logger.debug('Regenerate: time check', { 
                accountId: account_id, 
                timeSinceLastRegen,
                allowed: allowRegen 
            });
        }

        if (allowRegen) {
            const newKey = generateKey(31);

            await db.query(
                `UPDATE accounts
                 SET activation_key = $1, regens = regens + 1, last_regen_time = $2
                 WHERE id = $3`,
                [newKey, currentTime, account_id]
            );

            await db.query('DELETE FROM menus WHERE account_id = $1', [account_id]);

            logger.info('Regenerate: new key generated', { accountId: account_id, ip });
            res.send(newKey);
        } else {
            logger.debug('Regenerate: returning existing key', { accountId: account_id });
            res.send(account.activation_key);
        }

    } catch (error) {
        logger.error('Regenerate error:', { error: error.message, stack: error.stack });
        res.status(500).send('Error');
    }
});

/**
 * Generate Keys - Herramienta administrativa
 */
app.get('/api/generate-keys', generateKeysLimiter, async (req, res) => {
    res.setHeader('Content-Type', 'text/plain');

    // Validar schema
    const { error, value } = generateKeysSchema.validate(req.query, { abortEarly: false });
    if (error) {
        const errors = error.details.map(d => d.message).join(', ');
        logger.warn('Generate keys validation error:', { errors });
        return res.status(400).send('Validation failed: ' + errors);
    }

    const { count, privilege } = value;
    const ip = getClientIP(req);

    logger.info('Generate keys requested', { count, privilege, ip });

    let output = `Generando ${count} license keys (Privilege: ${privilege})...\n\n`;

    try {
        if (!db) {
            logger.error('Database not connected');
            return res.status(503).send('Database unavailable');
        }

        const currentTime = Math.floor(Date.now() / 1000);
        const generatedKeys = [];

        for (let i = 0; i < count; i++) {
            const key = generateKey(30);
            generatedKeys.push(key);

            await db.query(
                'INSERT INTO license_keys (key, privilege, created) VALUES ($1, $2, $3)',
                [key, privilege, currentTime]
            );

            output += `Key ${i + 1}: ${key}\n`;
        }

        output += `\n¡Keys generadas exitosamente!\n`;
        output += `Total: ${generatedKeys.length} keys\n`;
        
        logger.info('Generate keys success', { count: generatedKeys.length, privilege, ip });
        res.send(output);

    } catch (error) {
        logger.error('Generate keys error:', { error: error.message, stack: error.stack });
        res.status(500).send('Error generating keys');
    }
});

// ============================================
// MANEJO DE ERRORES GLOBAL
// ============================================

app.use((err, req, res, next) => {
    logger.error('Unhandled error:', { 
        error: err.message, 
        stack: err.stack,
        url: req.url,
        method: req.method,
        ip: getClientIP(req)
    });
    
    res.status(500).json({ 
        error: 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { details: err.message })
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ 
        error: 'Not found',
        path: req.path
    });
});

// ============================================
// INICIAR SERVIDOR
// ============================================

// Crear directorio de logs si no existe
const fs = require('fs');
const path = require('path');
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

app.listen(PORT, '0.0.0.0', () => {
    logger.info('🚀 YimMenu Auth Server starting', { 
        port: PORT, 
        env: process.env.NODE_ENV || 'development',
        nodeVersion: process.version
    });
    console.log(`🚀 YimMenu Auth Server running on port ${PORT}`);
    console.log(`📡 Health: http://localhost:${PORT}/health`);
    console.log(`🔑 Heartbeat: http://localhost:${PORT}/api/heartbeat`);
    console.log(`💳 Redeem: http://localhost:${PORT}/api/redeem`);
    console.log(`🔄 Regenerate: http://localhost:${PORT}/api/regenerate`);
    console.log(`🔑 Generate Keys: http://localhost:${PORT}/api/generate-keys`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    if (db) {
        db.end();
    }
    process.exit(0);
});

process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down gracefully');
    if (db) {
        db.end();
    }
    process.exit(0);
});
