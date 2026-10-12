import { useEffect, useState } from "react";
import type { HistoryEntry } from "../lib/api";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";
import { IconMic } from "../components/icons";

function GetStarted() {
  return (
    <div className="mb-4 rounded-card border border-border bg-surface p-4 shadow-card">
      <h3 className="text-[15px] font-bold">Get started with dictation</h3>
      <ol className="mt-2 space-y-1.5 text-sm text-muted">
        <li>
          <span className="font-semibold text-ink">1.</span> Press{" "}
          <span className="font-semibold text-ink">Dictate</span> below — or hold
          your hotkey anywhere.
        </li>
        <li>
          <span className="font-semibold text-ink">2.</span> Speak naturally, then
          stop. Your words are typed where you left off.
        </li>
        <li>
          <span className="font-semibold text-ink">3.</span> Everything stays on
          this machine — no account, no cloud.
        </li>
      </ol>
    </div>
  );
}

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
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-serif text-[28px] font-semibold tracking-tight">Dictation history</h2>
        <Button variant="secondary" size="sm" onClick={load}>
          Refresh
        </Button>
      </div>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      {rows.length === 0 && !error && <GetStarted />}
      {rows.length === 0 && !error && (
        <p className="text-sm text-muted">No dictations yet.</p>
      )}
      <div className="space-y-2">
        {rows.map((r) => (
          <div
            key={r.id}
            className="rounded-card border border-border bg-surface p-3.5 shadow-card"
          >
            <p className="text-[15px] leading-relaxed">{r.formattedText}</p>
            <div className="mt-1.5 flex items-center gap-2 text-xs text-faint">
              <span>{new Date(r.timestamp).toLocaleString()}</span>
              {r.app && (
                <>
                  <span aria-hidden>·</span>
                  <span>{r.app}</span>
                </>
              )}
              <span aria-hidden>·</span>
              <span>{r.model}</span>
            </div>
            {r.asrText !== r.formattedText && (
              <p className="mt-1 text-[13px] text-faint">Heard: {r.asrText}</p>
            )}
            <div className="mt-2.5 flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => api.replay(r.formattedText)}>
                <IconMic className="mr-1 h-3.5 w-3.5" />
                Type again
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigator.clipboard.writeText(r.formattedText).catch(() => {})}
              >
                Copy
              </Button>
              <Button variant="ghost" size="sm" onClick={() => api.deleteHistory(r.id).then(load)}>
                Delete
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
