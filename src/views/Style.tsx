import { useEffect, useState } from "react";
import type { Settings } from "../lib/api";
import { api } from "../lib/api";
import { cn } from "../lib/utils";

// Style presets per app category, with the same sentence in three voices.
const CATS: [string, string, string][] = [
  ["chat", "Chat", "Slack, Discord, Teams, messengers"],
  ["email", "Email", "Outlook, Thunderbird, mail apps"],
  ["document", "Document", "Word, Notion, Obsidian, docs"],
  ["code", "Code", "editors, terminals, IDEs"],
  ["casual", "Casual", "browsers and everything else"],
];

const PRESETS: [string, string, string][] = [
  ["formal", "Formal.", "Caps + Punctuation"],
  ["casual", "Casual", "Caps + Less punctuation"],
  ["very_casual", "very casual", "No Caps + Less punctuation"],
];

const EXAMPLE: Record<string, [string, string, string]> = {
  formal: ["Hey, are we still on for lunch tomorrow?", "Let me know what time works for you.", "J"],
  casual: ["Hey are we still on for lunch tomorrow?", "Let me know what time works for you", "J"],
  very_casual: ["hey are we still on for lunch tomorrow?", "let me know what time works", "J"],
};

const AVATAR: Record<string, string> = {
  formal: "bg-purple-200 text-purple-900",
  casual: "bg-pink-200 text-pink-900",
  very_casual: "bg-rose-800 text-white",
};

export function Style() {
  const [cat, setCat] = useState("chat");
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    api.settings().then(setSettings).catch(() => {});
  }, []);

  const active = (settings?.styles ?? {})[cat] ?? "formal";

  const pick = (preset: string) => {
    if (!settings) return;
    const next = { ...settings, styles: { ...settings.styles, [cat]: preset } };
    setSettings(next);
    api.updateSettings(next).catch(() => {});
  };

  return (
    <div>
      <h2 className="font-serif text-[28px] font-semibold tracking-tight">Style</h2>
      <div className="mt-2 flex gap-4 border-b border-border text-sm">
        {CATS.map(([id, label]) => (
          <button
            key={id}
            onClick={() => setCat(id)}
            className={cn(
              "pb-2 font-medium",
              cat === id ? "border-b-2 border-ink text-ink" : "text-muted hover:text-ink",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mt-4 rounded-2xl bg-ink p-5 text-white">
        <p className="font-serif text-xl">
          This style applies in <em>{CATS.find(([id]) => id === cat)?.[1].toLowerCase()}</em>
        </p>
        <p className="mt-1 text-sm text-white/70">
          {CATS.find(([id]) => id === cat)?.[2]} · Local model only; rules cleanup stays fixed.
        </p>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3">
        {PRESETS.map(([id, name, sub]) => {
          const [l1, l2] = EXAMPLE[id];
          const selected = active === id;
          return (
            <button
              key={id}
              onClick={() => pick(id)}
              className={cn(
                "rounded-card border bg-surface p-4 text-left shadow-card transition-colors",
                selected ? "border-purple-500" : "border-border hover:border-muted",
              )}
            >
              <p className="text-[15px] font-semibold">{name}</p>
              <p className="text-[13px] text-faint">{sub}</p>
              <p className="mt-6 rounded-lg bg-wash/70 p-3 text-[13px] leading-relaxed">
                {l1}
                <br />
                {l2}
              </p>
              <span className={cn("ml-auto mt-3 flex h-9 w-9 items-center justify-center rounded-full font-semibold", AVATAR[id])}>
                {EXAMPLE[id][2]}
              </span>
            </button>
          );
        })}
      </div>
      {!settings && <p className="mt-2 text-sm text-muted">Loading…</p>}
    </div>
  );
}
