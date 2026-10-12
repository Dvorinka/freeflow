# Contributing to FreeFlow

## Workflow

- Feature branches, PR-first. Never push to `main` directly.
- Every commit carries the trailer: `Authored By: TDvorak <info@tdvorak.dev>`
- One concern per commit; small modules; stdlib-first, no speculative abstractions.

## Pre-push gate (non-negotiable)

All four green before any push:

```bash
cd src-tauri && cargo build      # must be warning-free
cd src-tauri && cargo test       # full suite (live sidecar test included when frozen)
npm run lint                     # strict tsc
node scripts/cdp-smoke.mjs       # UI smoke vs the running app (WebView2 :9223)
```

Plus `python scripts/ipc-parity.py` after any IPC change.

## Hardware tests

- `capture_render_mix` needs a real render mix: set `FREEFLOW_TEST_LOOPBACK=1`
  and play audio to the default output while it captures (CI skips it).
- `mic_open_if_present` passes with zero devices but only exercises capture
  when a mic exists. There is no fake-mic harness by design — dictation is
  verified with real audio or not at all.

## Clean-room rule

FreeFlow is a clean-room implementation. Do not copy code from any
proprietary dictation product — behavior notes only, own code always.
