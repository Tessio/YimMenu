# 📘 Guía de Integración - Auth Service YimMenu

Esta guía muestra cómo integrar el nuevo servicio de autenticación en el código base de YimMenu.

---

## 📋 Requisitos Previos

### Dependencias C++

Asegúrate de tener estas dependencias en tu `CMakeLists.txt`:

```cmake
# nlohmann/json (ya incluido en YimMenu)
find_package(nlohmann_json CONFIG REQUIRED)

# cpr (ya incluido en YimMenu)
find_package(cpr CONFIG REQUIRED)
```

---

## 🔧 Paso 1: Agregar Archivos al Proyecto

### 1.1 Copiar Archivos

Coloca los archivos en la carpeta `src/services/auth/`:

```
src/services/auth/
├── auth_service.hpp
└── auth_service.cpp
```

### 1.2 Actualizar CMakeLists.txt

Agrega los nuevos archivos al `CMakeLists.txt`:

```cmake
target_sources(YimMenu PRIVATE
    # ... otros archivos ...
    
    # Auth Service
    src/services/auth/auth_service.hpp
    src/services/auth/auth_service.cpp
)
```

---

## 💻 Paso 2: Inicializar el Servicio

### 2.1 En el Código de Inicialización

Busca donde se inicializan los servicios (probablemente en `main.cpp` o `gui.cpp`):

```cpp
#include "services/auth/auth_service.hpp"

// En tu función de inicialización
void initialize_services()
{
    // ... otros servicios ...
    
    // Inicializar servicio de autenticación
    // (se auto-inicializa en el constructor)
    
    // Configurar URL de la API
    g_auth_service->set_api_url("https://tu-api.up.railway.app");
    
    LOG(INFO) << "Auth service initialized";
}
```

### 2.2 URL desde Configuración

Opcionalmente, guarda la URL en un archivo de configuración:

```cpp
// En tu clase de configuración
std::string auth_api_url = "https://tu-api.up.railway.app";

// Al inicializar
g_auth_service->set_api_url(g_config->auth_api_url);
```

---

## 🚀 Paso 3: Implementar Autenticación

### 3.1 Ejemplo: Ventana de Login

Crea una ventana de login en `src/views/`:

```cpp
// src/views/auth_window.cpp
#include "views/auth_window.hpp"
#include "services/auth/auth_service.hpp"
#include "util/string.hpp"

namespace big
{
    void auth_window::render()
    {
        ImGui::Begin("YimMenu Authentication", nullptr, ImGuiWindowFlags_AlwaysAutoResize);
        
        static char activation_key[64] = "";
        static char hwid[64] = "";
        static std::string auth_status = "";
        static ImVec4 status_color = ImVec4(1, 1, 1, 1);
        
        ImGui::Text("Activation Key (31 chars):");
        ImGui::InputText("##activation_key", activation_key, sizeof(activation_key));
        
        ImGui::Text("HWID (max 16 chars):");
        ImGui::InputText("##hwid", hwid, sizeof(hwid));
        
        if (ImGui::Button("Authenticate"))
        {
            // Generar identity única
            std::string identity = "CLIENT_" + std::to_string(GetTickCount());
            identity = identity.substr(0, 14);
            
            // Realizar heartbeat
            auto status = g_auth_service->heartbeat(
                "4.0.0",              // Versión
                std::string(activation_key),
                identity,
                std::string(hwid),
                "es"                  // Idioma
            );
            
            // Manejar respuesta
            if (status.result == auth_result::SUCCESS)
            {
                auth_status = "✅ " + status.message;
                status_color = ImVec4(0, 1, 0, 1);  // Verde
                
                // Guardar datos de sesión
                g_config->activation_key = activation_key;
                g_config->hwid = hwid;
                
                LOG(INFO) << "Authentication success: " << status.data->root_name;
            }
            else if (status.result == auth_result::INVALID_KEY)
            {
                auth_status = "❌ " + status.message;
                status_color = ImVec4(1, 0, 0, 1);  // Rojo
                LOG(WARNING) << "Authentication failed: Invalid key";
            }
            else if (status.result == auth_result::SUSPENDED)
            {
                auth_status = "⚠️ " + status.message;
                status_color = ImVec4(1, 0.5, 0, 1);  // Naranja
                LOG(WARNING) << "Account suspended";
            }
            else
            {
                auth_status = "❌ Error: " + status.message;
                status_color = ImVec4(1, 0, 0, 1);
                LOG(WARNING) << "Authentication error: " << status.message;
            }
        }
        
        // Mostrar estado
        if (!auth_status.empty())
        {
            ImGui::SameLine();
            ImGui::TextColored(status_color, "%s", auth_status.c_str());
        }
        
        ImGui::End();
    }
}
```

