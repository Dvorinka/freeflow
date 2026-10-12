//! Tauri commands + the dictation state machine.
//! Flow: hotkey -> capture -> transcribe -> cleanup -> inject -> history.

use crate::state::{AppState, DictationPhase, Settings};
use crate::{audio, cleanup, foreapp, inject, meetings, store, stt};
use parking_lot::Mutex;
use serde::Serialize;
use std::sync::mpsc::Receiver;
use tauri::{AppHandle, Emitter, Manager, State};

/// Live capture plumbing for the active dictation.
struct Capture {
    rx: Receiver<Vec<i16>>,
    mic: audio::MicCapture,
    app: foreapp::ForegroundApp,
    started: std::time::Instant,
    /// Partial transcription already emitted (live mode; wired up with the
    /// overlay in the frontend step).
    #[allow(dead_code)]
    emitted_len: usize,
    buffer: Vec<i16>,
}

static ACTIVE: Mutex<Option<Capture>> = Mutex::new(None);

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DictationStatus {
    pub phase: DictationPhase,
    pub seconds: f64,
}

// ---------- hotkey ----------

pub fn register_hotkey(app: &AppHandle) -> anyhow::Result<()> {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
    let hotkey = app.state::<AppState>().settings.lock().hotkey.clone();
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();
    gs.on_shortcut(hotkey.as_str(), move |app, _shortcut, event| {
        match event.state() {
            ShortcutState::Pressed => {
                if app.state::<AppState>().phase() == DictationPhase::Idle {
                    let app = app.clone();
                    tauri::async_runtime::spawn(async move {
                        if let Err(e) = start_dictation(app.clone()).await {
                            tracing::error!("dictation start: {e:#}");
                            app.state::<AppState>()
                                .set_phase(&app, DictationPhase::Idle);
                        }
                    });
                }
            }
            ShortcutState::Released => {
                if app.state::<AppState>().phase() == DictationPhase::Listening {
                    let app = app.clone();
                    tauri::async_runtime::spawn(async move {
                        if let Err(e) = stop_dictation(app.clone()).await {
                            tracing::error!("dictation stop: {e:#}");
                            app.state::<AppState>()
                                .set_phase(&app, DictationPhase::Idle);
                        }
                    });
                }
            }
        }
    })?;
    Ok(())
}

// ---------- dictation ----------

#[tauri::command]
pub async fn start_dictation(app: AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();
    if state.phase() != DictationPhase::Idle {
        return Err("dictation already active".into());
    }
    // Capture the foreground app BEFORE we might show an overlay.
    let foreground = foreapp::foreground().unwrap_or(foreapp::ForegroundApp {
        process: String::new(),
        title: String::new(),
        category: foreapp::AppCategory::Unknown,
    });

    stt::ensure_sidecar(&app).await.map_err(|e| e.to_string())?;

    let device = state.settings.lock().mic_device.clone();
    let (rx, mic) = audio::MicCapture::start(&device).map_err(|e| e.to_string())?;
    *ACTIVE.lock() = Some(Capture {
        rx,
        mic,
        app: foreground,
        started: std::time::Instant::now(),
        emitted_len: 0,
        buffer: Vec::new(),
    });
    *state.session.lock() = Some(uuid::Uuid::new_v4());
    state.set_phase(&app, DictationPhase::Listening);
    Ok(())
}

