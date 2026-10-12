import { useState } from "react";
import { History } from "./views/History";
import { Dictionary } from "./views/Dictionary";
import { Snippets } from "./views/Snippets";
import { Meetings } from "./views/Meetings";
import { SettingsView } from "./views/Settings";
import { api } from "./lib/api";
import { Button } from "./components/ui/button";
import { cn } from "./lib/utils";

const TABS = [
  ["history", "History"],
  ["dictionary", "Dictionary"],
  ["snippets", "Snippets"],
  ["meetings", "Meetings"],
  ["settings", "Settings"],
] as const;

type Tab = (typeof TABS)[number][0];

export function App() {
  const [tab, setTab] = useState<Tab>("history");
  const [dictating, setDictating] = useState(false);
  const [err, setErr] = useState("");

  const toggleDictation = () => {
    setErr("");
    if (dictating) {
      api
        .stopDictation()
        .then(() => setDictating(false))
        .catch((e) => setErr(String(e)));
    } else {
      api
        .startDictation()
        .then(() => setDictating(true))
        .catch((e) => setErr(String(e)));
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">FreeFlow</h1>
        <Button
          variant={dictating ? "danger" : "default"}
          onClick={toggleDictation}
        >
          {dictating ? "Stop dictation" : "Dictate"}
        </Button>
      </header>
      {err && <p className="text-sm text-red-400">{err}</p>}
      <nav className="flex gap-1 border-b border-border pb-2">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm",
              tab === id ? "bg-surface font-medium" : "text-muted hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </nav>
      {tab === "history" && <History />}
      {tab === "dictionary" && <Dictionary />}
      {tab === "snippets" && <Snippets />}
      {tab === "meetings" && <Meetings />}
      {tab === "settings" && <SettingsView />}
    </div>
  );
}
