import { useState } from "react";
import { Dictation } from "./views/Dictation";
import { History } from "./views/History";
import { Dictionary } from "./views/Dictionary";
import { Snippets } from "./views/Snippets";
import { Transforms } from "./views/Transforms";
import { Meetings } from "./views/Meetings";
import { SettingsView } from "./views/Settings";
import { Insights } from "./views/Insights";
import { Scratchpad } from "./views/Scratchpad";
import { Style } from "./views/Style";
import { Shortcuts } from "./views/Shortcuts";
import { api } from "./lib/api";
import { cn } from "./lib/utils";
import {
  IconBook,
  IconChart,
  IconGear,
  IconHistory,
  IconKeyboard,
  IconMeet,
  IconMic,
  IconNote,
  IconSliders,
  IconWand,
  IconZap,
} from "./components/icons";

const TABS = [
  ["dictation", "Dictation", IconMic],
  ["history", "History", IconHistory],
  ["meetings", "Notetaker", IconMeet],
  ["scratchpad", "Scratchpad", IconNote],
  ["insights", "Insights", IconChart],
  ["dictionary", "Dictionary", IconBook],
  ["snippets", "Snippets", IconZap],
  ["transforms", "Transforms", IconWand],
  ["style", "Style", IconSliders],
  ["shortcuts", "Shortcuts", IconKeyboard],
  ["settings", "Settings", IconGear],
] as const;

type Tab = (typeof TABS)[number][0];

export function App() {
  const [tab, setTab] = useState<Tab>("dictation");
  const [dictating, setDictating] = useState(false);
  const [err, setErr] = useState("");

  const toggleDictation = () => {
    setErr("");
    if (dictating) {
      api.stopDictation().then(
        () => setDictating(false),
        (e) => setErr(String(e)),
      );
    } else {
      // A previous session (reload, crash) can leave the backend wedged
      // in a non-idle phase: cancel once, then start for real.
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
    <div className="flex h-screen overflow-hidden">
      {/* Rail */}
      <aside className="flex w-52 shrink-0 flex-col border-r border-border bg-surface px-3 py-4">
        <div className="flex items-center gap-2 px-2 pb-4">
          <img src="/icon.png" alt="" className="h-6 w-6 rounded-md" />
          <span className="text-[15px] font-bold tracking-tight">FreeFlow</span>
        </div>
        <nav aria-label="Main navigation" className="flex flex-col gap-0.5 overflow-y-auto">
          {TABS.map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium",
                tab === id
                  ? "bg-wash text-ink"
                  : "text-muted hover:bg-wash/60 hover:text-ink",
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {label}
            </button>
          ))}
        </nav>
        <div className="mt-auto px-2 pt-3">
          <button
            onClick={toggleDictation}
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors",
              dictating ? "bg-red-600 text-white hover:bg-red-700" : "bg-ink text-white hover:bg-black",
            )}
          >
            <IconMic className="h-4 w-4" />
            {dictating ? "Stop" : "Dictate"}
          </button>
          <p className="mt-2 text-center text-xs text-faint">
            {dictating ? "Speak now, then stop" : "Hold the hotkey anywhere"}
          </p>
        </div>
      </aside>

      {/* Content */}
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-6 py-6">
          {err && (
            <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {err}
            </p>
          )}
          {tab === "dictation" && <Dictation />}
          {tab === "history" && <History />}
          {tab === "dictionary" && <Dictionary />}
          {tab === "snippets" && <Snippets />}
          {tab === "transforms" && <Transforms />}
          {tab === "meetings" && <Meetings />}
          {tab === "settings" && <SettingsView />}
          {tab === "insights" && <Insights />}
          {tab === "scratchpad" && <Scratchpad />}
          {tab === "style" && <Style />}
          {tab === "shortcuts" && <Shortcuts />}
        </div>
      </main>
    </div>
  );
}
