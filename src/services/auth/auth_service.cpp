#include "auth_service.hpp"
#include "util/string.hpp"
#include "logger/exception_handler.hpp"

#include <nlohmann/json.hpp>
#include <chrono>

namespace big
{
    // ============================================
    // CONSTANTES
    // ============================================
    
    constexpr auto API_URL_DEFAULT = "http://localhost:3000";
    constexpr auto HEARTBEAT_TIMEOUT = 10000;  // 10 segundos
    constexpr auto REDEEM_TIMEOUT = 15000;     // 15 segundos
    constexpr auto REGENERATE_TIMEOUT = 10000; // 10 segundos

    // ============================================
    // CONSTRUCTOR / DESTRUCTOR
    // ============================================
    
    auth_service::auth_service() :
        m_api_url(API_URL_DEFAULT),
        m_http_client(g_http_client)
    {
        g_auth_service = this;
        LOG(INFO) << "[Auth Service] Initialized with default URL: " << API_URL_DEFAULT;
    }

    auth_service::~auth_service()
    {
        g_auth_service = nullptr;
        LOG(INFO) << "[Auth Service] Shutdown";
    }

    // ============================================
    // MÉTODOS PÚBLICOS
    // ============================================

    auth_status auth_service::heartbeat(
        const std::string& version,
        const std::string& activation_key,
        const std::string& identity,
        const std::string& hwid,
        const std::string& language,
        const std::string& session_id)
    {
        try
        {
            // Validaciones de entrada
            if (activation_key.empty() || activation_key.length() != 31)
            {
                return { auth_result::VALIDATION_ERROR, "Activation key inválida (debe tener 31 caracteres)" };
            }

            if (identity.empty() || identity.length() > 14)
            {
                return { auth_result::VALIDATION_ERROR, "Identity inválida (máximo 14 caracteres)" };
            }

            if (hwid.empty() || hwid.length() > 16)
            {
                return { auth_result::VALIDATION_ERROR, "HWID inválida (máximo 16 caracteres)" };
            }

            // Generar timestamp de expiración (48 horas)
            int64_t expiry_timestamp = generate_expiry_timestamp(48);

            // Construir payload JSON
            nlohmann::json payload = {
                {"v", version},
                {"a", activation_key},
                {"x", expiry_timestamp},
                {"i", identity},
                {"h", hwid},
                {"l", language}
            };

            // Agregar session_id si está presente
            if (!session_id.empty())
            {
                payload["s"] = session_id;
            }

            // Serializar a JSON string
            std::string body = payload.dump();

            // Realizar petición HTTP POST
            auto url = cpr::Url{ m_api_url + "/api/heartbeat" };
            auto headers = cpr::Header{
                {"Content-Type", "application/json"},
                {"User-Agent", "YimMenu-Client/2.0"}
            };
            auto cpr_body = cpr::Body{ body };
            auto timeout = cpr::Timeout{ HEARTBEAT_TIMEOUT };

            auto response = m_http_client.post(url, headers, cpr_body);
            
            // Configurar timeout manualmente en la sesión
            // (el cliente HTTP ya tiene timeout configurado)

            if (response.status_code == 0)
            {
                LOG(WARNING) << "[Auth Service] Heartbeat failed: Network error - " << response.error.message;
                return { auth_result::NETWORK_ERROR, "Error de conexión con el servidor" };
            }

            if (response.status_code >= 500)
            {
                LOG(WARNING) << "[Auth Service] Heartbeat failed: Server error - " << response.status_code;
                return { auth_result::SERVER_ERROR, "Error interno del servidor" };
            }

            // Parsear respuesta JSON
            nlohmann::json json_response;
            try
            {
                json_response = nlohmann::json::parse(response.text);
            }
            catch (const std::exception& e)
            {
                LOG(WARNING) << "[Auth Service] Heartbeat failed: Invalid JSON response - " << e.what();
                return { auth_result::SERVER_ERROR, "Respuesta inválida del servidor" };
            }

            // Verificar tipo de respuesta
            if (json_response.contains("t"))
            {
                std::string type = json_response["t"];
                std::string message = json_response.value("m", "");

                if (type == "INVALID_KEY")
                {
                    LOG(WARNING) << "[Auth Service] Heartbeat failed: Invalid key";
                    return { auth_result::INVALID_KEY, message };
                }
                else if (type == "SUSPENDED")
                {
                    LOG(WARNING) << "[Auth Service] Heartbeat failed: Account suspended - " << message;
                    return { auth_result::SUSPENDED, message };
                }
                else if (type == "SHARE")
                {
                    LOG(WARNING) << "[Auth Service] Heartbeat failed: Account sharing detected - " << message;
                    return { auth_result::SHARE, message };
                }
            }

            // Verificar respuesta exitosa
            if (!json_response.contains("s") || !json_response.contains("u") || 
                !json_response.contains("r") || !json_response.contains("a"))
            {
                LOG(WARNING) << "[Auth Service] Heartbeat failed: Missing required fields";
                return { auth_result::SERVER_ERROR, "Respuesta incompleta del servidor" };
            }

            // Parsear respuesta exitosa
            auto data = parse_heartbeat_response(json_response);
            
            LOG(INFO) << "[Auth Service] Heartbeat success: " << data.root_name;
            
            return { 
                auth_result::SUCCESS, 
                "Autenticación exitosa",
                std::make_optional(std::move(data))
            };

        }
        catch (const std::exception& e)
        {
            LOG(ERROR) << "[Auth Service] Heartbeat exception: " << e.what();
            return { auth_result::SERVER_ERROR, std::string("Error: ") + e.what() };
        }
    }

