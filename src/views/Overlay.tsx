import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { DictationPhase } from "../lib/api";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";

const PHASE_LABEL: Record<DictationPhase, string> = {
  idle: "Idle",
  listening: "Listening…",
  transcribing: "Transcribing…",
  polishing: "Polishing…",
  injecting: "Typing…",
};

export function Overlay() {
  const [phase, setPhase] = useState<DictationPhase>("idle");

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<DictationPhase>("dictation:phase", (e) => setPhase(e.payload)).then(
      (fn) => (unlisten = fn),
    );
    return () => unlisten?.();
  }, []);

  if (phase === "idle") return null;

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="flex items-center gap-3 rounded-full border border-border bg-surface/90 px-5 py-2 shadow-xl">
        <span className="relative flex h-3 w-3">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
        </span>
        <span className="text-sm font-medium">{PHASE_LABEL[phase]}</span>
        <Button
          variant="secondary"
          onClick={() => api.cancelDictation().catch(() => {})}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
