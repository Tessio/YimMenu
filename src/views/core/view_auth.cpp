#include "services/auth/auth_service.hpp"
#include "gui.hpp"
#include "pointers.hpp"
#include "lua/lua_manager.hpp"
#include "util/string_operations.hpp"
#include "version.hpp"
#include "views/view.hpp"

#include <chrono>
#include <filesystem>
#include <cstring>

namespace big
{
	// ============================================
	// CONSTANTES
	// ============================================

	constexpr auto HWID_PATH = "hwid.dat";

	// ============================================
	// FUNCIONES AUXILIARES
	// ============================================

	/**
	 * @brief Genera un HWID único para el hardware
	 * @return HWID como string (max 16 caracteres)
	 */
	static std::string generate_hwid()
	{
		// Intentar leer HWID guardado
		std::filesystem::path hwid_file = g_file_manager.get_project_file(HWID_PATH).get_path();
		if (std::filesystem::exists(hwid_file))
		{
			std::ifstream file(hwid_file);
			if (file.is_open())
			{
				std::string hwid;
				std::getline(file, hwid);
				file.close();

				if (!hwid.empty() && hwid.length() <= 16)
				{
					return hwid;
				}
			}
		}

		// Generar nuevo HWID basado en información del sistema
		std::string hwid_source = "";

		// Volume serial number
		char volume_name[MAX_PATH] = {0};
		char file_system_name[MAX_PATH] = {0};
		DWORD serial_number = 0;
		DWORD max_component_len = 0;
		DWORD file_system_flags = 0;

		if (GetVolumeInformation("C:\\", volume_name, MAX_PATH, &serial_number, &max_component_len,
		        &file_system_flags, file_system_name, MAX_PATH))
		{
			hwid_source += std::to_string(serial_number);
		}

		// MAC address (simplificado)
		hwid_source += std::to_string(GetTickCount64());

		// Hash simple
		DWORD hash = 0;
		for (char c : hwid_source)
		{
			hash = hash * 31 + static_cast<DWORD>(c);
		}

		// Convertir a string hexadecimal (16 caracteres max)
		char hwid_buffer[17];
		snprintf(hwid_buffer, sizeof(hwid_buffer), "%016lX", hash);
		std::string hwid = hwid_buffer;

		// Guardar HWID
		std::ofstream out_file(hwid_file);
		if (out_file.is_open())
		{
			out_file << hwid;
			out_file.close();
		}

		return hwid;
	}

	/**
	 * @brief Genera una identity única
	 * @return Identity como string (max 14 caracteres)
	 */
	static std::string generate_identity()
	{
		// Identity fija para desarrollo (puedes hacerla dinámica si necesitas)
		return "HNLL72M8WDI2YU";
	}

	// ============================================
	// VISTA DE AUTENTICACIÓN
	// ============================================

