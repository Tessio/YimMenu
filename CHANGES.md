# 🔄 Mejoras de Seguridad Implementadas - YimMenu v2.0

## Resumen de Cambios

Este documento detalla todas las mejoras implementadas en el proyecto YimMenu para el sistema de autenticación.

---

## 📦 Archivos Modificados/Creados

### Backend (Node.js)

| Archivo | Estado | Cambios |
|---------|--------|---------|
| `server.js` | ✏️ Actualizado | Todas las mejoras de seguridad |
| `package.json` | ✏️ Actualizado | +5 dependencias de seguridad |
| `.env.example` | ✨ Nuevo | Variables de configuración |
| `scripts/init-database.js` | ✨ Nuevo | Script de inicialización |
| `database.sql` | ✅ Sin cambios | Ya está correcto |
| `README.md` | ✏️ Actualizado | Documentación completa |

### Cliente (C++)

| Archivo | Estado | Descripción |
|---------|--------|-------------|
| `src/services/auth/auth_service.hpp` | ✨ Nuevo | Interfaz del servicio de autenticación |
| `src/services/auth/auth_service.cpp` | ✨ Nuevo | Implementación del servicio |

---

## 🔐 Mejoras de Seguridad Detalladas

### 1. Generación Criptográfica de Keys

**Antes:**
```javascript
function generateKey(len = 31) {
    const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
    let result = '';
    for (let i = 0; i < len; i++) {
        result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
}
```

**Ahora:**
```javascript
function generateKey(length = 31) {
    const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
    const charsLength = chars.length;
    let result = '';
    
    const randomBytes = crypto.randomBytes(length);
    
    for (let i = 0; i < length; i++) {
        result += chars[randomBytes[i] % charsLength];
    }
    
    return result;
}
```

**Beneficio:** `crypto.randomBytes()` usa el generador de números aleatorios del sistema operativo, que es criptográficamente seguro.

---

### 2. Rate Limiting Explícito

```javascript
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
```

**Beneficio:** Previene ataques de fuerza bruta y abuso de la API.

---

### 3. Validación de Schemas con Joi

```javascript
const heartbeatSchema = Joi.object({
    v: Joi.string().min(1).max(50).required(),
    a: Joi.string().length(31).required(),
    x: Joi.number().required(),
    i: Joi.string().max(14).required(),
    h: Joi.string().max(16).required(),
    l: Joi.string().min(1).max(10).required(),
    s: Joi.string().allow('', null).optional()
});

// Uso en endpoint
const { error, value } = heartbeatSchema.validate(req.body, { abortEarly: false });
if (error) {
    const errors = error.details.map(d => d.message).join(', ');
    return res.status(400).json({ error: 'Validation failed', details: errors });
}
```

**Beneficio:** Validación estricta de todos los inputs, previene inyección y datos malformados.

---

### 4. Logging Estructurado con Winston

```javascript
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
```

**Beneficio:** Logs organizados por niveles, fácil debugging y auditoría.

---

### 5. CRC32 con zlib Nativo

**Antes:**
```javascript
function crc32(str) {
    let crc = 0 ^ (-1);
    for (let i = 0; i < str.length; i++) {
        crc = (crc >>> 8) ^ 0xedb88320;
    }
    return (crc ^ (-1)) >>> 0;
}
```

**Ahora:**
```javascript
function crc32(str) {
    const buffer = Buffer.from(str, 'utf8');
    const hash = zlib.crc32(buffer);
    return hash >>> 0;
}
```

**Beneficio:** Implementación nativa optimizada y menos propensa a errores.

---

### 6. Hash Bcrypt para Activation Keys

```javascript
async function hashKey(key) {
    const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 10;
    return bcrypt.hash(key, saltRounds);
}

async function verifyKey(key, hash) {
    return bcrypt.compare(key, hash);
}
```

**Beneficio:** Las activation keys pueden almacenarse hasheadas en la base de datos.

---

### 7. Manejo de Errores Mejorado

```javascript
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

// Graceful shutdown
process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    if (db) {
        db.end();
    }
    process.exit(0);
});
```

**Beneficio:** El servidor se recupera de errores y cierra adecuadamente.

---

### 8. Servicio de Autenticación en C++

