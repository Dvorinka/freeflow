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
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Dictionary</h2>
      <p className="text-sm text-muted">
        Personal vocabulary — phrases here bias transcription toward your names
        and jargon.
      </p>
      <div className="flex gap-2">
        <input
          className="flex-1 rounded-md border border-border bg-surface px-3 py-1.5 text-sm"
          placeholder="Add a phrase…"
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <Button onClick={add}>Add</Button>
      </div>
      {rows.map((r) => (
        <div
          key={r.phrase}
          className="flex items-center justify-between rounded-md border border-border bg-surface px-3 py-2 text-sm"
        >
          <span>
            {r.phrase}
            <span className="ml-2 text-xs text-muted">used ×{r.frequencyUsed}</span>
          </span>
          <Button
            variant="danger"
            onClick={() => api.dictRemove(r.phrase).then(load)}
          >
            Remove
          </Button>
        </div>
      ))}
    </div>
  );
}
