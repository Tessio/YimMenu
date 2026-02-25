#pragma once
#include "core/enums.hpp"
#include "http_client/http_client.hpp"
#include "util/math.hpp"

#include <nlohmann/json.hpp>
#include <string>
#include <optional>

namespace big
{
    // ============================================
    // ESTRUCTURAS DE DATOS
    // ============================================
    
    struct heartbeat_response
    {
        std::string signature;      // s: firma de privilegios
        int unlocks;                // u: bitmask de desbloqueos
        std::string root_name;      // r: nombre de edición
        int64_t timestamp;          // a: timestamp
        std::optional<uint32_t> session_data;  // d: datos de sesión (opcional)
        std::optional<std::vector<std::string>> peers;  // p: peers en sesión (opcional)
    };

    struct redeem_response
    {
        bool success;
        std::string account_id;
        std::string activation_key;
        int privilege;
    };

    struct auth_error
    {
        std::string message;
        std::string details;
    };

    // ============================================
    // TIPOS DE RESPUESTA
    // ============================================
    
    enum class auth_result : int
    {
        SUCCESS = 0,
        INVALID_KEY = 1,
        SUSPENDED = 2,
        SHARE = 3,
        NETWORK_ERROR = 4,
        SERVER_ERROR = 5,
        VALIDATION_ERROR = 6
    };

    struct auth_status
    {
        auth_result result;
        std::string message;
        std::optional<heartbeat_response> data;
    };

    // ============================================
    // SERVICIO DE AUTENTICACIÓN
    // ============================================
    
    class auth_service
    {
    public:
        auth_service();
        ~auth_service();

        // ============================================
        // MÉTODOS PÚBLICOS
        // ============================================

        /**
         * @brief Realiza un heartbeat para autenticar el cliente
         * @param version Versión del cliente (ej: "4.0.0")
         * @param activation_key Clave de activación
         * @param identity Identidad del cliente (max 14 chars)
         * @param hwid HWID del hardware (max 16 chars)
         * @param language Idioma del cliente
         * @param session_id ID de sesión (opcional)
         * @return Estado de la autenticación
         */
        auth_status heartbeat(
            const std::string& version,
            const std::string& activation_key,
            const std::string& identity,
            const std::string& hwid,
            const std::string& language,
            const std::string& session_id = ""
        );

        /**
         * @brief Canjea una license key por una cuenta
         * @param license_key Clave de licencia (30 chars)
         * @return Resultado del canje
         */
        std::optional<redeem_response> redeem(const std::string& license_key);

        /**
         * @brief Regenera una activation key
         * @param account_id ID de la cuenta (31 chars)
         * @return Nueva activation key o nullptr si falla
         */
        std::optional<std::string> regenerate(const std::string& account_id);

        /**
         * @brief Verifica el estado del servidor
         * @return true si el servidor está disponible
         */
        bool health_check();

        // ============================================
        // CONFIGURACIÓN
        // ============================================

        /**
         * @brief Establece la URL base de la API
         * @param url URL del servidor
         */
        void set_api_url(const std::string& url);

        /**
         * @brief Obtiene la URL actual de la API
         * @return URL del servidor
         */
        std::string get_api_url() const;

    private:
        // ============================================
        // MÉTODOS PRIVADOS
        // ============================================

        /**
         * @brief Genera un timestamp futuro para expiración
         * @param hours Horas a sumar (default: 48)
         * @return Timestamp Unix
         */
        int64_t generate_expiry_timestamp(int hours = 48);

        /**
         * @brief Valida una respuesta de heartbeat
         * @param json Datos JSON a validar
         * @return true si es válido
         */
        bool validate_heartbeat_response(const nlohmann::json& json);

        /**
         * @brief Parsea una respuesta de heartbeat
         * @param json Datos JSON
         * @return Estructura heartbeat_response
         */
        heartbeat_response parse_heartbeat_response(const nlohmann::json& json);

        // ============================================
        // MIEMBROS
        // ============================================
        
        std::string m_api_url;
        http_client& m_http_client;
    };

    // ============================================
    // INSTANCIA GLOBAL
    // ============================================
    
    inline auth_service* g_auth_service = nullptr;
}
