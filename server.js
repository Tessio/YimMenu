/**
 * YimMenu Authentication Server
 * Backend para Railway.app — PostgreSQL Version
 */

require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

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
                : false
        });

        // Verificar conexión
        const client = await db.connect();
        console.log('✅ Database connected successfully');
        client.release();
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        setTimeout(initDB, 5000); // Reintentar en 5 segundos
    }
}

initDB();

// ============================================
// UTILIDADES
// ============================================

/**
 * Genera una key aleatoria alfanumérica
 */
function generateKey(len = 31) {
    const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
    let result = '';
    for (let i = 0; i < len; i++) {
        result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
}

/**
 * Obtiene la IP del cliente
 */
function getClientIP(req) {
    return req.headers['x-forwarded-for']?.split(',')[0] ||
           req.headers['x-real-ip'] ||
           req.connection?.remoteAddress ||
           req.socket?.remoteAddress ||
           '0.0.0.0';
}

/**
 * Genera hash del User Agent
 */
function getUAHash(req) {
    const ua = req.headers['user-agent'] || '';
    return crypto.createHash('md5').update(ua).digest('hex');
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
        console.error('Signing error:', error.message);
        return 'error:' + crypto.createHash('sha256').update(data).digest('hex');
    }
}

/**
 * Log de autenticación
 */
async function logAuth(account_id, hwid, identity, ip, action, result, message = '') {
    try {
        await db.query(
            'INSERT INTO auth_logs (account_id, hwid, identity, ip, action, result, message, created) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
            [account_id, hwid, identity, ip, action, result, message, Math.floor(Date.now() / 1000)]
        );
    } catch (error) {
        console.error('Log error:', error.message);
    }
}

// ============================================
// ENDPOINTS
// ============================================

/**
 * Health Check
 */
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
});

/**
 * Heartbeat - Autenticación principal
 */
