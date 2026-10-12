import { useEffect, useState } from "react";
import type { Snippet } from "../lib/api";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";
import { Banner, H } from "../components/Banner";

export function Snippets() {
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [trigger, setTrigger] = useState("");
  const [expansion, setExpansion] = useState("");

  const load = () => api.snippets().then(setSnippets).catch(() => {});
  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <h2 className="font-serif text-[28px] font-semibold tracking-tight">Snippets</h2>
      <p className="mt-1 text-sm text-muted">
        Save text you type often — an email, intro, or prompt — then say a word
        to drop it in instantly.
      </p>
      <div className="mt-3">
        <Banner dark
          title={<>Say a word, <H>drop it in</H>.</>}
          body="Save an intro, link, or rewrite prompt once, then speak its trigger anywhere."
          action="Add new snippet"
          onAction={() => document.getElementById("snippet-trigger")?.focus()}
        />
      </div>
      <div className="mt-3 flex gap-2">
        <input
          id="snippet-trigger"
          className="w-32 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none placeholder:text-faint focus:border-muted"
          placeholder="trigger"
          value={trigger}
          onChange={(e) => setTrigger(e.target.value)}
        />
        <input
          className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none placeholder:text-faint focus:border-muted"
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
      <div className="mt-3 divide-y divide-border rounded-card border border-border bg-surface shadow-card">
        {snippets.map((s) => (
          <div
            key={s.id}
            className="flex items-center justify-between px-4 py-3"
          >
            <span className="min-w-0 truncate text-[15px]">
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
        {snippets.length === 0 && (
          <p className="px-4 py-3 text-sm text-muted">No snippets yet.</p>
        )}
      </div>
    </div>
  );
}
