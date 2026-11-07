"""FreeFlow whisper sidecar: faster-whisper over a tiny local HTTP API.

The Tauri app spawns this frozen exe, reads `PORT <n>` from stdout, then
calls:
  GET  /health                    -> {ok, model, device}
  GET  /models                    -> [{id, downloaded, active}]
  POST /models/select  {id}       -> download if needed + activate
  POST /transcribe?language=&prompt=   body = 16 kHz mono int16 LE PCM
                                  -> {text, segments, language, avgLogprob, durationS}

Everything stays on-device; models download once from Hugging Face into
%APPDATA%/dev.tdvorak.freeflow/models.
"""

import io
import json
import os
import sys
import threading
import time
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MODELS = [
    "tiny.en",
    "base.en",
    "small.en",
    "medium.en",
    "large-v3-turbo",
    "large-v3",
]
DEFAULT_MODEL = os.environ.get("FREEFLOW_MODEL", "small.en")


def models_dir() -> str:
    base = os.environ.get("APPDATA") or os.path.expanduser("~")
    d = os.path.join(base, "dev.tdvorak.freeflow", "models")
    os.makedirs(d, exist_ok=True)
    return d


class Engine:
    """Lazy-loaded faster-whisper engine with a select lock."""

    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.model = None
        self.model_id = None
        self.selecting = False
        self.error = None

    def _import_fw(self):
        from faster_whisper import WhisperModel  # deferred: cold start cost
        return WhisperModel

    def is_downloaded(self, mid: str) -> bool:
        # faster-whisper caches HF-hub style: models--Systran--faster-whisper-<id>
        root = models_dir()
        slug = mid.replace("/", "--")
        for name in (
            f"models--Systran--faster-whisper-{slug}",
            f"models--{slug}",
            mid,
        ):
            if os.path.isdir(os.path.join(root, name)):
                return True
        return False

    def ensure(self, mid: str) -> None:
        with self.lock:
            if self.model_id == mid and self.model is not None:
                return
            self.selecting = True
            self.error = None
            try:
                WhisperModel = self._import_fw()
                self.model = WhisperModel(
                    mid,
                    device="cpu",
                    compute_type="int8",
                    download_root=models_dir(),
                )
                self.model_id = mid
            except Exception as e:  # surfaced via /health and select
                self.error = str(e)
                self.model = None
                self.model_id = None
                raise
            finally:
                self.selecting = False

    def transcribe(self, pcm_bytes: bytes, language: str, prompt: str) -> dict:
        import numpy as np
        self.ensure(self.model_id or DEFAULT_MODEL)
        audio = np.frombuffer(pcm_bytes, dtype=np.int16).astype(np.float32) / 32768.0
        t0 = time.time()
        segments, info = self.model.transcribe(
            audio,
            language=None if language in ("", "auto") else language,
            initial_prompt=prompt or None,
            vad_filter=True,
            beam_size=1,
            condition_on_previous_text=False,
        )
        segs = []
        text_parts = []
        logprobs = []
        for s in segments:
            segs.append({"start": s.start, "end": s.end, "text": s.text})
            text_parts.append(s.text)
            if s.avg_logprob is not None:
                logprobs.append(s.avg_logprob)
        return {
            "text": "".join(text_parts).strip(),
            "segments": segs,
            "language": getattr(info, "language", "") or "",
            "avgLogprob": (sum(logprobs) / len(logprobs)) if logprobs else 0.0,
            "durationS": round(time.time() - t0, 3),
        }


ENGINE = Engine()


class Handler(BaseHTTPRequestHandler):
    server_version = "freeflow-whisper/0.1"

    def log_message(self, *_a):  # quiet
        pass

    def _json(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self):
        n = int(self.headers.get("content-length") or 0)
        try:
            return json.loads(self.rfile.read(n) or b"{}")
        except Exception:
            return {}

    def do_GET(self):  # noqa: N802
        if self.path.startswith("/health"):
            self._json({
                "ok": ENGINE.error is None,
                "model": ENGINE.model_id,
                "selecting": ENGINE.selecting,
                "error": ENGINE.error,
            })
        elif self.path.startswith("/models"):
            self._json([
                {"id": m, "downloaded": ENGINE.is_downloaded(m),
                 "active": ENGINE.model_id == m}
                for m in MODELS
            ])
        else:
            self.send_error(404)

    def do_POST(self):  # noqa: N802
        from urllib.parse import urlparse, parse_qs
        u = urlparse(self.path)
        if u.path == "/models/select":
            mid = (self._read_json().get("id") or "").strip()
            if mid not in MODELS:
                self._json({"error": f"unknown model {mid}"}, 400)
                return
            try:
                ENGINE.ensure(mid)
                self._json({"ok": True, "model": mid})
            except Exception as e:
                self._json({"error": str(e)}, 500)
        elif u.path == "/transcribe":
            q = parse_qs(u.query)
            language = (q.get("language") or ["auto"])[0]
            prompt = (q.get("prompt") or [""])[0]
            n = int(self.headers.get("content-length") or 0)
            pcm = self.rfile.read(n)
            try:
                self._json(ENGINE.transcribe(pcm, language, prompt))
            except Exception as e:
                self._json({"error": str(e)}, 500)
        else:
            self.send_error(404)


def main() -> None:
    srv = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    print(f"PORT {srv.server_address[1]}", flush=True)
    # Preload the default model in the background so first dictation is fast.
    threading.Thread(
        target=lambda: ENGINE.ensure(DEFAULT_MODEL), daemon=True
    ).start()
    srv.serve_forever()


if __name__ == "__main__":
    main()
