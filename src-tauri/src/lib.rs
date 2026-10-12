//! FreeFlow core: local dictation, polish, and meeting notes.
//! Modules are small and single-purpose; `commands` holds the
//! dictation state machine exposed to the frontend.

mod audio;
mod cleanup;
mod commands;
mod foreapp;
mod inject;
#[cfg(windows)]
mod loopback;
mod meetings;
mod state;
mod store;
mod stt;
mod tray;

use state::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "freeflow=info".into()),
        )
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // Second launch focuses the dashboard instead of duplicating.
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            commands::start_dictation,
            commands::stop_dictation,
            commands::cancel_dictation,
            commands::dictation_state,
            commands::get_history,
            commands::delete_history_entry,
            commands::clear_history,
            commands::replay_history_text,
            commands::dictionary_list,
            commands::dictionary_add,
            commands::dictionary_remove,
            commands::snippets_list,
            commands::snippet_upsert,
            commands::snippet_remove,
            commands::transforms_list,
            commands::transform_upsert,
            commands::transform_remove,
            commands::get_settings,
            commands::update_settings,
            commands::list_stt_models,
            commands::select_stt_model,
            commands::sidecar_status,
            commands::start_meeting,
            commands::stop_meeting,
            commands::list_meetings,
            commands::get_meeting,
            commands::meeting_notes,
            commands::meeting_ask,
            commands::list_audio_devices,
            commands::ollama_status,
        ])
        .setup(|app| {
            tray::build(app.handle())?;
            commands::register_hotkey(app.handle())?;
            let state = app.state::<AppState>();
            // Preload sqlite + start the whisper sidecar in the background.
            state.bootstrap(app.handle());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running freeflow");
}
