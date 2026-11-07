//! Microphone capture: cpal -> 16 kHz mono i16 PCM over an mpsc channel.
//! Linear resample when the device mix format differs — good enough for STT.

use anyhow::{anyhow, Context, Result};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::Arc;

pub const TARGET_RATE: u32 = 16_000;

pub struct MicCapture {
    stop: Arc<AtomicBool>,
    handle: Option<std::thread::JoinHandle<()>>,
}

impl MicCapture {
    /// Start capturing; returns the receiver and the capture object
    /// (drop it / call stop() to end the stream).
    pub fn start(device_hint: &str) -> Result<(mpsc::Receiver<Vec<i16>>, Self)> {
        let (tx, rx) = mpsc::channel::<Vec<i16>>();
        let stop = Arc::new(AtomicBool::new(false));
        let stop_t = stop.clone();
        let hint = device_hint.to_string();
        let handle = std::thread::spawn(move || {
            if let Err(e) = capture_loop(&hint, tx, stop_t) {
                tracing::error!("mic capture: {e:#}");
            }
        });
        Ok((
            rx,
            Self {
                stop,
                handle: Some(handle),
            },
        ))
    }

    pub fn stop(mut self) {
        self.stop.store(true, Ordering::SeqCst);
        if let Some(h) = self.handle.take() {
            let _ = h.join();
        }
    }
}

impl Drop for MicCapture {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
    }
}

fn pick_device(hint: &str) -> Result<cpal::Device> {
    let host = cpal::default_host();
    if !hint.is_empty() {
        if let Ok(mut devs) = host.input_devices() {
            let h = hint.to_lowercase();
            if let Some(d) = devs.find(|d| {
                d.name()
                    .map(|n| n.to_lowercase().contains(&h))
                    .unwrap_or(false)
            }) {
                return Ok(d);
            }
        }
    }
    host.default_input_device()
        .ok_or_else(|| anyhow!("no input device available"))
}

pub fn list_input_devices() -> Vec<String> {
    let host = cpal::default_host();
    host.input_devices()
        .map(|it| it.filter_map(|d| d.name().ok()).collect())
        .unwrap_or_default()
}

fn capture_loop(hint: &str, tx: mpsc::Sender<Vec<i16>>, stop: Arc<AtomicBool>) -> Result<()> {
    let device = pick_device(hint)?;
    let config = device
        .default_input_config()
        .context("no default input config")?;
    let in_rate = config.sample_rate().0;
    let in_ch = config.channels() as usize;
    tracing::info!(
        "mic '{}' {}Hz {}ch",
        device.name().unwrap_or_default(),
        in_rate,
        in_ch
    );

    // Accumulate device frames -> resample -> emit ~250 ms chunks.
    let chunk_len = (TARGET_RATE as usize) / 4;
    let tx2 = tx.clone();
    let acc = std::sync::Arc::new(parking_lot::Mutex::new(Vec::<i16>::new()));

    let push = {
        let acc = acc.clone();
        move |frame: &[i16]| {
            let mut a = acc.lock();
            a.extend_from_slice(frame);
            while a.len() >= chunk_len {
                let chunk: Vec<i16> = a.drain(..chunk_len).collect();
                if tx2.send(chunk).is_err() {
                    return;
                }
            }
        }
    };

    let in_rate_f = in_rate as f64;
    let err = |e| tracing::error!("stream error: {e}");

    // Convert any input format to mono i16 at native rate, then resample.
    let mono_at_native = move |samples: &[i16]| -> Vec<i16> {
        let mut mono = Vec::with_capacity(samples.len() / in_ch + 1);
        for fr in samples.chunks(in_ch) {
            let s: i32 = fr.iter().map(|&v| v as i32).sum();
            mono.push((s / in_ch as i32) as i16);
        }
        resample_linear(&mono, in_rate_f, TARGET_RATE as f64)
    };

    macro_rules! build {
        ($fmt:ty, $conv:expr) => {
            device.build_input_stream(
                &config.config(),
                move |data: &[$fmt], _| {
                    let conv: &dyn Fn(&[$fmt]) -> Vec<i16> = &$conv;
                    let i16s = conv(data);
                    push(&mono_at_native(&i16s));
                },
                err,
                None,
            )
        };
    }

    let f2i = |d: &[f32]| -> Vec<i16> {
        d.iter()
            .map(|&v| (v.clamp(-1.0, 1.0) * 32767.0) as i16)
            .collect()
    };
    let i2i = |d: &[i16]| -> Vec<i16> { d.to_vec() };

    let stream = match config.sample_format() {
        cpal::SampleFormat::F32 => build!(f32, f2i),
        cpal::SampleFormat::I16 => build!(i16, i2i),
        f => return Err(anyhow!("unsupported sample format {f:?}")),
    }
    .context("build input stream")?;

    stream.play().context("start stream")?;
    while !stop.load(Ordering::SeqCst) {
        std::thread::sleep(std::time::Duration::from_millis(50));
    }
    drop(stream);
    // Flush remainder so the tail of the utterance isn't lost.
    let tail: Vec<i16> = acc.lock().drain(..).collect();
    if !tail.is_empty() {
        let _ = tx.send(tail);
    }
    Ok(())
}

/// Nearest-neighbour-ish linear resample; adequate for speech->whisper.
pub(crate) fn resample_linear(input: &[i16], from: f64, to: f64) -> Vec<i16> {
    if (from - to).abs() < 1.0 {
        return input.to_vec();
    }
    let ratio = from / to;
    let out_len = (input.len() as f64 / ratio) as usize;
    let mut out = Vec::with_capacity(out_len);
    for i in 0..out_len {
        let pos = i as f64 * ratio;
        let i0 = pos.floor() as usize;
        let i1 = (i0 + 1).min(input.len().saturating_sub(1));
        let frac = pos - i0 as f64;
        let v = input[i0] as f64 * (1.0 - frac) + input[i1] as f64 * frac;
        out.push(v as i16);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn resample_identity_and_down() {
        let v = vec![1000i16, 2000, 3000, 4000];
        assert_eq!(resample_linear(&v, 16000.0, 16000.0), v);
        let down = resample_linear(&v, 48000.0, 16000.0);
        assert_eq!(down.len(), 1);
    }

    /// Smoke: enumerate input devices (informational — passes with zero
    /// devices on headless boxes) and, if one exists, open it briefly.
    #[test]
    fn mic_open_if_present() {
        use cpal::traits::{DeviceTrait, HostTrait};
        let devs = list_input_devices();
        println!("input devices: {devs:?}");
        let host = cpal::default_host();
        let outs: Vec<String> = host
            .output_devices()
            .map(|it| it.filter_map(|d| d.name().ok()).collect())
            .unwrap_or_default();
        println!("output devices: {outs:?}");
        println!(
            "default in: {:?}, default out: {:?}",
            host.default_input_device().and_then(|d| d.name().ok()),
            host.default_output_device().and_then(|d| d.name().ok()),
        );
        if devs.is_empty() {
            return;
        }
        let (rx, cap) = MicCapture::start("").expect("mic open");
        std::thread::sleep(std::time::Duration::from_millis(300));
        cap.stop();
        drop(rx);
    }
}
