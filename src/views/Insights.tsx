import { useEffect, useState } from "react";
import type { HistoryEntry } from "../lib/api";
import { api } from "../lib/api";

// Insights computed from local history: totals + 14-day bars + top apps.
export function Insights() {
  const [rows, setRows] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    api.history(5000).then(setRows).catch(() => {});
  }, []);

  const words = rows.reduce((a, r) => a + r.numWords, 0);
  const days: { label: string; count: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const next = d.getTime() + 86400000;
    const count = rows.filter((r) => r.timestamp >= d.getTime() && r.timestamp < next).length;
    days.push({ label: `${d.getMonth() + 1}/${d.getDate()}`, count });
  }
  const max = Math.max(1, ...days.map((d) => d.count));
  const apps = new Map<string, number>();
  for (const r of rows) {
    if (r.app) apps.set(r.app, (apps.get(r.app) ?? 0) + 1);
  }
  const topApps = [...apps.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <div>
      <h2 className="text-lg font-bold tracking-tight">Insights</h2>
      <p className="mt-1 text-sm text-muted">Your dictation, counted locally.</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {[
          [String(rows.length), "dictations"],
          [String(words), "words"],
          [String(topApps.length), "apps"],
        ].map(([v, l]) => (
          <div key={l} className="rounded-card border border-border bg-surface p-3 text-center shadow-card">
            <p className="text-xl font-bold">{v}</p>
            <p className="text-xs text-faint">{l}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-card border border-border bg-surface p-4 shadow-card">
        <h3 className="text-sm font-bold">Last 14 days</h3>
        <div className="mt-2 flex h-24 items-end gap-1">
          {days.map((d) => (
            <div key={d.label} className="flex flex-1 flex-col items-center gap-1" title={`${d.label}: ${d.count}`}>
              <div
                className="w-full rounded-sm bg-ink"
                style={{ height: `${Math.max(3, (d.count / max) * 80)}px`, opacity: d.count ? 1 : 0.12 }}
              />
            </div>
          ))}
        </div>
        <div className="mt-1 flex gap-1">
          {days.map((d) => (
            <span key={d.label} className="flex-1 text-center text-[10px] text-faint">
              {d.label.split("/")[1]}
            </span>
          ))}
        </div>
      </div>
      {topApps.length > 0 && (
        <div className="mt-3 rounded-card border border-border bg-surface p-4 shadow-card">
          <h3 className="text-sm font-bold">Top apps</h3>
          {topApps.map(([app, n]) => (
            <div key={app} className="mt-1.5 flex items-center gap-2 text-sm">
              <span className="w-40 truncate font-medium">{app}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-wash">
                <div className="h-full rounded-full bg-ink" style={{ width: `${(n / topApps[0][1]) * 100}%` }} />
              </div>
              <span className="w-8 text-right text-xs text-faint">{n}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
