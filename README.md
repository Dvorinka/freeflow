# FreeFlow — local, open-source voice typing

Dictation, polish, and meeting notes that run entirely on-device. No cloud
STT, no cloud LLM, no account, no telemetry. Clean-room implementation;
see [DESIGN.md](DESIGN.md) for the architecture.

## Status

Early but working: the Rust backend builds warning-free, the faster-whisper
sidecar transcribes on-box (verified: synthesized *"The quick brown fox…"*
→ exact text, ~4 s for 3 s of audio on CPU with `small.en`), and the React
frontend builds under strict TS. Not yet done: global-hotkey end-to-end
smoke test, sidecar freeze (PyInstaller exe), installer packaging.

## Stack

- App: Tauri 2 + Rust (tray, windows, hotkey, mic, injection, sqlite)
- UI: React 18 + Vite + strict TS + Tailwind
- STT: faster-whisper sidecar (frozen Python exe, local HTTP on 127.0.0.1)
- Polish: deterministic rules by default; optional local Ollama model

## Develop

```powershell
# backend (one-time: Rust toolchain + MSVC build tools required)
cd src-tauri
cargo build
cargo test

# frontend
npm install
npm run dev      # http://localhost:1420 (used by `cargo tauri dev`)
npm run build    # tsc + vite -> dist/

# whisper sidecar (dev: run from source)
cd sidecar
.\.venv\Scripts\python.exe freeflow_whisper.py   # prints PORT <n>

# freeze to a single exe (reproducible: sidecar/build.ps1)
.\build.ps1   # -> dist/whisper-sidecar/freeflow-whisper.exe (+ dev copy)
```

The app expects the frozen sidecar next to the app binary
(`whisper-sidecar/freeflow-whisper.exe`); in dev it falls back to
`sidecar/freeflow-whisper.exe`.

## Dictation pipeline

Hotkey → cpal mic capture (16 kHz mono) → sidecar `/transcribe`
(dictionary-biased prompt) → rules cleanup or Ollama polish →
SendInput typing (clipboard+paste fallback) → sqlite history.

Hold the hotkey to talk, release to type. Model switcher (English-only
`.en` vs multilingual) lives in Settings.

## Layout

```
src-tauri/src/   audio inject foreapp stt cleanup store commands meetings loopback tray
sidecar/         freeflow_whisper.py  (tiny HTTP API: /health /models /transcribe)
src/             App + views (overlay history dictionary snippets meetings settings)
```

## License

MIT — see [LICENSE](LICENSE).
