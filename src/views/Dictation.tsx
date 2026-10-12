import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { IconMic } from "../components/icons";

// Home: big mic, hotkey hint, today's count. Mirrors the Dictation landing.
export function Dictation() {
  const [dictating, setDictating] = useState(false);
  const [today, setToday] = useState(0);
  const [words, setWords] = useState(0);
  const [err, setErr] = useState("");

  useEffect(() => {
    api
      .history(1000)
      .then((rows) => {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const t = rows.filter((r) => r.timestamp >= start.getTime());
        setToday(t.length);
        setWords(t.reduce((a, r) => a + r.numWords, 0));
      })
      .catch(() => {});
  }, []);

  const toggle = () => {
    setErr("");
    if (dictating) {
      api.stopDictation().then(
        () => setDictating(false),
        (e) => setErr(String(e)),
      );
    } else {
      api.startDictation().then(
        () => setDictating(true),
        (first) =>
          api.cancelDictation().then(
            () =>
              api.startDictation().then(
                () => setDictating(true),
                (e) => setErr(String(e)),
              ),
            () => setErr(String(first)),
          ),
      );
    }
  };

  return (
    <div>
      <h2 className="text-lg font-bold tracking-tight">Dictation</h2>
      <p className="mt-1 text-sm text-muted">
        Hold your hotkey anywhere, speak, release — words land where you left off.
      </p>
      <div className="mt-4 flex flex-col items-center rounded-card border border-border bg-surface py-8 shadow-card">
        <button
          onClick={toggle}
          aria-label={dictating ? "Stop dictation" : "Start dictation"}
          className={`flex h-20 w-20 items-center justify-center rounded-full transition-colors ${
            dictating ? "bg-red-600 text-white" : "bg-ink text-white hover:bg-black"
          }`}
        >
          <IconMic className="h-8 w-8" />
        </button>
        <p className="mt-3 text-sm font-semibold">
          {dictating ? "Listening — press again to finish" : "Press to dictate"}
        </p>
        {err && <p className="mt-1 text-sm text-red-600">{err}</p>}
        <div className="mt-4 flex gap-6 text-center">
          <div>
            <p className="text-xl font-bold">{today}</p>
            <p className="text-xs text-faint">dictations today</p>
          </div>
          <div>
            <p className="text-xl font-bold">{words}</p>
            <p className="text-xs text-faint">words today</p>
          </div>
        </div>
      </div>
    </div>
  );
}
