import { useEffect, useState } from "react";
import type { Transform } from "../lib/api";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";

const input =
  "rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none placeholder:text-faint focus:border-muted";

// Transforms split out of Snippets: named polish presets for the local model.
export function Transforms() {
  const [rows, setRows] = useState<Transform[]>([]);
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");

  const load = () => api.transforms().then(setRows).catch(() => {});
  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <h2 className="text-lg font-bold tracking-tight">Transforms</h2>
      <p className="mt-1 text-sm text-muted">
        Custom instructions applied to a dictation by the local model. They work
        anywhere you write.
      </p>
      <div className="mt-3 flex gap-2">
        <input
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
