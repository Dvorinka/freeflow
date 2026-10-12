//! faster-whisper sidecar client. The sidecar is a frozen Python exe
//! exposing a tiny local HTTP API; this module manages its lifecycle
//! and forwards transcription requests.

use crate::state::AppState;
use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use tauri::{AppHandle, Manager};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    pub id: String,
    pub downloaded: bool,
    pub active: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Segment {
    pub start: f64,
    pub end: f64,
    pub text: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Transcript {
    pub text: String,
    pub segments: Vec<Segment>,
    pub language: String,
    pub avg_logprob: f64,
    pub duration_s: f64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SidecarStatus {
    pub running: bool,
    pub port: u16,
    pub model: Option<String>,
}

fn sidecar_exe() -> std::path::PathBuf {
    // Bundled next to the app binary as a Tauri resource.
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let p = dir.join("whisper-sidecar").join("freeflow-whisper.exe");
            if p.exists() {
                return p;
            }
        }
    }
    // Dev fallback: run the source script if present.
    std::path::PathBuf::from("sidecar").join("freeflow-whisper.exe")
}

/// Spawn the sidecar if not running; block until /health answers.
pub async fn ensure_sidecar(app: &AppHandle) -> Result<u16> {
    let state = app.state::<AppState>();
    if let Some(port) = probe(&state).await {
        return Ok(port);
    }
    let exe = sidecar_exe();
    if !exe.exists() {
        return Err(anyhow!(
            "whisper sidecar not found at {}; run sidecar/build.ps1",
            exe.display()
        ));
    }
    let mut child: Child = Command::new(&exe)
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .with_context(|| format!("spawn {}", exe.display()))?;

    // Handshake: sidecar prints `PORT <n>` once listening.
    let port = {
        let stdout = child.stdout.take().context("sidecar stdout")?;
        let mut reader = BufReader::new(stdout);
        let mut line = String::new();
        reader.read_line(&mut line)?;
        line.trim()
            .strip_prefix("PORT ")
            .and_then(|p| p.parse::<u16>().ok())
            .ok_or_else(|| anyhow!("bad sidecar handshake: {line:?}"))?
    };
    *state.sidecar_port.lock() = port;
    *state.sidecar.lock() = Some(child);
    tracing::info!("whisper sidecar on :{port}");

    // Wait for /health (model may still be loading — that's fine).
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(120);
    while std::time::Instant::now() < deadline {
        if probe(&state).await.is_some() {
            return Ok(port);
        }
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    }
    Err(anyhow!("sidecar did not become healthy"))
}

async fn probe(state: &tauri::State<'_, AppState>) -> Option<u16> {
    let port = *state.sidecar_port.lock();
    if port == 0 {
        return None;
    }
    let ok = state
        .http
        .get(format!("http://127.0.0.1:{port}/health"))
        .timeout(std::time::Duration::from_secs(2))
        .send()
        .await
        .map(|r| r.status().is_success())
        .unwrap_or(false);
    ok.then_some(port)
}

fn port(app: &AppHandle) -> Result<u16> {
    let p = *app.state::<AppState>().sidecar_port.lock();
    if p == 0 {
        anyhow::bail!("whisper sidecar is not running")
    }
    Ok(p)
}

pub async fn status(app: &AppHandle) -> SidecarStatus {
    let state = app.state::<AppState>();
    let p = *state.sidecar_port.lock();
    if p == 0 {
        return SidecarStatus { running: false, port: 0, model: None };
    }
    let model = match state
        .http
        .get(format!("http://127.0.0.1:{p}/health"))
        .send()
        .await
    {
        Ok(r) => r
            .json::<serde_json::Value>()
            .await
            .ok()
            .and_then(|v| v.get("model").and_then(|m| m.as_str().map(String::from))),
        Err(_) => None,
    };
    SidecarStatus { running: true, port: p, model }
}

pub async fn transcribe(
    app: &AppHandle,
    pcm: &[i16],
    language: &str,
    prompt: &str,
) -> Result<Transcript> {
    let p = port(app)?;
    let mut body = Vec::with_capacity(pcm.len() * 2);
    for s in pcm {
        body.extend_from_slice(&s.to_le_bytes());
    }
    let client = &app.state::<AppState>().http;
    let resp = client
        .post(format!("http://127.0.0.1:{p}/transcribe"))
        .query(&[("language", language), ("prompt", prompt)])
        .header("content-type", "application/octet-stream")
        .body(body)
        .timeout(std::time::Duration::from_secs(300))
        .send()
        .await
        .context("transcribe request")?;
    if !resp.status().is_success() {
        let msg = resp.text().await.unwrap_or_default();
        anyhow::bail!("sidecar transcribe failed: {msg}");
    }
    Ok(resp.json::<Transcript>().await?)
}

pub async fn list_models(app: &AppHandle) -> Result<Vec<ModelInfo>> {
    let p = port(app)?;
    let v = app
        .state::<AppState>()
        .http
        .get(format!("http://127.0.0.1:{p}/models"))
        .send()
        .await?
        .json::<Vec<ModelInfo>>()
        .await?;
    Ok(v)
}

pub async fn select_model(app: &AppHandle, id: &str) -> Result<()> {
    let p = port(app)?;
    let resp = app
        .state::<AppState>()
        .http
        .post(format!("http://127.0.0.1:{p}/models/select"))
        .json(&serde_json::json!({ "id": id }))
        .timeout(std::time::Duration::from_secs(3600))
        .send()
        .await?;
    if !resp.status().is_success() {
        anyhow::bail!("model select failed: {}", resp.text().await.unwrap_or_default());
    }
    Ok(())
}
