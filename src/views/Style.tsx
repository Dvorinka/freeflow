// Style: how each app category is polished. Mirrors the per-app voices
// (code stays verbatim, email courteous, chat brief, document formal).
const ROWS: [string, string, string][] = [
  ["Code", "editors, terminals, IDEs", "Technical and precise — identifiers and paths verbatim"],
  ["Email", "Outlook, Thunderbird, mail apps", "Clear, courteous prose in short paragraphs"],
  ["Chat", "Slack, Discord, Teams, messengers", "Casual and brief, light on punctuation changes"],
  ["Document", "Word, Notion, Obsidian, docs", "Formal prose, complete sentences"],
  ["Casual", "browsers and everything else", "Natural written English"],
];

export function Style() {
  return (
    <div>
      <h2 className="text-lg font-bold tracking-tight">Style</h2>
      <p className="mt-1 text-sm text-muted">
        The focused app picks the polish automatically. Rules below always apply;
        the local model follows the per-app voice.
      </p>
      <div className="mt-3 space-y-2">
        {ROWS.map(([cat, apps, voice]) => (
          <div
            key={cat}
            className="rounded-card border border-border bg-surface px-3.5 py-3 shadow-card"
          >
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-ink px-2.5 py-0.5 text-xs font-semibold text-white">
                {cat}
              </span>
              <span className="text-xs text-faint">{apps}</span>
            </div>
            <p className="mt-1.5 text-sm">{voice}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