	void view::auth()
	{
		static bool auth_open = false;
		static bool is_redeeming = false;
		static char license_key_buffer[64] = {0};
		static std::string status_message = "";
		static int status_type = 0; // 0: none, 1: info, 2: success, 3: error

		// Si ya está autenticado y el auth está habilitado, no mostrar ventana de auth
		if (g.auth.authenticated && g.auth.enabled)
		{
			return;
		}

		// Si el auth no está habilitado, no mostrar nada
		if (!g.auth.enabled)
		{
			return;
		}

		// Solo mostrar la ventana de auth si el menú ya está abierto
		// No forzar que el menú se abra automáticamente
		if (!g_gui->is_open())
		{
			// Resetear estado cuando el menú se cierra
			auth_open = false;
			return;
		}

		// Bloquear navegación del menú hasta autenticar
		g_gui->override_mouse(true);

		const auto window_size = ImVec2{500, 400};
		const auto window_position = ImVec2{(*g_pointers->m_gta.m_resolution_x - window_size.x) / 2,
		    (*g_pointers->m_gta.m_resolution_y - window_size.y) / 2};

		ImGui::SetNextWindowSize(window_size, ImGuiCond_Always);
		ImGui::SetNextWindowPos(window_position, ImGuiCond_Always);

		if (ImGui::Begin("SerchoScript Authentication", nullptr, ImGuiWindowFlags_NoResize | ImGuiWindowFlags_NoCollapse | ImGuiWindowFlags_NoTitleBar))
		{
			// Header
			ImGui::TextColored(ImVec4(1.0f, 0.4f, 1.0f, 1.0f), "SerchoScript Authentication");
			ImGui::Separator();
			ImGui::Spacing();

			// Mostrar mensaje de estado si existe
			if (!status_message.empty())
			{
				if (status_type == 2) // Success
				{
					ImGui::TextColored(ImVec4(0.0f, 1.0f, 0.0f, 1.0f), "%s", status_message.c_str());
				}
				else if (status_type == 3) // Error
				{
					ImGui::TextColored(ImVec4(1.0f, 0.0f, 0.0f, 1.0f), "%s", status_message.c_str());
				}
				else // Info
				{
					ImGui::TextColored(ImVec4(1.0f, 1.0f, 1.0f, 1.0f), "%s", status_message.c_str());
				}
				ImGui::Spacing();
			}

			// Si ya tenemos activation key, intentar heartbeat
			if (!g.auth.activation_key.empty() && !g.auth.authenticated)
			{
				// Generar HWID e Identity si no existen
				if (g.auth.hwid.empty())
				{
					g.auth.hwid = generate_hwid();
				}
				if (g.auth.identity.empty())
				{
					g.auth.identity = generate_identity();
				}

				// Intentar autenticar
				auto status = g_auth_service->heartbeat(
					version::GIT_BRANCH,
					g.auth.activation_key,
					g.auth.identity,
					g.auth.hwid,
					"en-US"
				);

				if (status.result == auth_result::SUCCESS)
				{
					g.auth.authenticated = true;
					status_message = "Authentication successful!";
					status_type = 2;
					// Desbloquear el menú después de autenticar
					g_gui->override_mouse(false);
					// Asegurar que el menú esté abierto para mostrar la vista principal
					g_gui->toggle(true);
				}
				else
				{
					status_message = "Authentication failed: " + status.message;
					status_type = 3;
					g.auth.activation_key.clear();
					g.auth.account_id.clear();
				}
			}
			else
			{
				// Mostrar formulario de license key
				ImGui::Text("Enter your license key to activate SerchoScript:");
				ImGui::Spacing();

				// Input de license key
				if (ImGui::InputText("##license_key", license_key_buffer, sizeof(license_key_buffer),
				        ImGuiInputTextFlags_CharsNoBlank))
				{
					// Limpiar mensaje de error cuando el usuario escribe
					if (status_type == 3)
					{
						status_message = "";
						status_type = 0;
					}
				}

				ImGui::Spacing();

				// Botón de redeem
				if (ImGui::Button("Activate", ImVec2(200, 35)))
				{
					std::string license_key = license_key_buffer;

					// Validar longitud
					if (license_key.empty())
					{
						status_message = "Please enter a license key";
						status_type = 3;
					}
					else if (license_key.length() != 30)
					{
						status_message = "Invalid license key format (must be 30 characters)";
						status_type = 3;
					}
					else
					{
						is_redeeming = true;
						status_message = "Activating... Please wait";
						status_type = 1;

						// Ejecutar redeem en background
						g_fiber_pool->queue_job([] {
							auto result = g_auth_service->redeem(license_key_buffer);

							if (result.has_value())
							{
								g.auth.account_id = result->account_id;
								g.auth.activation_key = result->activation_key;
								g.auth.privilege = result->privilege;

								// Guardar en archivo
								std::filesystem::path auth_file = g_file_manager.get_project_file("auth.dat").get_path();
								std::ofstream out_file(auth_file, std::ios::binary);
								if (out_file.is_open())
								{
									out_file << g.auth.account_id << "\n";
									out_file << g.auth.activation_key << "\n";
									out_file << g.auth.privilege << "\n";
									out_file.close();
								}

								status_message = "License activated successfully!";
								status_type = 2;
							}
							else
							{
								status_message = "Failed to activate license. Please check your key and try again.";
								status_type = 3;
							}

							is_redeeming = false;
						});
					}
				}

				ImGui::SameLine();

				// Botón para cargar desde archivo
				if (ImGui::Button("Load from File", ImVec2(200, 35)))
				{
					std::filesystem::path auth_file = g_file_manager.get_project_file("auth.dat").get_path();
					if (std::filesystem::exists(auth_file))
					{
						std::ifstream in_file(auth_file);
						if (in_file.is_open())
						{
							std::getline(in_file, g.auth.account_id);
							std::getline(in_file, g.auth.activation_key);
							in_file >> g.auth.privilege;
							in_file.close();

							status_message = "Credentials loaded from file";
							status_type = 1;
						}
						else
						{
							status_message = "Failed to read auth file";
							status_type = 3;
						}
					}
					else
					{
						status_message = "Auth file not found";
						status_type = 3;
					}
				}

				// Configuración del servidor
				ImGui::Spacing();
				ImGui::Separator();
				ImGui::Spacing();

				ImGui::Text("Auth Server URL:");
				if (ImGui::InputText("##auth_url", g.auth.api_url.data(), g.auth.api_url.capacity(), ImGuiInputTextFlags_CharsNoBlank))
				{
					g.auth.api_url.resize(std::strlen(g.auth.api_url.data()));
					g_auth_service->set_api_url(g.auth.api_url);
				}

				// Health check
				ImGui::SameLine();
				if (ImGui::Button("Test Connection"))
				{
					if (g_auth_service->health_check())
					{
						status_message = "Server connection successful";
						status_type = 2;
					}
					else
					{
						status_message = "Failed to connect to server";
						status_type = 3;
					}
				}

				// Opción para deshabilitar auth
				ImGui::Spacing();
				ImGui::Separator();
				ImGui::Spacing();

				if (ImGui::Checkbox("Disable Authentication System", &g.auth.enabled))
				{
					// Si se deshabilita, desbloquear el menú
					if (!g.auth.enabled)
					{
						g_gui->override_mouse(false);
						g.auth.authenticated = false; // Resetear estado
						status_message = "Authentication disabled. Menu unlocked.";
						status_type = 1;
					}
				}
				ImGui::TextColored(ImVec4(1.0f, 1.0f, 0.0f, 1.0f), "Warning: Disabling auth will allow access without a license.");
			}

			// Footer
			ImGui::Spacing();
			ImGui::Separator();
			ImGui::PushStyleColor(ImGuiCol_Text, ImVec4(1.0f, 0.4f, 1.0f, 0.7f));
			ImGui::Text("SerchoScript - Build: %s", version::GIT_BRANCH);
			ImGui::PopStyleColor();

			// Botón de UNLOAD (Desinyectar)
			ImGui::Spacing();
			ImGui::Separator();
			ImGui::Spacing();

			ImGui::PushStyleColor(ImGuiCol_Button, ImVec4(0.69f, 0.29f, 0.29f, 1.00f));
			ImGui::PushStyleColor(ImGuiCol_ButtonHovered, ImVec4(0.85f, 0.35f, 0.35f, 1.00f));
			ImGui::PushStyleColor(ImGuiCol_ButtonActive, ImVec4(0.50f, 0.20f, 0.20f, 1.00f));
			if (ImGui::Button("UNLOAD MENU (Unload)", ImVec2(-1, 35)))
			{
				// Trigger event para Lua
				g_lua_manager->trigger_event<menu_event::MenuUnloaded>();
				// Detener el menú
				g_running = false;
			}
			ImGui::PopStyleColor(3);

			ImGui::End();
		}
	}

	// ============================================
	// INICIALIZACIÓN DE AUTENTICACIÓN
	// ============================================

	void view::initialize_auth()
	{
		// Verificar si el auth está habilitado
		if (!g.auth.enabled)
		{
			return;
		}

		// Cargar credenciales guardadas
		std::filesystem::path auth_file = g_file_manager.get_project_file("auth.dat").get_path();
		if (std::filesystem::exists(auth_file))
		{
			std::ifstream in_file(auth_file);
			if (in_file.is_open())
			{
				std::getline(in_file, g.auth.account_id);
				std::getline(in_file, g.auth.activation_key);
				in_file >> g.auth.privilege;
				in_file.close();

				LOG(INFO) << "[Auth] Loaded credentials from file";
			}
		}

		// Configurar URL del servicio
		g_auth_service->set_api_url(g.auth.api_url);
	}
}
