import { useEffect, useState } from "react";
import type { Snippet, Transform } from "../lib/api";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";

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
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Snippets</h2>
        <div className="flex gap-2">
          <input
            className="w-32 rounded-md border border-border bg-surface px-3 py-1.5 text-sm"
            placeholder="trigger"
            value={trigger}
            onChange={(e) => setTrigger(e.target.value)}
          />
          <input
            className="flex-1 rounded-md border border-border bg-surface px-3 py-1.5 text-sm"
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
        {snippets.map((s) => (
          <div
            key={s.id}
            className="flex items-center justify-between rounded-md border border-border bg-surface px-3 py-2 text-sm"
          >
            <span>
              <code className="text-accent">{s.trigger}</code>
              <span className="ml-2 text-muted">{s.expansion}</span>
            </span>
            <Button variant="danger" onClick={() => api.snippetRemove(s.id).then(load)}>
              Remove
            </Button>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Transforms</h2>
        <p className="text-sm text-muted">
          Named polish presets, applied with the optional local LLM.
        </p>
        <div className="flex gap-2">
          <input
            className="w-32 rounded-md border border-border bg-surface px-3 py-1.5 text-sm"
            placeholder="name"
            value={tName}
            onChange={(e) => setTName(e.target.value)}
          />
          <input
            className="flex-1 rounded-md border border-border bg-surface px-3 py-1.5 text-sm"
            placeholder="prompt"
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
        {transforms.map((t) => (
          <div
            key={t.name}
            className="flex items-center justify-between rounded-md border border-border bg-surface px-3 py-2 text-sm"
          >
            <span>
              {t.name}
              <span className="ml-2 text-xs text-muted">{t.prompt}</span>
            </span>
            {!t.builtin && (
              <Button variant="danger" onClick={() => api.transformRemove(t.name).then(load)}>
                Remove
              </Button>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
