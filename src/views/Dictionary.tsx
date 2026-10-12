import { useEffect, useState } from "react";
import type { DictEntry } from "../lib/api";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";

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
      <h2 className="text-lg font-bold tracking-tight">Dictionary</h2>
      <p className="mt-1 text-sm text-muted">
        Words Flow always gets right. Add names and terms you use — they bias
        transcription in your favor.
      </p>
      <div className="mt-3 flex gap-2">
        <input
          className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none placeholder:text-faint focus:border-muted"
          placeholder="Add a word to dictionary…"
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <Button onClick={add}>Add word</Button>
      </div>
      <div className="mt-3 space-y-2">
        {rows.map((r) => (
          <div
            key={r.phrase}
            className="flex items-center justify-between rounded-card border border-border bg-surface px-3.5 py-2.5 shadow-card"
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
          <p className="text-sm text-muted">
            Nothing here yet — dictated names land here automatically too.
          </p>
        )}
      </div>
    </div>
  );
}
