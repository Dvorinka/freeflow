# FreeFlow — local, open-source voice typing

FreeFlow is an open-source reconstruction of Wispr Flow's local-relevant
feature surface, built from a read of its shipped 1.6.1102 bundle
(`app.asar` + helper executable). Everything runs on-device: no cloud STT,
no cloud LLM, no account, no telemetry.

## What the original does (recon summary)

- **Dictation**: hidden renderer captures mic via `getUserMedia`, Opus-encodes
  chunks at 24 kHz, streams to `api.wisprflow.ai`. Streaming partial text
  types into the focused field in real time. A C# helper exe monitors the
  focused textbox over UIA, injects keystrokes, and reports the foreground
  app for app-aware styling.
- **Polish**: raw ASR text is re-formatted server-side (`polished_text`).
  Named user "transforms" (custom prompt presets), formatting toggles
  (filler removal, verbatim), per-app styles (code, email, chat, document,
  casual, formal, verbose), per-user voice preferences learned from edits
  (`asrText → formattedText → editedText` divergence).
- **Context**: history rows store a screenshot and `additionalContext` —
  the app uses screen context to disambiguate names/emails.
- **Dictionary**: personal vocabulary table (`phrase`, `lastUsed/Seen`,
  `frequencyUsed/Seen`, `manuallyAdded`) biasing recognition toward the
  user's names and jargon.
- **Meeting recorder**: separate mic + WASAPI system-audio capture through
  Opus encoder workers → live transcript, attendees/speaker assignment,
  playback, AI summaries, todos, ask/chat over the transcript.
- **Other surface**: scratchpad, history, snippets, onboarding, PostHog
  analytics, billing/subscription, teams, calendar, browser extension,
  agent hook bridge — cloud-coupled; out of scope by design.

## FreeFlow architecture

```
+-------------------+        HTTP/stdio         +---------------------------+
|  Tauri app (Rust) |  <--------------------->  | faster-whisper sidecar    |
|  tray + windows   |                           | (frozen Python exe)       |
+-------------------+                           +---------------------------+
|  audio.rs   mic capture (cpal) -> 16 kHz mono PCM                          |
|  hotkey.rs  global hotkey (hold = PTT, tap-toggle = hands-free)            |
|  stt.rs     chunk + stream to sidecar, partial + final segments            |
|  cleanup.rs rule cleanup -> optional local LLM polish (Ollama HTTP)        |
|  foreapp.rs foreground process -> app category (code/email/chat/doc/...)   |
|  inject.rs  SendInput unicode typing; clipboard+Ctrl+V fallback            |
|  meetings.rs mic + WASAPI loopback -> wav; post-meeting transcribe/notes   |
|  store.rs   sqlite: history, dictionary, snippets, transforms, meetings    |
+---------------------------------------------------------------------------+
```

### Dictation pipeline

1. Hotkey down → `audio.rs` opens mic, PCM buffered at 16 kHz mono.
2. Chunks (~250 ms) feed `stt.rs`; sidecar transcribes incrementally →
   partial text shown in overlay (and optionally typed live).
3. Hotkey up → final transcription → `cleanup.rs`:
   - rule pass: filler removal, casing, punctuation, dictionary bias via
     `initial_prompt` (dictionary phrases + recent history),
   - optional polish pass via local Ollama model using the per-app
     style prompt (code/email/chat/document/casual/formal).
4. `inject.rs` types the result into the previously focused window
   (SendInput Unicode), falling back to clipboard paste.
5. History row saved (raw text, cleaned text, app, language, duration).
   Edits made afterward can be captured for learned preferences.

### Meeting recorder

Mic + system loopback → wav on disk → post-meeting transcription →
optional local-LLM summary/todos. Speaker diarization is explicitly out
of scope (faster-whisper has none); transcripts are single-stream.

### Why this shape

- faster-whisper (CTranslate2) is the requested engine; a frozen Python
  sidecar keeps the Rust app small and makes model management trivial.
- Rule-based cleanup is the zero-dependency default; Ollama is optional
  and discovered, never required.
- sqlite mirrors the proven data model (history/dictionary/snippets/
  transforms) without an ORM.

## Explicitly out of scope

Accounts, billing, analytics, team features, browser extension, calendar,
speaker diarization, mobile sync, and anything requiring a remote service.
