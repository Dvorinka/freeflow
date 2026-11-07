import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";

export const WELCOME_KEY = "freeflow.welcomed";

// First-run welcome: mic check with live level meter, honest states when
// no microphone exists. Dismissal persists per profile.
export function Welcome({ onDone }: { onDone: () => void }) {
  const [devices, setDevices] = useState<string[]>([]);
  const [mic, setMic] = useState("");
  const [state, setState] = useState<"idle" | "live" | "none" | "busy" | "denied">("idle");
  const [level, setLevel] = useState(0);
  const raf = useRef(0);
  const stopFn = useRef<(() => void) | null>(null);

  useEffect(() => {
    api.audioDevices().then(setDevices).catch(() => {});
    return () => {
      cancelAnimationFrame(raf.current);
      stopFn.current?.();
    };
  }, []);

  const stop = () => {
    cancelAnimationFrame(raf.current);
    stopFn.current?.();
    stopFn.current = null;
  };

  const test = async () => {
    stop();
    setState("busy");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: mic ? { deviceId: { exact: mic } } : true,
      });
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      stopFn.current = () => {
        stream.getTracks().forEach((t) => t.stop());
        ctx.close().catch(() => {});
      };
      setState("live");
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, v) => a + v, 0) / data.length / 255;
        setLevel(avg);
        raf.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) {
      const name = e instanceof DOMException ? e.name : "";
      setState(name === "NotAllowedError" ? "denied" : "none");
    }
  };

  const finish = () => {
    stop();
    localStorage.setItem(WELCOME_KEY, "1");
    onDone();
  };

  return (
    <div>
      <h2 className="font-serif text-[28px] font-semibold tracking-tight">Welcome to FreeFlow</h2>
      <p className="mt-1 text-sm text-muted">
        Voice typing that never leaves this machine. Two steps and you're dictating.
      </p>

      <div className="mt-4 rounded-2xl bg-gradient-to-br from-[#2b2118] via-[#1a1a1a] to-black p-5 text-white shadow-card">
        <p className="font-serif text-xl">Test your microphone</p>
        <p className="mt-1 text-sm text-white/70">
          Built-in or wired microphones work best. Bluetooth devices are less reliable.
        </p>
        <div className="mt-3 flex gap-2">
          <select
            aria-label="Microphone"
            className="flex-1 rounded-lg border border-white/20 bg-white/10 px-2.5 py-2 text-sm text-white outline-none [&>option]:text-black"
            value={mic}
            onChange={(e) => setMic(e.target.value)}
          >
            <option value="">System default</option>
            {devices.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <button
            onClick={test}
            className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-ink hover:bg-white/90"
          >
            {state === "live" ? "Retest" : "Start test"}
          </button>
        </div>
        {state === "live" && (
          <div className="mt-3">
            <div className="h-2 overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full rounded-full bg-emerald-400 transition-[width]"
                style={{ width: `${Math.min(100, Math.round(level * 300))}%` }}
              />
            </div>
            <p className="mt-1.5 text-[13px] text-white/70">
              Do you see the bar move while you speak?
            </p>
          </div>
        )}
        {state === "none" && (
          <p className="mt-3 rounded-lg bg-white/10 px-3 py-2 text-sm">
            No microphone detected. Connect a microphone or check that one is enabled.
          </p>
        )}
        {state === "denied" && (
          <p className="mt-3 rounded-lg bg-white/10 px-3 py-2 text-sm">
            Microphone access was blocked. Allow it in the browser prompt and try again.
          </p>
        )}
        {state === "busy" && (
          <p className="mt-3 text-sm text-white/70">Listening for your mic…</p>
        )}
      </div>

      <div className="mt-3 rounded-card border border-border bg-surface p-4 shadow-card">
        <p className="text-[13px] font-bold uppercase tracking-wide text-faint">Quick tip</p>
        <p className="mt-1 text-sm">
          A wired headset or desk microphone also works well. Get close and speak normally.
        </p>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button onClick={finish}>You're ready — start dictating</Button>
      </div>
    </div>
  );
}
