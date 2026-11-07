import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { DictationPhase } from "../lib/api";
import { api } from "../lib/api";

// Dark pill near the cursor, mirrored on the dictation lifecycle:
// animated bars while listening, still pill with status while working.
const PHASE_TEXT: Record<Exclude<DictationPhase, "idle">, string> = {
  listening: "Listening…",
  transcribing: "Working…",
  polishing: "Working…",
  injecting: "Typing…",
};

function Bars({ live }: { live: boolean }) {
  return (
    <span className={`ff-bars flex h-4 items-center gap-[3px]${live ? "" : " paused"}`}>
      {[10, 16, 12, 14, 8].map((h, i) => (
        <span
          key={i}
          className="w-[3px] rounded-full bg-white"
          style={{ height: h }}
        />
      ))}
    </span>
  );
}

export function Overlay() {
  const [phase, setPhase] = useState<DictationPhase>("idle");
  const [hotkey, setHotkey] = useState("");

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<DictationPhase>("dictation:phase", (e) => setPhase(e.payload)).then(
      (fn) => (unlisten = fn),
    );
    api.settings().then((s) => setHotkey(s.hotkey)).catch(() => {});
    return () => unlisten?.();
  }, []);

  if (phase === "idle") return null;

  return (
    <div className="flex h-screen items-center justify-center bg-transparent">
      <div className="flex items-center gap-3 rounded-full bg-[#1a1a1a] py-2.5 pl-4 pr-5 text-white shadow-pill">
        <span className="flex h-4 w-4 items-center justify-center">
          <span className="h-2 w-2 rounded-full bg-red-500" />
        </span>
        <Bars live={phase === "listening"} />
        <span className="text-sm font-medium">{PHASE_TEXT[phase]}</span>
        <span className="text-xs text-white/50">
          {phase === "listening"
            ? hotkey
              ? `hold ${hotkey} while speaking, release to see text`
              : "release to finish"
            : "hang tight"}
        </span>
      </div>
    </div>
  );
}
