# 🚀 YimMenu Authentication System v2.0

Sistema de autenticación mejorado para YimMenu con seguridad reforzada, listo para production en Railway.app.

## 🔐 Mejoras de Seguridad Implementadas (v2.0)

| Mejora | Descripción | Estado |
|--------|-------------|--------|
| **Crypto RandomBytes** | Generación criptográficamente segura de keys | ✅ |
| **Bcrypt** | Hash para activation keys | ✅ |
| **Rate Limiting** | Límite de peticiones por IP/usuario | ✅ |
| **Joi Validation** | Validación estricta de inputs | ✅ |
| **Winston Logger** | Logging estructurado por niveles | ✅ |
| **CRC32 Nativo** | Usando zlib en lugar de manual | ✅ |
| **Graceful Shutdown** | Cierre adecuado de conexiones | ✅ |
| **Cliente C++** | Servicio de autenticación nativo | ✅ |

## 📁 Estructura del Proyecto

```
YimMenu/
├── src/
│   ├── services/
│   │   └── auth/                    # Nuevo: Servicio de autenticación C++
│   │       ├── auth_service.hpp
│   │       └── auth_service.cpp
│   ├── http_client/
│   │   ├── http_client.hpp
│   │   └── http_client.cpp
│   └── ...
├── server.js                        # Servidor Node.js (Enhanced)
├── package.json                     # Dependencias actualizadas
├── database.sql                     # Script PostgreSQL
├── .env.example                     # Variables de entorno
├── scripts/
│   └── init-database.js             # Script de inicialización
└── README.md
```

## 🚀 Deploy en Railway

### 1. Sube a GitHub
```bash
git init
git add .
git commit -m "YimMenu Auth v2.0 - Enhanced Security"
git push
```

### 2. Conecta en Railway
- railway.app → New Project → Deploy from GitHub
- Selecciona tu repositorio

### 3. Agrega PostgreSQL
- New → Database → PostgreSQL

### 4. Configura Variables
```bash
DATABASE_URL=postgresql://...  # Auto-agregado por Railway
PORT=3000
NODE_ENV=production
BCRYPT_SALT_ROUNDS=10
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
REGENERATE_LIMIT_WINDOW_MS=3600000
REGENERATE_MAX_REQUESTS=5
LOG_LEVEL=info
API_URL=https://tu-proyecto.up.railway.app
```

### 5. Inicializa Base de Datos
```bash
# Opción 1: Usando script
npm run setup

# Opción 2: Manual en Railway CLI
psql $DATABASE_URL -f database.sql
```

## 🔗 Endpoints de la API

| Endpoint | Método | Descripción | Rate Limit |
|----------|--------|-------------|------------|
| `/health` | GET | Health check | General |
| `/api/heartbeat` | POST | Autenticación principal | 100/15min |
| `/api/redeem` | POST | Canjear license key | 100/15min |
| `/api/regenerate` | POST | Regenerar activation key | 5/60min |
| `/api/generate-keys` | GET | Generar keys (admin) | 10/60min |

## 📖 Ejemplos de Uso

### Health Check
```bash
curl http://localhost:3000/health
```

### Generar Keys (Admin)
```bash
curl "http://localhost:3000/api/generate-keys?count=10&privilege=2"
```

### Canjear License Key
```bash
curl -X POST http://localhost:3000/api/redeem \
  -H "Content-Type: application/json" \
  -d '{"license_key": "abc123..."}'
```

### Heartbeat (Autenticación)
```bash
curl -X POST http://localhost:3000/api/heartbeat \
  -H "Content-Type: application/json" \
  -d '{
    "v": "4.0.0",
    "a": "activation_key_aqui",
    "x": 1234567890,
    "i": "identity",
    "h": "hwid",
    "l": "es",
    "s": "session_id"
  }'
```

## 💻 Uso desde C++ (Cliente YimMenu)

### Inicializar Servicio
```cpp
#include "services/auth/auth_service.hpp"

// El servicio se inicializa automáticamente
// Configurar URL de la API
g_auth_service->set_api_url("https://tu-api.up.railway.app");
```

### Heartbeat (Autenticación)
```cpp
auto status = g_auth_service->heartbeat(
    "4.0.0",              // Versión
    "activation_key",     // Activation key (31 chars)
    "CLIENT_ID",          // Identity (max 14 chars)
    "HWID123456789",      // HWID (max 16 chars)
    "es",                 // Idioma
    "session_abc"         // Session ID (opcional)
);

if (status.result == auth_result::SUCCESS)
{
    LOG(INFO) << "Autenticación exitosa: " << status.data->root_name;
    LOG(INFO) << "Signature: " << status.data->signature;
    LOG(INFO) << "Unlocks: " << status.data->unlocks;
}
else if (status.result == auth_result::SUSPENDED)
{
    LOG(WARNING) << "Cuenta suspendida: " << status.message;
}
else if (status.result == auth_result::INVALID_KEY)
{
    LOG(WARNING) << "Key inválida";
}
```

