import { useEffect, useState } from "react";
import type { Settings } from "../lib/api";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";

// Shortcuts: the push-to-talk hotkey plus what each key does.
export function Shortcuts() {
  const [s, setS] = useState<Settings | null>(null);
  const [saved, setSaved] = useState("");

  useEffect(() => {
    api.settings().then(setS).catch(() => {});
  }, []);

  if (!s) return <p className="text-sm text-muted">Loading…</p>;

  const save = () =>
    api
      .updateSettings(s)
      .then(() => setSaved("Saved."))
      .catch((e) => setSaved(String(e)));

  return (
    <div>
      <h2 className="text-lg font-bold tracking-tight">Shortcuts</h2>
      <p className="mt-1 text-sm text-muted">Customize how you talk to Flow.</p>
      <div className="mt-3 rounded-card border border-border bg-surface p-4 shadow-card">
        <label className="block text-sm font-medium">
          Push to talk
          <input
            className="mt-1 w-full rounded-lg border border-border bg-surface px-2.5 py-2 text-sm outline-none focus:border-muted"
            value={s.hotkey}
            onChange={(e) => setS({ ...s, hotkey: e.target.value })}
          />
        </label>
        <p className="mt-1.5 text-[13px] text-faint">
          Hold it anywhere to dictate, release to type. Restart-free: rebinding
          applies instantly.
        </p>
        <div className="mt-3 flex items-center gap-3">
          <Button onClick={save}>Save</Button>
          {saved && <span className="text-sm text-muted">{saved}</span>}
        </div>
      </div>
      <div className="mt-3 rounded-card border border-border bg-surface p-4 shadow-card">
        <h3 className="text-sm font-bold">How dictation works</h3>
        <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-muted">
          <li>Hold the hotkey, speak, release — text lands in the focused field.</li>
          <li>Long texts paste via clipboard automatically.</li>
          <li>Your words never leave this machine.</li>
        </ul>
      </div>
    </div>
  );
}