#[tauri::command]
pub async fn stop_dictation(app: AppHandle) -> Result<(), String> {
    let cap = ACTIVE.lock().take().ok_or("no active dictation")?;
    run_pipeline(app, cap).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn cancel_dictation(app: AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();
    if let Some(cap) = ACTIVE.lock().take() {
        cap.mic.stop();
    }
    *state.session.lock() = None;
    state.set_phase(&app, DictationPhase::Idle);
    Ok(())
}

async fn run_pipeline(app: AppHandle, mut cap: Capture) -> Result<(), String> {
    let state = app.state::<AppState>();
    state.set_phase(&app, DictationPhase::Transcribing);

    cap.mic.stop();
    while let Ok(chunk) = cap.rx.try_recv() {
        cap.buffer.extend_from_slice(&chunk);
    }
    let duration = cap.started.elapsed();
    let pcm = std::mem::take(&mut cap.buffer);
    if pcm.len() < audio::TARGET_RATE as usize / 4 {
        state.set_phase(&app, DictationPhase::Idle);
        return Err("recording too short".into());
    }

    let (model, language, polish, ollama_model, auto_transform, style_preset) = {
        let s = state.settings.lock();
        let preset = s
            .styles
            .get(cap.app.category.key())
            .and_then(|id| cleanup::style_preset_prompt(id));
        (
            s.model.clone(),
            s.language.clone(),
            s.polish.clone(),
            s.ollama_model.clone(),
            s.auto_transform.clone(),
            preset,
        )
    };

    // Bias the decoder with the user's dictionary (mirrors the original's
    // vocabulary-aware prompting).
    let bias = state
        .db
        .lock()
        .as_ref()
        .map(|d| d.bias_prompt())
        .unwrap_or_default();

    let t = stt::transcribe(&state, &pcm, &language, &bias)
        .await
        .map_err(|e| format!("transcription: {e}"))?;
    let raw = t.text.trim().to_string();
    if raw.is_empty() {
        state.set_phase(&app, DictationPhase::Idle);
        return Err("nothing heard".into());
    }

    // Post-process: named auto-transform, per-category style preset
    // (both via the local model), or deterministic rules.
    let cleaned = match polish.as_str() {
        "ollama" => {
            state.set_phase(&app, DictationPhase::Polishing);
            // Explicit auto-transform wins; otherwise the category's style
            // preset; otherwise the builtin voice (None).
            let custom: Option<String> = if !auto_transform.is_empty() {
                state
                    .db
                    .lock()
                    .as_ref()
                    .and_then(|d| d.transforms().ok())
                    .into_iter()
                    .flatten()
                    .find(|t| t.name == auto_transform)
                    .map(|t| t.prompt)
            } else {
                style_preset
            };
            cleanup::ollama_polish(
                &state.http,
                &ollama_model,
                cap.app.category,
                &raw,
                custom.as_deref(),
            )
            .await
            .unwrap_or_else(|| cleanup::rules_cleanup(&raw))
        }
        "none" => raw.clone(),
        _ => cleanup::rules_cleanup(&raw),
    };

    state.set_phase(&app, DictationPhase::Injecting);
    inject_text(&app, &cleaned)?;

    // Persist history + dictionary feedback.
    let entry = store::HistoryEntry {
        id: uuid::Uuid::new_v4().to_string(),
        timestamp: chrono::Utc::now().timestamp_millis(),
        asr_text: raw,
        formatted_text: cleaned.clone(),
        edited_text: None,
        app: cap.app.process.clone(),
        url: None,
        language: t.language.clone(),
        duration_ms: duration.as_millis() as i64,
        num_words: cleaned.split_whitespace().count() as i64,
        model,
    };
    if let Some(db) = state.db.lock().as_ref() {
        let _ = db.add_history(&entry);
        if state.settings.lock().auto_learn {
            for phrase in extract_capitalized(&cleaned) {
                let _ = db.dict_bump_used(&phrase);
            }
        }
    }

    *state.session.lock() = None;
    state.set_phase(&app, DictationPhase::Idle);
    let _ = app.emit("dictation:done", &entry);
    Ok(())
}

fn inject_text(app: &AppHandle, text: &str) -> Result<(), String> {
    if text.len() > 120 {
        // Long text via clipboard is faster and less error-prone.
        use tauri_plugin_clipboard_manager::ClipboardExt;
        app.clipboard()
            .write_text(text)
            .map_err(|e| format!("clipboard: {e}"))?;
        inject::send_paste().map_err(|e| format!("paste: {e}"))?;
    } else {
        inject::type_text(text, 0).map_err(|e| format!("type: {e}"))?;
    }
    Ok(())
}

/// Capitalized non-sentence-initial tokens — cheap named-entity signal
/// for dictionary reinforcement (same idea as the original's dictionary).
fn extract_capitalized(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    for w in text.split_whitespace() {
        let bare = w.trim_matches(|c: char| !c.is_alphanumeric());
        if bare.len() > 1 && bare.chars().next().unwrap().is_uppercase() {
            out.push(bare.to_string());
        }
    }
    out
}

#[tauri::command]
pub fn dictation_state(state: State<'_, AppState>) -> DictationStatus {
    DictationStatus {
        phase: state.phase(),
        seconds: 0.0,
    }
}

// ---------- history ----------

#[tauri::command]
pub fn get_history(
    state: State<'_, AppState>,
    limit: Option<i64>,
) -> Result<Vec<store::HistoryEntry>, String> {
    guard_db(&state)?
        .history(limit.unwrap_or(200))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_history_entry(state: State<'_, AppState>, id: String) -> Result<(), String> {
    guard_db(&state)?
        .delete_history(&id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn clear_history(state: State<'_, AppState>) -> Result<(), String> {
    guard_db(&state)?.clear_history().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn replay_history_text(app: AppHandle, text: String) -> Result<(), String> {
    inject_text(&app, &text)
}

// ---------- dictionary ----------

#[tauri::command]
pub fn dictionary_list(state: State<'_, AppState>) -> Result<Vec<store::DictEntry>, String> {
    guard_db(&state)?.dictionary().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn dictionary_add(state: State<'_, AppState>, phrase: String) -> Result<(), String> {
    guard_db(&state)?
        .dict_add(&phrase, true)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn dictionary_remove(state: State<'_, AppState>, phrase: String) -> Result<(), String> {
    guard_db(&state)?
        .dict_remove(&phrase)
        .map_err(|e| e.to_string())
}

// ---------- snippets ----------

#[tauri::command]
pub fn snippets_list(state: State<'_, AppState>) -> Result<Vec<store::Snippet>, String> {
    guard_db(&state)?.snippets().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn snippet_upsert(state: State<'_, AppState>, snippet: store::Snippet) -> Result<(), String> {
    guard_db(&state)?
        .snippet_upsert(&snippet)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn snippet_remove(state: State<'_, AppState>, id: String) -> Result<(), String> {
    guard_db(&state)?
        .snippet_remove(&id)
        .map_err(|e| e.to_string())
}

// ---------- transforms ----------

#[tauri::command]
pub fn transforms_list(state: State<'_, AppState>) -> Result<Vec<store::Transform>, String> {
    guard_db(&state)?.transforms().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn transform_upsert(
    state: State<'_, AppState>,
    transform: store::Transform,
) -> Result<(), String> {
    guard_db(&state)?
        .transform_upsert(&transform)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn transform_remove(state: State<'_, AppState>, name: String) -> Result<(), String> {
    guard_db(&state)?
        .transform_remove(&name)
        .map_err(|e| e.to_string())
}

// ---------- settings / models / devices ----------

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Settings {
    state.settings.lock().clone()
}

#[tauri::command]
pub fn update_settings(app: AppHandle, settings: Settings) -> Result<(), String> {
    let state = app.state::<AppState>();
    let rebind = settings.hotkey != state.settings.lock().hotkey;
    *state.settings.lock() = settings.clone();
    if let Some(db) = state.db.lock().as_ref() {
        let _ = db.save_settings(&settings);
    }
    if rebind {
        register_hotkey(&app).map_err(|e| e.to_string())?;
    }
    if settings.autostart {
        use tauri_plugin_autostart::ManagerExt;
        let _ = app.autolaunch().enable();
    } else {
        use tauri_plugin_autostart::ManagerExt;
        let _ = app.autolaunch().disable();
    }
    Ok(())
}

#[tauri::command]
pub async fn list_stt_models(app: AppHandle) -> Result<Vec<stt::ModelInfo>, String> {
    let state = app.state::<AppState>();
    stt::list_models(&state).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn select_stt_model(app: AppHandle, id: String) -> Result<(), String> {
    let state = app.state::<AppState>();
    stt::select_model(&state, &id)
        .await
        .map_err(|e| e.to_string())?;
    state.settings.lock().model = id;
    Ok(())
}

#[tauri::command]
pub async fn sidecar_status(app: AppHandle) -> Result<stt::SidecarStatus, String> {
    let state = app.state::<AppState>();
    Ok(stt::status(&state).await)
}

#[tauri::command]
pub fn list_audio_devices() -> Vec<String> {
    audio::list_input_devices()
}

#[tauri::command]
pub async fn ollama_status(state: State<'_, AppState>) -> Result<bool, String> {
    Ok(cleanup::ollama_running(&state.http).await)
}

// ---------- meetings ----------

#[tauri::command]
pub async fn start_meeting(app: AppHandle, title: Option<String>) -> Result<String, String> {
    meetings::start(&app, title.unwrap_or_else(|| "Meeting".into())).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn stop_meeting(app: AppHandle) -> Result<(), String> {
    meetings::stop(&app).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_meetings(
    state: State<'_, AppState>,
    limit: Option<i64>,
) -> Result<Vec<store::MeetingRow>, String> {
    guard_db(&state)?
        .meetings(limit.unwrap_or(100))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_meeting(
    state: State<'_, AppState>,
    id: String,
) -> Result<Option<store::MeetingRow>, String> {
    guard_db(&state)?
        .meeting_get(&id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn meeting_notes(app: AppHandle, id: String) -> Result<String, String> {
    meetings::summarize(&app, &id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn meeting_ask(app: AppHandle, id: String, question: String) -> Result<String, String> {
    meetings::ask(&app, &id, &question)
        .await
        .map_err(|e| e.to_string())
}

// ---------- helpers ----------

fn guard_db<'a>(
    state: &'a State<'a, AppState>,
) -> Result<parking_lot::MappedMutexGuard<'a, store::Db>, String> {
    let g = state.db.lock();
    if g.is_none() {
        return Err("database not ready".into());
    }
    Ok(parking_lot::MutexGuard::map(g, |o| o.as_mut().unwrap()))
}