app.post('/api/heartbeat', async (req, res) => {
    const { v, a, x, i, h, l, s } = req.body;

    if (!v || !a || !x || !i || !h || !l) {
        return res.status(400).json({ error: 'Bad request' });
    }

    if (i.length > 14 || h.length > 16 || x > (Date.now() / 1000 + 48 * 60 * 60)) {
        return res.status(400).json({ error: 'Invalid data format' });
    }

    const ip = getClientIP(req);

    try {
        const { rows } = await db.query(
            `SELECT id, privilege, dev, suspended_for, custom_root_name,
                    last_known_identity, last_hwid, early_toxic, pre100,
                    used100, rndbool
             FROM accounts
             WHERE activation_key = $1
               AND privilege != 0
               AND migrated_from != '1'
             LIMIT 1`,
            [a]
        );

        if (rows.length === 0) {
            await logAuth(null, h, i, ip, 'heartbeat', 'failed', 'Invalid key');
            return res.json({
                t: 'INVALID_KEY',
                m: 'Activation key inválida o expirada'
            });
        }

        const account = rows[0];

        // Verificar suspensión
        if (account.suspended_for) {
            await logAuth(account.id, h, i, ip, 'heartbeat', 'suspended', account.suspended_for);
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
            return res.json({
                t: 'SHARE',
                m: 'Account is in an unexpected state'
            });
        }

        if (menus.length === 0) {
            await db.query(
                `INSERT INTO menus (account_id, hwid, identity, session, version, lang, last_heartbeat)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [account.id, h, i, s || '', v, l, Math.floor(Date.now() / 1000)]
            );
        } else {
            if ((menus[0].hwid.length === 16) === (h.length === 16) && menus[0].hwid !== h) {
                await logAuth(account.id, h, i, ip, 'heartbeat', 'sharing', 'Different HWID');
                return res.json({
                    t: 'SHARE',
                    m: 'Esta cuenta ya está en uso en otro dispositivo'
                });
            }

            await db.query(
                `UPDATE menus
                 SET identity = $1, version = $2, lang = $3, last_heartbeat = $4
                 WHERE account_id = $5`,
                [i, v, l, Math.floor(Date.now() / 1000), account.id]
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
            a: Math.floor(Date.now() / 1000)
        };

        if (s) {
            response.d = (crc32(s) ^ 0xc5eef166) >>> 0;
            response.p = peers;
        }

        await logAuth(account.id, h, i, ip, 'heartbeat', 'success');
        res.json(response);

    } catch (error) {
        console.error('Heartbeat error:', error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * Redeem - Canjear license key
 */
app.post('/api/redeem', async (req, res) => {
    const { license_key } = req.body;

    if (!license_key || license_key.length !== 30) {
        return res.status(400).json({ error: 'License key inválida' });
    }

    try {
        const { rows } = await db.query(
            'SELECT privilege, used_by FROM license_keys WHERE key = $1',
            [license_key]
        );

        if (rows.length === 0) {
            return res.json({ error: 'License key inválida' });
        }

        if (rows[0].used_by) {
            return res.json({ error: 'Esta license key ya fue canjeada' });
        }

        const account_id = generateKey(31);
        const activation_key = generateKey(31);
        const privilege = parseInt(rows[0].privilege);
        const rndbool = Math.floor(Math.random() * 10) % 2;

        await db.query(
            'UPDATE license_keys SET used_by = $1 WHERE key = $2',
            [account_id, license_key]
        );

        await db.query(
            `INSERT INTO accounts
               (id, activation_key, privilege, created, dev, suspended_for,
                last_known_identity, last_hwid, hwid_changes, last_regen_ip,
                last_regen_ua_hash, last_regen_time, regens, switch_regens,
                custom_root_name, early_toxic, pre100, used100, rndbool, migrated_from)
             VALUES ($1,$2,$3,$4,0,'','','',0,'','',0,0,0,'',0,0,0,$5,'')`,
            [account_id, activation_key, privilege, Math.floor(Date.now() / 1000), rndbool]
        );

        res.json({
            success: true,
            account_id,
            activation_key,
            privilege
        });

    } catch (error) {
        console.error('Redeem error:', error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * Regenerate - Regenerar activation key
 */
app.post('/api/regenerate', async (req, res) => {
    res.setHeader('Content-Type', 'text/plain');

    const { account_id } = req.body;

    if (!account_id || account_id.length !== 31) {
        return res.status(400).send('Account ID inválido');
    }

    try {
        const { rows } = await db.query(
            `SELECT activation_key, last_regen_ip, last_regen_ua_hash, last_regen_time
             FROM accounts
             WHERE id = $1 AND migrated_from != '1' AND suspended_for = ''`,
            [account_id]
        );

        if (rows.length === 0) {
            return res.send('Cuenta no encontrada');
        }

        const account = rows[0];
        const ip = getClientIP(req);
        const uaHash = getUAHash(req);

        let allowRegen = false;

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
        } else {
            allowRegen = (Math.floor(Date.now() / 1000) - account.last_regen_time) > (60 * 60 * 24);
        }

        if (allowRegen) {
            const newKey = generateKey(31);

            await db.query(
                `UPDATE accounts
                 SET activation_key = $1, regens = regens + 1, last_regen_time = $2
                 WHERE id = $3`,
                [newKey, Math.floor(Date.now() / 1000), account_id]
            );

            await db.query('DELETE FROM menus WHERE account_id = $1', [account_id]);

            res.send(newKey);
        } else {
            res.send(account.activation_key);
        }

    } catch (error) {
        console.error('Regenerate error:', error.message);
        res.status(500).send('Error');
    }
});

/**
 * Generate Keys - Herramienta administrativa
 */
app.get('/api/generate-keys', async (req, res) => {
    res.setHeader('Content-Type', 'text/plain');

    const count = parseInt(req.query.count) || 10;
    const privilege = parseInt(req.query.privilege) || 1;

    let output = `Generando ${count} license keys (Privilege: ${privilege})...\n\n`;

    try {
        for (let i = 0; i < count; i++) {
            const key = generateKey(30);

            await db.query(
                'INSERT INTO license_keys (key, privilege, created) VALUES ($1, $2, $3)',
                [key, privilege, Math.floor(Date.now() / 1000)]
            );

            output += `Key ${i + 1}: ${key}\n`;
        }

        output += '\n¡Keys generadas exitosamente!\n';
        res.send(output);

    } catch (error) {
        console.error('Generate keys error:', error.message);
        res.status(500).send('Error generating keys');
    }
});

// ============================================
// UTILIDAD CRC32
// ============================================
function crc32(str) {
    let crc = 0 ^ (-1);
    for (let i = 0; i < str.length; i++) {
        crc = (crc >>> 8) ^ 0xedb88320;
    }
    return (crc ^ (-1)) >>> 0;
}

// ============================================
// INICIAR SERVIDOR
// ============================================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 YimMenu Auth Server running on port ${PORT}`);
    console.log(`📡 Health: http://localhost:${PORT}/health`);
    console.log(`🔑 Heartbeat: http://localhost:${PORT}/api/heartbeat`);
});