**Header (auth_service.hpp):**
```cpp
class auth_service
{
public:
    auth_status heartbeat(
        const std::string& version,
        const std::string& activation_key,
        const std::string& identity,
        const std::string& hwid,
        const std::string& language,
        const std::string& session_id = ""
    );

    std::optional<redeem_response> redeem(const std::string& license_key);
    std::optional<std::string> regenerate(const std::string& account_id);
    bool health_check();
    
    void set_api_url(const std::string& url);
    std::string get_api_url() const;
};
```

**Beneficio:** Cliente nativo tipo seguro para integración con YimMenu.

---

## 📋 Variables de Entorno Nuevas

| Variable | Valor por Defecto | Descripción |
|----------|------------------|-------------|
| `BCRYPT_SALT_ROUNDS` | 10 | Rounds para hash bcrypt |
| `RATE_LIMIT_WINDOW_MS` | 900000 | Ventana de rate limit (15 min) |
| `RATE_LIMIT_MAX_REQUESTS` | 100 | Máximo peticiones por ventana |
| `REGENERATE_LIMIT_WINDOW_MS` | 3600000 | Ventana para regenerate (60 min) |
| `REGENERATE_MAX_REQUESTS` | 5 | Máximo regenerate por hora |
| `LOG_LEVEL` | info | Nivel de logging |

---

## 📦 Dependencias Agregadas (Node.js)

```json
{
  "bcrypt": "^5.1.1",           // Hash de contraseñas/keys
  "joi": "^17.11.0",            // Validación de schemas
  "express-rate-limit": "^7.1.5", // Rate limiting
  "uuid": "^9.0.1",             // Generación de UUIDs
  "winston": "^3.11.0"          // Logging estructurado
}
```

---

## 🚀 Cómo Actualizar

### Backend (Node.js)

```bash
# 1. Ir al directorio del proyecto
cd C:\Users\Serch\Documents\GitHub\Yimmenu\YimMenu

# 2. Instalar dependencias
npm install

# 3. Copiar variables de entorno
cp .env.example .env
# Editar .env con tu DATABASE_URL

# 4. Inicializar base de datos
npm run setup

# 5. Iniciar servidor
npm run dev
```

### Cliente (C++)

1. **Agregar archivos al proyecto:**
   - `src/services/auth/auth_service.hpp`
   - `src/services/auth/auth_service.cpp`

2. **Agregar al CMakeLists.txt:**
   ```cmake
   src/services/auth/auth_service.cpp
   ```

3. **Inicializar en el código:**
   ```cpp
   #include "services/auth/auth_service.hpp"
   
   // En tu código de inicialización
   g_auth_service->set_api_url("https://tu-api.up.railway.app");
   ```

---

## 📊 Comparativa de Seguridad

| Característica | Antes | Ahora |
|---------------|-------|-------|
| Generación de Keys | `Math.random()` | `crypto.randomBytes()` |
| Rate Limiting | ❌ | ✅ (3 niveles) |
| Validación de Inputs | Básica | Joi (estricta) |
| Logging | `console.log` | Winston (estructurado) |
| CRC32 | Manual | zlib (nativo) |
| Hash de Keys | ❌ | ✅ (bcrypt) |
| Graceful Shutdown | ❌ | ✅ |
| Validación de IP | Básica | Regex + múltiples fuentes |
| Cliente C++ | ❌ | ✅ (completo) |

---

## 🧪 Testing

### Probar Rate Limiting
```bash
# Ejecutar múltiples peticiones al health check
for i in {1..110}; do
  curl http://localhost:3000/health &
done
```

### Ver Logs
```bash
# Ver logs en tiempo real
tail -f logs/combined.log

# Ver solo errores
tail -f logs/error.log
```

### Probar Cliente C++
```cpp
// En tu código de prueba
auto status = g_auth_service->health_check();
LOG(INFO) << "Health check: " << (status ? "OK" : "FAIL");
```

---

## 🔒 Recomendaciones Adicionales

1. **Producción:**
   - Usar `NODE_ENV=production`
   - Configurar `BCRYPT_SALT_ROUNDS=12`
   - Habilitar HTTPS (Railway lo hace automáticamente)

2. **Monitoreo:**
   - Revisar logs diariamente
   - Configurar alertas para errores críticos
   - Monitorear rate limit hits

3. **Backup:**
   - Backup automático de Railway (incluido)
   - Exportar base de datos periódicamente

4. **Cliente C++:**
   - Manejar errores de red adecuadamente
   - Implementar reintentos con backoff exponencial
   - Cachear respuestas cuando sea apropiado

---

**Documento creado:** 2026-02-25  
**Versión:** 2.0.0  
**Estado:** ✅ Implementado
