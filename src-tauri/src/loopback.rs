//! WASAPI render-loopback capture -> 16 kHz mono i16 chunks.
//! Records what the speakers play (the far end of calls).

#![cfg(windows)]

use anyhow::{Context, Result};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::Sender;
use std::sync::Arc;
use windows::Win32::Media::Audio::{
    eConsole, eRender, IAudioCaptureClient, IAudioClient, IMMDeviceEnumerator, MMDeviceEnumerator,
    AUDCLNT_BUFFERFLAGS_SILENT, AUDCLNT_SHAREMODE_SHARED, AUDCLNT_STREAMFLAGS_LOOPBACK,
    WAVEFORMATEXTENSIBLE,
};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoTaskMemFree, CLSCTX_ALL, COINIT_MULTITHREADED,
};

const REFTIMES_PER_SEC: i64 = 10_000_000;

/// Capture loopback audio until `stop` flips; emits ~200 ms mono i16 chunks.
pub fn capture(tx: Sender<Vec<i16>>, stop: Arc<AtomicBool>) -> Result<()> {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        let enumerator: IMMDeviceEnumerator =
            CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)
                .context("MMDeviceEnumerator")?;
        let device = enumerator
            .GetDefaultAudioEndpoint(eRender, eConsole)
            .context("default render endpoint")?;
        let client: IAudioClient = device.Activate(CLSCTX_ALL, None).context("IAudioClient")?;
        let fmt_ptr = client.GetMixFormat().context("mix format")?;
        let fmt = &*fmt_ptr;
        let in_rate = fmt.nSamplesPerSec;
        let in_ch = fmt.nChannels as usize;
        let tag = fmt.wFormatTag;
        let bits = fmt.wBitsPerSample;
        // WAVEFORMATEXTENSIBLE carries the real format in SubFormat.
        // NB: packed struct — read the GUID without creating a reference.
        let is_float = if tag == 0xFFFE
        /* WAVE_FORMAT_EXTENSIBLE */
        {
            let sub: windows::core::GUID =
                std::ptr::addr_of!((*(fmt_ptr as *const WAVEFORMATEXTENSIBLE)).SubFormat)
                    .read_unaligned();
            sub == windows::Win32::Media::Multimedia::KSDATAFORMAT_SUBTYPE_IEEE_FLOAT
        } else {
            tag == 3 /* WAVE_FORMAT_IEEE_FLOAT */
        };

        client
            .Initialize(
                AUDCLNT_SHAREMODE_SHARED,
                AUDCLNT_STREAMFLAGS_LOOPBACK,
                REFTIMES_PER_SEC / 2,
                0,
                fmt_ptr,
                None,
            )
            .context("loopback init")?;
        let capture: IAudioCaptureClient = client.GetService().context("IAudioCaptureClient")?;
        client.Start().context("loopback start")?;

        let chunk_frames = (crate::audio::TARGET_RATE / 5) as usize; // 200 ms
        let mut acc: Vec<i16> = Vec::new();
        while !stop.load(Ordering::SeqCst) {
            let packet = capture.GetNextPacketSize().unwrap_or(0);
            if packet == 0 {
                std::thread::sleep(std::time::Duration::from_millis(15));
                continue;
            }
            let mut data: *mut u8 = std::ptr::null_mut();
            let mut frames = 0u32;
            let mut flags = 0u32;
            let buf = capture.GetBuffer(&mut data, &mut frames, &mut flags, None, None);
            if buf.is_err() {
                std::thread::sleep(std::time::Duration::from_millis(15));
                continue;
            }
            if flags & AUDCLNT_BUFFERFLAGS_SILENT.0 as u32 == 0 && frames > 0 {
                let mono = if is_float {
                    let s = std::slice::from_raw_parts(data as *const f32, frames as usize * in_ch);
                    pcm_f32_to_i16_mono(s, in_ch)
                } else if bits == 16 {
                    let s = std::slice::from_raw_parts(data as *const i16, frames as usize * in_ch);
                    pcm_i16_mono(s, in_ch)
                } else {
                    Vec::new()
                };
                let rs = crate::audio::resample_linear(
                    &mono,
                    in_rate as f64,
                    crate::audio::TARGET_RATE as f64,
                );
                acc.extend_from_slice(&rs);
                while acc.len() >= chunk_frames {
                    let out: Vec<i16> = acc.drain(..chunk_frames).collect();
                    if tx.send(out).is_err() {
                        let _ = capture.ReleaseBuffer(0);
                        let _ = client.Stop();
                        return Ok(());
                    }
                }
            }
            let _ = capture.ReleaseBuffer(frames);
        }
        if !acc.is_empty() {
            let _ = tx.send(acc);
        }
        let _ = client.Stop();
        CoTaskMemFree(Some(fmt_ptr as *const _));
    }
    Ok(())
}

fn pcm_f32_to_i16_mono(s: &[f32], ch: usize) -> Vec<i16> {
    s.chunks(ch)
        .map(|f| {
            let m: f32 = f.iter().sum::<f32>() / ch as f32;
            (m.clamp(-1.0, 1.0) * 32767.0) as i16
        })
        .collect()
}

fn pcm_i16_mono(s: &[i16], ch: usize) -> Vec<i16> {
    s.chunks(ch)
        .map(|f| (f.iter().map(|&v| v as i32).sum::<i32>() / ch as i32) as i16)
        .collect()
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    /// True render-path test: captures the WASAPI render mix for 8 s while
    /// the operator plays audio to the default output (e.g. the TTS probe
    /// wav). Dumps raw PCM for follow-up transcription and asserts the mix
    /// was non-silent. Fails honestly when no render device mixes.
    ///
    /// Hardware-gated: runs only with FREEFLOW_TEST_LOOPBACK=1 (CI runners
    /// have no audible mix), otherwise skips with a message.
    #[test]
    fn capture_render_mix() {
        if std::env::var("FREEFLOW_TEST_LOOPBACK").as_deref() != Ok("1") {
            println!("FREEFLOW_TEST_LOOPBACK != 1 — skipping hardware loopback test");
            return;
        }
        let dump = std::env::var("FREEFLOW_LOOPBACK_DUMP").unwrap_or_else(|_| {
            r"C:\Users\PC\AppData\Local\Temp\opencode\loopback.pcm".to_string()
        });
        let (tx, rx) = std::sync::mpsc::channel();
        let stop = Arc::new(AtomicBool::new(false));
        let stop2 = stop.clone();
        let h = std::thread::spawn(move || match capture(tx, stop2) {
            Ok(()) => println!("loopback capture exited cleanly"),
            Err(e) => println!("loopback capture failed: {e:#}"),
        });
        std::thread::sleep(std::time::Duration::from_secs(8));
        stop.store(true, Ordering::SeqCst);
        let _ = h.join();
        let chunks: Vec<Vec<i16>> = rx.try_iter().collect();
        let total: usize = chunks.iter().map(|c| c.len()).sum();
        let peak: i16 = chunks.iter().flatten().map(|s| s.abs()).max().unwrap_or(0);
        println!(
            "loopback: {} chunks, {total} samples, peak {peak}",
            chunks.len()
        );
        let bytes: Vec<u8> = chunks
            .concat()
            .iter()
            .flat_map(|s| s.to_le_bytes())
            .collect();
        std::fs::write(&dump, &bytes).unwrap();
        assert!(total > 16000, "expected >1s of audio, got {total} samples");
        assert!(peak > 1000, "expected non-silent audio, peak {peak}");
    }
}