    std::optional<redeem_response> auth_service::redeem(const std::string& license_key)
    {
        try
        {
            // Validación de entrada
            if (license_key.empty() || license_key.length() != 30)
            {
                LOG(WARNING) << "[Auth Service] Redeem failed: Invalid license key length";
                return std::nullopt;
            }

            // Construir payload JSON
            nlohmann::json payload = {
                {"license_key", license_key}
            };

            std::string body = payload.dump();

            // Realizar petición HTTP POST
            auto url = cpr::Url{ m_api_url + "/api/redeem" };
            auto headers = cpr::Header{
                {"Content-Type", "application/json"},
                {"User-Agent", "YimMenu-Client/2.0"}
            };
            auto cpr_body = cpr::Body{ body };

            auto response = m_http_client.post(url, headers, cpr_body);

            if (response.status_code == 0)
            {
                LOG(WARNING) << "[Auth Service] Redeem failed: Network error";
                return std::nullopt;
            }

            // Parsear respuesta JSON
            nlohmann::json json_response;
            try
            {
                json_response = nlohmann::json::parse(response.text);
            }
            catch (const std::exception& e)
            {
                LOG(WARNING) << "[Auth Service] Redeem failed: Invalid JSON - " << e.what();
                return std::nullopt;
            }

            // Verificar error
            if (json_response.contains("error"))
            {
                LOG(WARNING) << "[Auth Service] Redeem failed: " << json_response["error"].get<std::string>();
                return std::nullopt;
            }

            // Verificar éxito
            if (!json_response.contains("success") || !json_response["success"].get<bool>())
            {
                LOG(WARNING) << "[Auth Service] Redeem failed: Success flag not set";
                return std::nullopt;
            }

            // Parsear respuesta exitosa
            redeem_response result;
            result.success = true;
            result.account_id = json_response.value("account_id", "");
            result.activation_key = json_response.value("activation_key", "");
            result.privilege = json_response.value("privilege", 1);

            // Validar campos requeridos
            if (result.account_id.empty() || result.activation_key.empty())
            {
                LOG(WARNING) << "[Auth Service] Redeem failed: Missing account data";
                return std::nullopt;
            }

            LOG(INFO) << "[Auth Service] Redeem success: Account created with privilege " << result.privilege;
            
            return std::make_optional(std::move(result));

        }
        catch (const std::exception& e)
        {
            LOG(ERROR) << "[Auth Service] Redeem exception: " << e.what();
            return std::nullopt;
        }
    }

