import { useEffect, useState } from "react";
import type { DictEntry } from "../lib/api";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";
import { Banner, H } from "../components/Banner";

export function Dictionary() {
  const [rows, setRows] = useState<DictEntry[]>([]);
  const [phrase, setPhrase] = useState("");

  const load = () => api.dictionary().then(setRows).catch(() => {});
  useEffect(() => {
    load();
  }, []);

  const add = () => {
    const p = phrase.trim();
    if (!p) return;
    api.dictAdd(p).then(() => {
      setPhrase("");
      load();
    });
  };

  return (
    <div>
      <h2 className="font-serif text-[28px] font-semibold tracking-tight">Dictionary</h2>
      <p className="mt-1 text-sm text-muted">
        Words FreeFlow always gets right. Add names and terms you use — they bias
        transcription in your favor.
      </p>
      <div className="mt-3">
        <Banner dark
          title={<>FreeFlow spells the way <H>you</H> do.</>}
          body="Correct a spelling once or add it here manually, so your personal terms and uncommon names come out right."
          action="Add new word"
          onAction={() => document.getElementById("dict-input")?.focus()}
        />
      </div>
      <div className="mt-3 flex gap-2">
        <input
          id="dict-input"
          className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none placeholder:text-faint focus:border-muted"
          placeholder="Add a word to dictionary…"
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <Button onClick={add}>Add word</Button>
      </div>
      <div className="mt-3 divide-y divide-border rounded-card border border-border bg-surface shadow-card">
        {rows.map((r) => (
          <div
            key={r.phrase}
            className="flex items-center justify-between px-4 py-3"
          >
            <span className="text-[15px] font-medium">
              {r.phrase}
              <span className="ml-2 text-xs font-normal text-faint">
                used ×{r.frequencyUsed}
              </span>
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => api.dictRemove(r.phrase).then(load)}
            >
              Remove
            </Button>
          </div>
        ))}
        {rows.length === 0 && (
          <p className="px-4 py-3 text-sm text-muted">
            Nothing here yet — dictated names land here automatically too.
          </p>
        )}
      </div>
    </div>
  );
}