---

## 🔄 Paso 4: Heartbeat Periódico

### 4.1 Timer de Heartbeat

Implementa un heartbeat periódico para mantener la sesión activa:

```cpp
// En tu clase principal o script
class session_manager
{
private:
    std::chrono::steady_clock::time_point m_last_heartbeat;
    std::string m_activation_key;
    std::string m_hwid;
    std::string m_session_id;
    
public:
    void update()
    {
        // Verificar si es tiempo de hacer heartbeat (cada 5 minutos)
        auto now = std::chrono::steady_clock::now();
        auto elapsed = std::chrono::duration_cast<std::chrono::minutes>(now - m_last_heartbeat);
        
        if (elapsed.count() >= 5 && !m_activation_key.empty())
        {
            perform_heartbeat();
            m_last_heartbeat = now;
        }
    }
    
    void perform_heartbeat()
    {
        std::string identity = "YIMMENU_" + std::to_string(GetTickCount());
        identity = identity.substr(0, 14);
        
        auto status = g_auth_service->heartbeat(
            "4.0.0",
            m_activation_key,
            identity,
            m_hwid,
            "es",
            m_session_id
        );
        
        if (status.result == auth_result::SUCCESS)
        {
            LOG(INFO) << "Heartbeat OK: " << status.data->root_name;
            
            // Actualizar session_id si cambió
            if (status.data->session_data.has_value())
            {
                // Usar session_data para algo
            }
        }
        else if (status.result == auth_result::INVALID_KEY ||
                 status.result == auth_result::SUSPENDED)
        {
            LOG(WARNING) << "Session invalid: " << status.message;
            // Desactivar features del menú
        }
        else
        {
            LOG(WARNING) << "Heartbeat failed, will retry";
        }
    }
};
```

---

## 🎁 Paso 5: Canjear License Key

### 5.1 Ventana de Redeem

```cpp
// En tu ventana de configuración
void render_license_redeem()
{
    static char license_key[64] = "";
    
    ImGui::Text("License Key:");
    ImGui::InputText("##license_key", license_key, sizeof(license_key));
    
    if (ImGui::Button("Canjear"))
    {
        auto response = g_auth_service->redeem(license_key);
        
        if (response.has_value())
        {
            LOG(INFO) << "License redeemed successfully!";
            LOG(INFO) << "Account ID: " << response->account_id;
            LOG(INFO) << "Activation Key: " << response->activation_key;
            LOG(INFO) << "Privilege: " << response->privilege;
            
            // Guardar credentials
            g_config->activation_key = response->activation_key;
            g_config->account_id = response->account_id;
            g_config->privilege = response->privilege;
            
            // Mostrar notificación
            g_notification_service.push_success("License", "Key canjeada exitosamente!");
        }
        else
        {
            LOG(WARNING) << "Failed to redeem license key";
            g_notification_service.push_error("License", "Key inválida o ya usada");
        }
    }
}
```

---

## 🔐 Paso 6: Manejo de Errores

### 6.1 Switch para Todos los Casos

