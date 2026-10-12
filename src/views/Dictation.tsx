import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { IconMic } from "../components/icons";
import { Banner, H } from "../components/Banner";

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Consecutive-day streak ending today (or yesterday, still alive).
function streak(daySet: Set<number>): number {
  const today = startOfDay(Date.now());
  const day = 86400000;
  let cursor = daySet.has(today) ? today : today - day;
  let n = 0;
  while (daySet.has(cursor)) {
    n++;
    cursor -= day;
  }
  return n;
}

function weekStreak(daySet: Set<number>): number {
  const weeks = new Set(
    [...daySet].map((t) => {
      const d = new Date(t);
      const onejan = new Date(d.getFullYear(), 0, 1).getTime();
      return `${d.getFullYear()}-${Math.floor((t - onejan) / 604800000)}`;
    }),
  );
  const now = new Date();
  const onejan = new Date(now.getFullYear(), 0, 1).getTime();
  const cur = `${now.getFullYear()}-${Math.floor((now.getTime() - onejan) / 604800000)}`;
  const prev = `${now.getFullYear()}-${Math.floor((now.getTime() - onejan) / 604800000) - 1}`;
  const nums = [...weeks]
    .map((w) => parseInt(w.split("-")[1], 10))
    .sort((a, b) => b - a);
  const start = weeks.has(cur)
    ? parseInt(cur.split("-")[1], 10)
    : parseInt(prev.split("-")[1], 10);
  let n = 0;
  for (const k of nums) {
    if (k === start - n) n++;
    else if (k < start - n) break;
  }
  return weeks.has(cur) || weeks.has(prev) ? n : 0;
}

// Home: banner, big mic, streak stats. Mirrors the Dictation landing.
export function Dictation() {
  const [dictating, setDictating] = useState(false);
  const [stats, setStats] = useState({ day: 0, week: 0, words: 0, wpm: 0 });
  const [hotkey, setHotkey] = useState("the hotkey");
  const [err, setErr] = useState("");

  useEffect(() => {
    api.settings().then((s) => setHotkey(s.hotkey)).catch(() => {});
    api
      .history(5000)
      .then((rows) => {
        const days = new Set(rows.map((r) => startOfDay(r.timestamp)));
        const words = rows.reduce((a, r) => a + r.numWords, 0);
        const minutes = rows.reduce((a, r) => a + r.durationMs, 0) / 60000;
        setStats({
          day: streak(days),
          week: weekStreak(days),
          words,
          wpm: minutes > 0 ? Math.round(words / minutes) : 0,
        });
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

  const statsRow: [string, string][] = [
    [`${stats.day}`, "day streak"],
    [`${stats.week}`, "week streak"],
    [`${stats.words}`, "total words"],
    [`${stats.wpm}`, "wpm"],
  ];

  return (
    <div>
      <Banner dark
        title={<>Hold down <H>{hotkey}</H> to dictate</>}
        body="FreeFlow works in all your apps. Try it in email, messages, docs or anywhere else."
        action="See how it works"
        onAction={toggle}
      />
      <div className="flex flex-col items-center rounded-card border border-border bg-surface py-8 shadow-card">
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
        <div className="mt-4 grid w-full grid-cols-4 gap-2 px-6 text-center">
          {statsRow.map(([v, l]) => (
            <div key={l}>
              <p className="text-xl font-bold">{v}</p>
              <p className="text-xs text-faint">{l}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
