import { useEffect, useState } from "react";
import type { HistoryEntry } from "../lib/api";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";

export function History() {
  const [rows, setRows] = useState<HistoryEntry[]>([]);
  const [error, setError] = useState("");

  const load = () =>
    api
      .history()
      .then(setRows)
      .catch((e) => setError(String(e)));

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">History</h2>
        <Button variant="secondary" onClick={load}>
          Refresh
        </Button>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {rows.length === 0 && !error && (
        <p className="text-sm text-muted">No dictations yet.</p>
      )}
      {rows.map((r) => (
        <div key={r.id} className="rounded-md border border-border bg-surface p-3">
          <p className="text-sm">{r.formattedText}</p>
          <div className="mt-1 flex items-center gap-3 text-xs text-muted">
            <span>{new Date(r.timestamp).toLocaleString()}</span>
            {r.app && <span>{r.app}</span>}
            <span>{r.model}</span>
          </div>
          {r.asrText !== r.formattedText && (
            <p className="mt-1 text-xs text-muted">raw: {r.asrText}</p>
          )}
          <div className="mt-2 flex gap-2">
            <Button variant="secondary" onClick={() => api.replay(r.formattedText)}>
              Type again
            </Button>
            <Button
              variant="danger"
              onClick={() => api.deleteHistory(r.id).then(load)}
            >
              Delete
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
