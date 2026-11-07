import type { ReactNode } from "react";

// Per-view banner card: bold title with one highlight run, description, CTA.
// Mirrors the hub banner pattern (title / body / action).
export function Banner({
  title,
  body,
  action,
  onAction,
  dark = false,
}: {
  title: ReactNode;
  body: string;
  action: string;
  onAction: () => void;
  dark?: boolean;
}) {
  if (dark) {
    return (
      <div className="mb-4 rounded-2xl bg-gradient-to-br from-[#2b2118] via-[#1a1a1a] to-black p-5 text-white shadow-card">
        <h3 className="font-serif text-[22px] font-semibold tracking-tight">{title}</h3>
        <p className="mt-1 max-w-lg text-sm leading-relaxed text-white/75">{body}</p>
        <button
          onClick={onAction}
          className="mt-3 rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-ink hover:bg-white/90"
        >
          {action}
        </button>
      </div>
    );
  }
  return (
    <div className="mb-4 rounded-card border border-border bg-surface p-4 shadow-card">
      <h3 className="text-[15px] font-bold tracking-tight">{title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-muted">{body}</p>
      <button
        onClick={onAction}
        className="mt-2.5 rounded-lg bg-ink px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-black"
      >
        {action}
      </button>
    </div>
  );
}

/** Bold serif highlight, inherits surrounding color (works on light + dark). */
export function H({ children }: { children: ReactNode }) {
  return <span className="font-serif font-bold italic">{children}</span>;
}
