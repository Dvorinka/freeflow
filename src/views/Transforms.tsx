import { useEffect, useState } from "react";
import type { Settings, Transform } from "../lib/api";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";
import { Banner, H } from "../components/Banner";

const input =
  "rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none placeholder:text-faint focus:border-muted";

// Transforms split out of Snippets: named polish presets for the local model.
export function Transforms() {
  const [rows, setRows] = useState<Transform[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");

  const load = () => {
    api.transforms().then(setRows).catch(() => {});
    api.settings().then(setSettings).catch(() => {});
  };
  useEffect(() => {
    load();
  }, []);

  const setAuto = (id: string) => {
    if (!settings) return;
    const next = { ...settings, autoTransform: id };
    setSettings(next);
    api.updateSettings(next).catch(() => {});
  };

  return (
    <div>
      <div className="flex items-center gap-2">
        <h2 className="font-serif text-[28px] font-semibold tracking-tight">Transforms</h2>
        <span className="rounded-md bg-ink px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
          Beta
        </span>
      </div>
      <p className="mt-1 text-sm text-muted">
        Custom instructions applied to a dictation by the local model. They work
        anywhere you write.
      </p>
      <div className="mt-3">
        <Banner dark
          title={<><H>Transform</H> works anywhere you write</>}
          body="Apply a Transform to rewrite, clean up, or restructure text after you dictate."
          action="Try it out"
          onAction={() => document.getElementById("transform-name")?.focus()}
        />
      </div>
      <div className="mt-3 flex items-center justify-between rounded-card border border-border bg-surface px-3.5 py-3 shadow-card">
        <div>
          <p className="text-[15px] font-semibold">Auto Apply After Dictation</p>
          <p className="text-[13px] text-faint">
            Run a transform on everything you dictate, automatically (local model mode).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-muted"
            value={settings?.autoTransform ?? ""}
            onChange={(e) => setAuto(e.target.value)}
          >
            <option value="">Off</option>
            {rows.map((t) => (
              <option key={t.name} value={t.name}>{t.name}</option>
            ))}
          </select>
          <button
            role="switch"
            aria-checked={(settings?.autoTransform ?? "") !== ""}
            onClick={() => setAuto((settings?.autoTransform ?? "") !== "" ? "" : "Polish")}
            className={`relative h-6 w-11 rounded-full transition-colors ${
              (settings?.autoTransform ?? "") !== "" ? "bg-ink" : "bg-soft"
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                (settings?.autoTransform ?? "") !== "" ? "left-[22px]" : "left-0.5"
              }`}
            />
          </button>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between">
        <h3 className="font-serif text-xl font-semibold">My Transforms</h3>
      </div>
      <div className="mt-2 flex gap-2">
        <input
          id="transform-name"
          className={`${input} w-32`}
          placeholder="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className={`${input} flex-1`}
          placeholder="instructions, e.g. make it one terse line"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <Button
          onClick={() => {
            if (!name.trim() || !prompt) return;
            api
              .transformUpsert({ name: name.trim(), prompt, builtin: false })
              .then(() => {
                setName("");
                setPrompt("");
                load();
              });
          }}
        >
          Save
        </Button>
      </div>
      <div className="mt-3 space-y-2">
        {rows.map((t) => (
          <div
            key={t.name}
            className="flex items-center justify-between rounded-card border border-border bg-surface px-3.5 py-2.5 shadow-card"
          >
            <span className="text-[15px] font-medium">
              {t.name}
              <span className="ml-2 text-[13px] font-normal text-faint">{t.prompt}</span>
            </span>
            {!t.builtin && (
              <Button variant="ghost" size="sm" onClick={() => api.transformRemove(t.name).then(load)}>
                Remove
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
