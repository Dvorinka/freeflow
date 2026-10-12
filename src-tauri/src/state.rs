//! Shared application state: paths, sqlite, sidecar handle, settings.

use crate::{meetings, store, stt, tray};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Child;
use std::sync::atomic::{AtomicU8, Ordering};
use tauri::{AppHandle, Manager};

/// Dictation lifecycle broadcast to the UI.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DictationPhase {
    Idle,
    Listening,
    Transcribing,
    Polishing,
    Injecting,
}

impl DictationPhase {
    pub fn as_u8(self) -> u8 {
        self as u8
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    /// faster-whisper model id (e.g. "small.en", "large-v3-turbo").
    pub model: String,
    /// Source language or "auto".
    pub language: String,
    /// Hotkey accelerator (tauri-plugin-global-shortcut format).
    pub hotkey: String,
    /// Type live partials into the field while speaking.
    pub live_partials: bool,
    /// Post-processing: "none" | "rules" | "ollama".
    pub polish: String,
    /// Ollama model used when polish == "ollama".
    pub ollama_model: String,
    /// Preferred input device name fragment; empty = default.
    pub mic_device: String,
    /// Learn capitalized words into the dictionary automatically.
    pub auto_learn: bool,
    /// Launch at login.
    pub autostart: bool,
    /// Show the dictation overlay window.
    pub overlay: bool,
    /// Named transform auto-applied after dictation (Ollama mode only).
    /// Empty = off (rule cleanup / builtin voice).
    pub auto_transform: String,
    /// Per-category style preset ids ("formal" | "casual" | "very_casual"),
    /// keyed by app-category key. Absent = builtin voice.
    pub styles: HashMap<String, String>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            model: "small.en".into(),
            language: "auto".into(),
            hotkey: "Ctrl+Alt+Space".into(),
            live_partials: false,
            polish: "rules".into(),
            ollama_model: "qwen2.5:3b".into(),
            mic_device: String::new(),
            auto_learn: true,
            autostart: false,
            overlay: true,
            auto_transform: String::new(),
            styles: HashMap::new(),
        }
    }
}

pub struct AppState {
    pub phase: AtomicU8,
    pub settings: Mutex<Settings>,
    pub db: Mutex<Option<store::Db>>,
    pub sidecar: Mutex<Option<Child>>,
    pub sidecar_port: Mutex<u16>,
    pub http: reqwest::Client,
    /// Current dictation session id for cancellation.
    pub session: Mutex<Option<uuid::Uuid>>,
    /// Meeting recorder handle, if recording.
    pub meeting: Mutex<Option<meetings::MeetingRec>>,
    pub app_data: PathBuf,
}

impl AppState {
    pub fn new() -> Self {
        let app_data = dirs_appdata();
        Self {
            phase: AtomicU8::new(DictationPhase::Idle.as_u8()),
            settings: Mutex::new(Settings::default()),
            db: Mutex::new(None),
            sidecar: Mutex::new(None),
            sidecar_port: Mutex::new(0),
            http: reqwest::Client::new(),
            session: Mutex::new(None),
            meeting: Mutex::new(None),
            app_data,
        }
    }

    pub fn phase(&self) -> DictationPhase {
        match self.phase.load(Ordering::SeqCst) {
            1 => DictationPhase::Listening,
            2 => DictationPhase::Transcribing,
            3 => DictationPhase::Polishing,
            4 => DictationPhase::Injecting,
            _ => DictationPhase::Idle,
        }
    }

    pub fn set_phase(&self, app: &AppHandle, p: DictationPhase) {
        self.phase.store(p.as_u8(), Ordering::SeqCst);
        use tauri::Emitter;
        let _ = app.emit("dictation:phase", p);
        tray::set_overlay_visible(
            app,
            p != DictationPhase::Idle && self.settings.lock().overlay,
        );
    }

    /// Open the sqlite db and load settings; spawn the whisper sidecar.
    /// Called once from setup; heavy work is off the main thread.
    pub fn bootstrap(&self, app: &AppHandle) {
        let app = app.clone();
        let app_data = self.app_data.clone();
        tauri::async_runtime::spawn(async move {
            std::fs::create_dir_all(&app_data).ok();
            let db_path = app_data.join("freeflow.sqlite");
            match store::Db::open(&db_path) {
                Ok(db) => {
                    let st = app.state::<AppState>();
                    if let Some(saved) = db.load_settings() {
                        *st.settings.lock() = saved;
                    }
                    *st.db.lock() = Some(db);
                }
                Err(e) => tracing::error!("db open failed: {e}"),
            }
            if let Err(e) = stt::ensure_sidecar(&app).await {
                tracing::error!("sidecar start failed: {e}");
            }
        });
    }
}

fn dirs_appdata() -> PathBuf {
    // %APPDATA%/dev.tdvorak.freeflow — matches tauri identifier.
    let base = std::env::var("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|_| std::env::temp_dir());
    base.join("dev.tdvorak.freeflow")
}