    std::optional<std::string> auth_service::regenerate(const std::string& account_id)
    {
        try
        {
            // Validación de entrada
            if (account_id.empty() || account_id.length() != 31)
            {
                LOG(WARNING) << "[Auth Service] Regenerate failed: Invalid account ID length";
                return std::nullopt;
            }

            // Construir payload JSON
            nlohmann::json payload = {
                {"account_id", account_id}
            };

            std::string body = payload.dump();

            // Realizar petición HTTP POST
            auto url = cpr::Url{ m_api_url + "/api/regenerate" };
            auto headers = cpr::Header{
                {"Content-Type", "application/json"},
                {"User-Agent", "YimMenu-Client/2.0"}
            };
            auto cpr_body = cpr::Body{ body };

            auto response = m_http_client.post(url, headers, cpr_body);

            if (response.status_code == 0)
            {
                LOG(WARNING) << "[Auth Service] Regenerate failed: Network error";
                return std::nullopt;
            }

            if (response.status_code >= 400)
            {
                LOG(WARNING) << "[Auth Service] Regenerate failed: HTTP " << response.status_code;
                return std::nullopt;
            }

            // La respuesta es texto plano (la nueva key o la existente)
            std::string new_key = response.text;
            
            // Validar que la respuesta tenga el formato esperado (31 caracteres alfanuméricos)
            if (new_key.length() != 31)
            {
                LOG(WARNING) << "[Auth Service] Regenerate failed: Invalid key format in response";
                return std::nullopt;
            }

            LOG(INFO) << "[Auth Service] Regenerate success: New key generated";
            
            return std::make_optional(new_key);

        }
        catch (const std::exception& e)
        {
            LOG(ERROR) << "[Auth Service] Regenerate exception: " << e.what();
            return std::nullopt;
        }
    }

    bool auth_service::health_check()
    {
        try
        {
            auto url = cpr::Url{ m_api_url + "/health" };
            auto response = m_http_client.get(url);

            if (response.status_code == 200)
            {
                nlohmann::json json_response;
                try
                {
                    json_response = nlohmann::json::parse(response.text);
                    return json_response.value("status", "") == "ok";
                }
                catch (...)
                {
                    return false;
                }
            }

            return false;
        }
        catch (const std::exception& e)
        {
            LOG(ERROR) << "[Auth Service] Health check exception: " << e.what();
            return false;
        }
    }

    // ============================================
    // CONFIGURACIÓN
    // ============================================

    void auth_service::set_api_url(const std::string& url)
    {
        m_api_url = url;
        LOG(INFO) << "[Auth Service] API URL set to: " << url;
    }

    std::string auth_service::get_api_url() const
    {
        return m_api_url;
    }

    // ============================================
    // MÉTODOS PRIVADOS
    // ============================================

    int64_t auth_service::generate_expiry_timestamp(int hours)
    {
        auto now = std::chrono::system_clock::now();
        auto expiry = now + std::chrono::hours(hours);
        return std::chrono::duration_cast<std::chrono::seconds>(
            expiry.time_since_epoch()).count();
    }

    bool auth_service::validate_heartbeat_response(const nlohmann::json& json)
    {
        // Verificar campos requeridos
        if (!json.contains("s")) return false;  // signature
        if (!json.contains("u")) return false;  // unlocks
        if (!json.contains("r")) return false;  // root_name
        if (!json.contains("a")) return false;  // timestamp

        // Validar tipos
        if (!json["s"].is_string()) return false;
        if (!json["u"].is_number_integer()) return false;
        if (!json["r"].is_string()) return false;
        if (!json["a"].is_number_integer()) return false;

        // Campos opcionales
        if (json.contains("d") && !json["d"].is_number_unsigned()) return false;
        if (json.contains("p") && !json["p"].is_array()) return false;

        return true;
    }

    heartbeat_response auth_service::parse_heartbeat_response(const nlohmann::json& json)
    {
        heartbeat_response response;
        
        response.signature = json["s"].get<std::string>();
        response.unlocks = json["u"].get<int>();
        response.root_name = json["r"].get<std::string>();
        response.timestamp = json["a"].get<int64_t>();

        // Campos opcionales
        if (json.contains("d"))
        {
            response.session_data = json["d"].get<uint32_t>();
        }

        if (json.contains("p"))
        {
            std::vector<std::string> peers;
            for (const auto& peer : json["p"])
            {
                peers.push_back(peer.get<std::string>());
            }
            response.peers = std::move(peers);
        }

        return response;
    }
}
