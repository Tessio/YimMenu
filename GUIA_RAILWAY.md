# 🚂 Implementación en Railway.app

## 📋 ¿Qué es Railway?

Railway es una plataforma cloud moderna que te permite desplegar aplicaciones Node.js, Python, Go, etc. de forma automática desde GitHub.

**Ventajas:**
- ✅ Gratis para empezar ($5 crédito inicial)
- ✅ MySQL incluido como add-on
- ✅ Deploy automático desde GitHub
- ✅ HTTPS automático
- ✅ Sin configuración de servidores

---

## 🚀 Paso a Paso (15 minutos)

### **Paso 1: Crear Cuenta en Railway**

1. Ve a [railway.app](https://railway.app)
2. Click en "Start a New Project"
3. Inicia sesión con GitHub (recomendado) o email

### **Paso 2: Crear Nuevo Proyecto**

1. Click en **"New Project"**
2. Selecciona **"Deploy from GitHub repo"**
3. Conecta tu repositorio de GitHub (o crea uno nuevo)

### **Paso 3: Subir el Código**

Crea un repositorio en GitHub y sube los archivos de `yimmenu_railway/`:

```bash
cd yimmenu_railway
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/yimmenu-auth.git
git push -u origin main
```

### **Paso 4: Agregar Base de Datos MySQL**

1. En tu proyecto de Railway, click en **"New"**
2. Selecciona **"Database"** → **"Add MySQL"**
3. Railway creará automáticamente una base de datos MySQL

### **Paso 5: Configurar Variables de Entorno**

1. Click en tu servicio (el que dice "yimmenu-auth")
2. Ve a la pestaña **"Variables"**
3. Agrega estas variables:

```
DATABASE_URL=mysql://root:password@mysql.railway.internal:3306/railway
DB_HOST=mysql.railway.internal
DB_USER=root
DB_PASSWORD=tu_password_aqui
DB_NAME=railway
PORT=3000
NODE_ENV=production
```

**Nota:** Railway automáticamente agrega `DATABASE_URL` cuando creas el MySQL add-on. ¡Úsala!

### **Paso 6: Ejecutar Script SQL**

1. En Railway, ve a tu MySQL database
2. Click en **"Connect"** → **"MySQL CLI"**
3. Copia y pega el contenido de `database.sql`
4. Ejecuta el script

O usa un cliente MySQL local:

```bash
mysql -h gateway.railway.app -u root -p railway < database.sql
```

(Railway te da el host, usuario y password en la página del MySQL add-on)

### **Paso 7: Verificar Deploy**

1. Railway automáticamente detectará el `package.json` y hará deploy
2. Ve a la pestaña **"Deployments"** para ver el progreso
3. Cuando diga "SUCCESS", tu API está lista!

### **Paso 8: Obtener URL Pública**

1. Ve a la pestaña **"Settings"** de tu servicio
2. En **"Domains"**, click en **"Generate Domain"**
3. Copia la URL (ej: `yimmenu-auth-production.up.railway.app`)

---

## 🔧 Configurar el Cliente C++

En tu código YimMenu, actualiza el endpoint:

```cpp
Authentication::SetAPIEndpoint("https://yimmenu-auth-production.up.railway.app/api/heartbeat");
```

---

## 🎯 Generar Tus Primeras Keys

Abre en tu navegador:

```
https://yimmenu-auth-production.up.railway.app/api/generate-keys?count=10&privilege=2
```

Esto generará 10 license keys de privilegio Regular (2).

---

## 📊 Endpoints Disponibles

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/health` | GET | Verificar estado del servidor |
| `/api/heartbeat` | POST | Autenticación principal |
| `/api/redeem` | POST | Canjear license key |
| `/api/regenerate` | POST | Regenerar activation key |
| `/api/generate-keys` | GET | Generar license keys (admin) |

---

## 💰 Costos de Railway

### Plan Free:
- $5 crédito inicial (prueba)
- Después: $0.00023/GB-RAM/hora
- MySQL: 1GB gratis, luego $0.25/GB/mes

### Plan Pro ($5/mes):
- 100 horas de runtime gratis
- Ideal para proyectos pequeños

**Estimado para YimMenu:**
- 512MB RAM = ~$0.12/hora
- 24/7 = ~$86/mes (compartido con otros servicios)
- **Recomendación:** Usa el plan free al inicio

---

## 🔒 Seguridad

### 1. Habilitar HTTPS (Automático)
Railway ya tiene HTTPS activado por defecto.

### 2. Agregar RSA Signing (Opcional)
Genera keys RSA:

```bash
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -pubout -out public.pem
```

En Railway, agrega la variable:
```
RSA_PRIVATE_KEY=-----BEGIN RSA PRIVATE KEY-----
...contenido de private.pem...
-----END RSA PRIVATE KEY-----
```

### 3. Rate Limiting (Recomendado)
Agrega Cloudflare frente a Railway para proteger contra DDoS.

---

## 🛠️ Comandos Útiles

### Ver logs:
```bash
railway logs
```

### Reiniciar servicio:
```bash
railway restart
```

### Ver variables:
```bash
railway variables
```

### Conectar MySQL local:
```bash
railway connect
```

---

## ❓ Solución de Problemas

### ❌ "Build failed"
- Verifica que `package.json` esté en la raíz
- Revisa los logs en Railway
- Asegúrate de que `server.js` exista

### ❌ "Database connection failed"
- Verifica que `DATABASE_URL` esté configurado
- Asegúrate de haber ejecutado `database.sql`
- Revisa que el MySQL add-on esté activo

### ❌ "404 Not Found"
- Verifica la ruta del endpoint
- Asegúrate de usar `/api/heartbeat` no solo `/heartbeat`

### ❌ "Cannot find module 'express'"
- Ejecuta `npm install` localmente
- Asegúrate de que `package.json` tenga todas las dependencias

### ❌ El deploy es muy lento
- Railway free tier puede tener cold starts
- Considera upgrade a Pro si es crítico

---

## 📈 Monitoreo

### Railway Dashboard:
- Ve a railway.app para ver métricas
- RAM, CPU, requests por segundo

### Logs en tiempo real:
```bash
railway logs --follow
```

---

## 🎯 Próximos Pasos

1. **Personaliza** los privilegios en `server.js`
2. **Agrega autenticación** para `/api/generate-keys`
3. **Implementa** un dashboard web
4. **Configura** backups automáticos de MySQL
5. **Agrega** más endpoints según necesites

---

## 📞 Soporte

- **Railway Docs:** https://docs.railway.app
- **Railway Discord:** https://discord.gg/railway
- **Issues:** Abre un issue en tu repositorio

---

## ✅ Checklist Final

- [ ] Código subido a GitHub
- [ ] Proyecto creado en Railway
- [ ] MySQL add-on agregado
- [ ] Variables de entorno configuradas
- [ ] Script SQL ejecutado
- [ ] Deploy exitoso
- [ ] URL pública obtenida
- [ ] Cliente C++ actualizado
- [ ] Keys generadas
- [ ] Pruebas de autenticación exitosas

**¡Felicidades! Tu sistema de autenticación está en producción 🎉**