```cpp
auto status = g_auth_service->heartbeat(...);

switch (status.result)
{
    case auth_result::SUCCESS:
        // Todo OK
        break;
        
    case auth_result::INVALID_KEY:
        // Key inválida - pedir al usuario que verifique
        break;
        
    case auth_result::SUSPENDED:
        // Cuenta suspendida - mostrar razón
        break;
        
    case auth_result::SHARE:
        // Account sharing detectado
        break;
        
    case auth_result::NETWORK_ERROR:
        // Error de red - reintentar
        break;
        
    case auth_result::SERVER_ERROR:
        // Error del servidor - reintentar
        break;
        
    case auth_result::VALIDATION_ERROR:
        // Error de validación local
        break;
        
    default:
        // Caso no manejado
        break;
}
```

---

## 📊 Paso 7: Ver Estado del Servidor

### 7.1 Health Check al Iniciar

```cpp
// En initialize_services()
if (g_auth_service->health_check())
{
    LOG(INFO) << "Auth server is online";
}
else
{
    LOG(WARNING) << "Auth server is offline, some features may be limited";
}
```

---

## 🎯 Paso 8: Integración con Features Existentes

### 8.1 Verificar Privilegios

```cpp
// Antes de ejecutar cierta feature
if (g_config->privilege >= 2)  // Requiere Regular o superior
{
    // Ejecutar feature premium
}
else
{
    g_notification_service.push_warning("Privilege", "Requires Regular privilege");
}
```

### 8.2 Guardar Credentials

```cpp
// En settings.hpp
struct settings
{
    // ... otros campos ...
    
    std::string activation_key;
    std::string account_id;
    std::string hwid;
    int privilege = 1;
    std::string api_url = "https://tu-api.up.railway.app";
};

// En settings.cpp - cargar al iniciar
void settings::load()
{
    // ... cargar otros settings ...
    
    m_auth.api_url = json.value("api_url", "https://tu-api.up.railway.app");
    
    // Inicializar servicio con URL guardada
    g_auth_service->set_api_url(m_auth.api_url);
}
```

---

## 🧪 Paso 9: Testing

### 9.1 Comandos de Consola

Agrega comandos para testing:

```cpp
// En tu sistema de comandos
command::register_command("auth_test", []() {
    auto status = g_auth_service->health_check();
    LOG(INFO) << "Auth server: " << (status ? "Online" : "Offline");
});

command::register_command("auth_heartbeat", []() {
    auto status = g_auth_service->heartbeat(
        "4.0.0",
        g_config->activation_key,
        "TEST_ID",
        g_config->hwid,
        "es"
    );
    
    if (status.result == auth_result::SUCCESS)
    {
        LOG(INFO) << "Heartbeat OK: " << status.data->root_name;
    }
    else
    {
        LOG(WARNING) << "Heartbeat failed: " << status.message;
    }
});
```

---

## 📝 Checklist de Integración

- [ ] Archivos copiados a `src/services/auth/`
- [ ] `CMakeLists.txt` actualizado
- [ ] Servicio inicializado en `main.cpp`
- [ ] URL de API configurada
- [ ] Ventana de login implementada
- [ ] Heartbeat periódico configurado
- [ ] Manejo de errores implementado
- [ ] Credentials guardados en config
- [ ] Testing completado

---

## ⚠️ Consideraciones Importantes

1. **Thread Safety:** El servicio usa el http_client global que ya es thread-safe
2. **Logging:** Todos los eventos se loguean automáticamente
3. **Errores de Red:** Implementa reintentos con backoff exponencial
4. **Seguridad:** Nunca loguees activation keys completas
5. **Performance:** El heartbeat no debe bloquear el hilo principal

---

## 📞 Soporte

Si encuentras problemas:

1. Revisa los logs en `logs/combined.log`
2. Verifica que la URL de la API sea correcta
3. Asegúrate de que el servidor esté online
4. Revisa que las dependencias estén instaladas

---

**Documento creado:** 2026-02-25  
**Versión:** 1.0.0