### Canjear License Key
```cpp
auto response = g_auth_service->redeem("license_key_de_30_chars");

if (response.has_value())
{
    LOG(INFO) << "Cuenta creada exitosamente";
    LOG(INFO) << "Account ID: " << response->account_id;
    LOG(INFO) << "Activation Key: " << response->activation_key;
    LOG(INFO) << "Privilege: " << response->privilege;
}
else
{
    LOG(ERROR) << "Error al canjear license key";
}
```

### Regenerar Activation Key
```cpp
auto new_key = g_auth_service->regenerate("account_id_de_31_chars");

if (new_key.has_value())
{
    LOG(INFO) << "Nueva activation key: " << new_key.value();
}
else
{
    LOG(ERROR) << "Error al regenerar key";
}
```

### Health Check
```cpp
if (g_auth_service->health_check())
{
    LOG(INFO) << "Servidor de autenticación disponible";
}
else
{
    LOG(WARNING) << "Servidor no disponible";
}
```

## 🛠️ Desarrollo Local

### Instalación
```bash
# Clonar repositorio
git clone <repo>
cd YimMenu

# Instalar dependencias Node.js
npm install

# Copiar variables de entorno
cp .env.example .env
# Editar .env con tu DATABASE_URL

# Inicializar base de datos
npm run setup

# Iniciar servidor
npm run dev
```

### Comandos Disponibles
```bash
npm run start     # Producción
npm run dev       # Desarrollo con nodemon
npm run setup     # Inicializar base de datos
```

### Compilar Cliente C++
```bash
# Requiere CMake y Visual Studio 2022
mkdir build
cd build
cmake ..
cmake --build . --config Release
```

## 📊 Privilegios

| ID | Nombre | Descripción |
|----|--------|-------------|
| 1 | Basic | Acceso básico |
| 2 | Regular | Acceso completo |
| 3 | Ultimate | Acceso total + features beta |

## 🔒 Seguridad Detallada

### Generación de Keys
```javascript
// ANTES (inseguro)
result += chars[Math.floor(Math.random() * chars.length)];

// AHORA (criptográficamente seguro)
const randomBytes = crypto.randomBytes(length);
result += chars[randomBytes[i] % charsLength];
```

### Rate Limiting
- **General**: 100 peticiones cada 15 minutos por IP
- **Regenerate**: 5 peticiones cada 60 minutos por cuenta
- **Generate Keys**: 10 peticiones cada 60 minutos por IP

### Logging
Los logs se guardan en:
- `logs/error.log` - Solo errores
- `logs/combined.log` - Todos los eventos

Niveles: `error`, `warn`, `info`, `debug`

## 📦 Dependencias Node.js

```json
{
  "bcrypt": "^5.1.1",
  "joi": "^17.11.0",
  "express-rate-limit": "^7.1.5",
  "uuid": "^9.0.1",
  "winston": "^3.11.0"
}
```

## 🏗️ Arquitectura del Cliente C++

```
src/services/auth/
├── auth_service.hpp    # Interfaz pública
└── auth_service.cpp    # Implementación

Características:
- ✅ Tipado fuerte con structs
- ✅ Manejo de errores con enum class
- ✅ std::optional para valores opcionales
- ✅ Logging integrado
- ✅ Timeouts configurables
- ✅ Validación de entrada
```

## 🧪 Testing

### Probar Rate Limiting
```bash
for i in {1..110}; do
  curl http://localhost:3000/health &
done
```

### Ver Logs
```bash
tail -f logs/combined.log
```

## 📝 Changelog

### v2.0.0 - Enhanced Security
- ✅ Crypto randomBytes para generación de keys
- ✅ Rate limiting explícito con express-rate-limit
- ✅ Validación con Joi schemas
- ✅ Logging estructurado con Winston
- ✅ CRC32 con zlib nativo
- ✅ Graceful shutdown
- ✅ Cliente de autenticación en C++
- ✅ Mejoras en manejo de errores
- ✅ Documentación completa

### v1.0.0 - Initial Release
- Sistema básico de autenticación

## ⚠️ Consideraciones Importantes

1. **DATABASE_URL**: Usar PostgreSQL (no MySQL)
2. **RSA_PRIVATE_KEY**: Opcional, solo para signing
3. **BCRYPT_SALT_ROUNDS**: 10-12 producción, 8 desarrollo
4. **NODE_ENV**: `production` en Railway
5. **C++ Client**: Requiere nlohmann/json y cpr

## 📞 Soporte

- Railway: https://docs.railway.app
- Node.js: https://nodejs.org/docs
- Express: https://expressjs.com
- Issues: GitHub repo

---

**¡Listo para producción con seguridad mejorada! 🎉**
