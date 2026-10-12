import { useEffect, useState } from "react";
import type { Snippet, Transform } from "../lib/api";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";

const input =
  "rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none placeholder:text-faint focus:border-muted";

export function Snippets() {
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [transforms, setTransforms] = useState<Transform[]>([]);
  const [trigger, setTrigger] = useState("");
  const [expansion, setExpansion] = useState("");
  const [tName, setTName] = useState("");
  const [tPrompt, setTPrompt] = useState("");

  const load = () => {
    api.snippets().then(setSnippets).catch(() => {});
    api.transforms().then(setTransforms).catch(() => {});
  };
  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-lg font-bold tracking-tight">Snippets</h2>
        <p className="mt-1 text-sm text-muted">
          Short triggers that expand into full text.
        </p>
        <div className="mt-3 flex gap-2">
          <input
            className={`${input} w-32`}
            placeholder="trigger"
            value={trigger}
            onChange={(e) => setTrigger(e.target.value)}
          />
          <input
            className={`${input} flex-1`}
            placeholder="expansion"
            value={expansion}
            onChange={(e) => setExpansion(e.target.value)}
          />
          <Button
            onClick={() => {
              if (!trigger.trim() || !expansion) return;
              api
                .snippetUpsert({
                  id: crypto.randomUUID(),
                  trigger: trigger.trim(),
                  expansion,
                })
                .then(() => {
                  setTrigger("");
                  setExpansion("");
                  load();
                });
            }}
          >
            Save
          </Button>
        </div>
        <div className="mt-3 space-y-2">
          {snippets.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between rounded-card border border-border bg-surface px-3.5 py-2.5 shadow-card"
            >
              <span className="text-[15px]">
                <code className="rounded bg-wash px-1.5 py-0.5 font-semibold">
                  {s.trigger}
                </code>
                <span className="ml-2 text-muted">{s.expansion}</span>
              </span>
              <Button variant="ghost" size="sm" onClick={() => api.snippetRemove(s.id).then(load)}>
                Remove
              </Button>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-bold tracking-tight">Transforms</h2>
        <p className="mt-1 text-sm text-muted">
          Named polish presets, applied with the optional local model.
        </p>
        <div className="mt-3 flex gap-2">
          <input
            className={`${input} w-32`}
            placeholder="name"
            value={tName}
            onChange={(e) => setTName(e.target.value)}
          />
          <input
            className={`${input} flex-1`}
            placeholder="instructions, e.g. make it one terse line"
            value={tPrompt}
            onChange={(e) => setTPrompt(e.target.value)}
          />
          <Button
            onClick={() => {
              if (!tName.trim() || !tPrompt) return;
              api
                .transformUpsert({ name: tName.trim(), prompt: tPrompt, builtin: false })
                .then(() => {
                  setTName("");
                  setTPrompt("");
                  load();
                });
            }}
          >
            Save
          </Button>
        </div>
        <div className="mt-3 space-y-2">
          {transforms.map((t) => (
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
      </section>
    </div>
  );
}
