//! Meeting recorder: mic (+ WASAPI loopback on Windows) mixed to a
//! 16 kHz mono wav, then chunked transcription and optional notes.

use crate::state::AppState;
use crate::{audio, cleanup, stt};
use anyhow::{Context, Result};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Manager};

pub struct MeetingRec {
    stop: Arc<AtomicBool>,
    handles: Vec<std::thread::JoinHandle<()>>,
    pub id: String,
}

pub fn start(app: &AppHandle, title: String) -> Result<String> {
    let state = app.state::<AppState>();
    if state.meeting.lock().is_some() {
        anyhow::bail!("a meeting is already recording");
    }
    let id = uuid::Uuid::new_v4().to_string();
    let dir = state.app_data.join("meetings");
    std::fs::create_dir_all(&dir)?;
    let wav_path = dir.join(format!("{id}.wav"));

    let stop = Arc::new(AtomicBool::new(false));
    let (mix_tx, mix_rx) = std::sync::mpsc::channel::<Vec<i16>>();

    // Writer thread: merge chunks -> wav.
    let path_w = wav_path.clone();
    let stop_w = stop.clone();
    let writer = std::thread::spawn(move || {
        let spec = hound::WavSpec {
            channels: 1,
            sample_rate: audio::TARGET_RATE,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        let mut w = match hound::WavWriter::create(&path_w, spec) {
            Ok(w) => w,
            Err(e) => {
                tracing::error!("wav create: {e}");
                return;
            }
        };
        while !stop_w.load(Ordering::SeqCst) {
            match mix_rx.recv_timeout(std::time::Duration::from_millis(200)) {
                Ok(chunk) => {
                    for s in &chunk {
                        let _ = w.write_sample(*s);
                    }
                }
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => continue,
                Err(_) => break,
            }
        }
        // Drain anything that arrived between the last recv and the stop flag.
        while let Ok(chunk) = mix_rx.try_recv() {
            for s in &chunk {
                let _ = w.write_sample(*s);
            }
        }
        let _ = w.finalize();
    });

    // Mic leg.
    let device = state.settings.lock().mic_device.clone();
    let (mic_rx, mic) = audio::MicCapture::start(&device)?;
    let stop_m = stop.clone();
    let tx_m = mix_tx.clone();
    let mic_thread = std::thread::spawn(move || {
        while !stop_m.load(Ordering::SeqCst) {
            match mic_rx.recv_timeout(std::time::Duration::from_millis(200)) {
                Ok(c) => {
                    if tx_m.send(c).is_err() {
                        break;
                    }
                }
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => continue,
                Err(_) => break,
            }
        }
        mic.stop();
    });

    // System-audio leg (Windows loopback). Failure is non-fatal: meeting
    // still records mic audio.
    let mut handles = vec![writer, mic_thread];
    #[cfg(windows)]
    {
        let stop_s = stop.clone();
        let tx_s = mix_tx.clone();
        let loop_thread = std::thread::spawn(move || {
            if let Err(e) = crate::loopback::capture(tx_s, stop_s) {
                tracing::warn!("loopback capture unavailable: {e:#}");
            }
        });
        handles.push(loop_thread);
    }

    let rec = MeetingRec {
        stop,
        handles,
        id: id.clone(),
    };
    *state.meeting.lock() = Some(rec);

    if let Some(db) = state.db.lock().as_ref() {
        let _ = db.meeting_insert(&crate::store::MeetingRow {
            id: id.clone(),
            started_at: chrono::Utc::now().timestamp_millis(),
            ended_at: None,
            title,
            audio_path: wav_path.to_string_lossy().into(),
            transcript: None,
            notes: None,
            status: "recording".into(),
        });
    }
    Ok(id)
}

pub async fn stop(app: &AppHandle) -> Result<()> {
    let rec = {
        let state = app.state::<AppState>();
        let mut g = state.meeting.lock();
        g.take().context("no meeting recording")?
    };
    rec.stop.store(true, Ordering::SeqCst);
    for h in rec.handles {
        let _ = h.join();
    }

    let state = app.state::<AppState>();
    let wav_path = state
        .app_data
        .join("meetings")
        .join(format!("{}.wav", rec.id));
    let audio_path = wav_path.to_string_lossy().to_string();
    if let Some(db) = state.db.lock().as_ref() {
        let _ = db.meeting_finish(&rec.id, &audio_path);
    }

    // Transcribe in the background; UI sees status flip when done.
    let app2 = app.clone();
    let id = rec.id;
    tauri::async_runtime::spawn(async move {
        if let Err(e) = transcribe_meeting(&app2, &id).await {
            tracing::error!("meeting transcribe: {e:#}");
        }
    });
    Ok(())
}

/// Read the wav and transcribe in 30 s slices to bound memory/latency.
async fn transcribe_meeting(app: &AppHandle, id: &str) -> Result<()> {
    let state = app.state::<AppState>();
    let path = state.app_data.join("meetings").join(format!("{id}.wav"));
    let mut reader = hound::WavReader::open(&path)?;
    let samples: Vec<i16> = reader.samples::<i16>().filter_map(|s| s.ok()).collect();
    let slice = (audio::TARGET_RATE as usize) * 30;
    let mut all = String::new();
    for chunk in samples.chunks(slice) {
        let t = stt::transcribe(&state, chunk, "auto", "").await?;
        if !all.is_empty() {
            all.push(' ');
        }
        all.push_str(t.text.trim());
    }
    let settings = state.settings.lock().clone();
    if let Some(db) = state.db.lock().as_ref() {
        let _ = db.meeting_set_result(id, &all, None);
    }
    // Optional auto-notes when polish=ollama and the service is up.
    if settings.polish == "ollama" {
        if let Some(notes) = cleanup::ollama_polish(
            &state.http,
            &settings.ollama_model,
            crate::foreapp::AppCategory::Document,
            &format!("Summarize this meeting transcript into concise notes with bullet-point action items:\n\n{all}"),
            Some("Summarize the transcript into concise notes with bullet action items. Return only the notes."),
        ).await {
            if let Some(db) = state.db.lock().as_ref() {
                let _ = db.meeting_set_result(id, &all, Some(&notes));
            }
        }
    }
    Ok(())
}

pub async fn summarize(app: &AppHandle, id: &str) -> Result<String> {
    let state = app.state::<AppState>();
    let m = {
        let db = state.db.lock();
        let m = db.as_ref().context("db not ready")?.meeting_get(id)?;
        m.context("meeting not found")?
    };
    let transcript = m.transcript.context("meeting has no transcript yet")?;
    let settings = state.settings.lock().clone();
    let notes = cleanup::ollama_polish(
        &state.http,
        &settings.ollama_model,
        crate::foreapp::AppCategory::Document,
        &format!("Summarize this meeting transcript into concise notes with bullet-point action items:\n\n{transcript}"),
        Some("Summarize the transcript into concise notes with bullet action items. Return only the notes."),
    )
    .await
    .context("local LLM unavailable — run Ollama or export the transcript")?;
    if let Some(db) = state.db.lock().as_ref() {
        let _ = db.meeting_set_result(id, &transcript, Some(&notes));
    }
    Ok(notes)
}
