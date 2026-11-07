import { useEffect, useState } from "react";
import { Button } from "../components/ui/button";
import { Banner, H } from "../components/Banner";

// Local-only notes: recents list with search, pin, delete + editor.
// Persisted per profile in localStorage; nothing leaves the machine.
interface Note {
  id: string;
  title: string;
  body: string;
  updatedAt: number;
  pinned: boolean;
}

const KEY = "freeflow.scratchpad.notes";

function loadNotes(): Note[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Note[];
    const legacy = localStorage.getItem("freeflow.scratchpad");
    if (legacy) {
      return [{ id: crypto.randomUUID(), title: "New note", body: legacy, updatedAt: Date.now(), pinned: false }];
    }
  } catch {
    /* corrupted store: start clean */
  }
  return [];
}

export function Scratchpad() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    setNotes(loadNotes());
  }, []);

  const persist = (next: Note[]) => {
    setNotes(next);
    localStorage.setItem(KEY, JSON.stringify(next));
  };

  const active = notes.find((n) => n.id === activeId) ?? null;

  const create = () => {
    const n: Note = {
      id: crypto.randomUUID(),
      title: "New note",
      body: "",
      updatedAt: Date.now(),
      pinned: false,
    };
    persist([n, ...notes]);
    setActiveId(n.id);
  };

  const update = (id: string, patch: Partial<Note>) =>
    persist(notes.map((n) => (n.id === id ? { ...n, ...patch, updatedAt: Date.now() } : n)));

  const remove = (id: string) => {
    if (!window.confirm("Delete this note? Once deleted it cannot be recovered.")) return;
    persist(notes.filter((n) => n.id !== id));
    if (activeId === id) setActiveId(null);
  };

  const filtered = notes
    .filter((n) => (n.title + "\n" + n.body).toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);

  return (
    <div>
      <h2 className="font-serif text-[28px] font-semibold tracking-tight">Scratchpad</h2>
      <div className="mt-3">
        <Banner
          dark
          title={<>For quick thoughts you <H>come back to</H></>}
          body="Drop a to-do list, polish a message before you send it, brain dump an idea."
          action="Start new note"
          onAction={create}
        />
      </div>
      <div className="flex gap-2">
        <input
          className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none placeholder:text-faint focus:border-muted"
          placeholder="Search your notes"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Button onClick={create}>New note</Button>
      </div>
      <div className="mt-3 grid grid-cols-[220px_1fr] gap-3">
        <div className="space-y-1">
          <p className="px-1 text-xs font-semibold uppercase tracking-wide text-faint">Recents</p>
          {filtered.map((n) => (
            <button
              key={n.id}
              onClick={() => setActiveId(n.id)}
              className={`w-full truncate rounded-lg px-2.5 py-2 text-left text-sm ${
                activeId === n.id ? "bg-wash font-semibold" : "hover:bg-wash/60"
              }`}
            >
              {n.pinned ? "📌 " : ""}{n.title || "Untitled"}
            </button>
          ))}
          {filtered.length === 0 && <p className="px-1 text-sm text-muted">No notes found.</p>}
        </div>
        <div className="rounded-card border border-border bg-surface p-3 shadow-card">
          {!active ? (
            <p className="text-sm text-muted">Pick a note, or start a new one.</p>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <input
                  className="flex-1 bg-transparent text-[15px] font-semibold outline-none"
                  value={active.title}
                  onChange={(e) => update(active.id, { title: e.target.value })}
                />
                <Button variant="ghost" size="sm" onClick={() => update(active.id, { pinned: !active.pinned })}>
                  {active.pinned ? "Pinned" : "Pin note"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => remove(active.id)}>
                  Delete note
                </Button>
              </div>
              <textarea
                className="mt-2 h-72 w-full resize-none text-[15px] leading-relaxed outline-none placeholder:text-faint"
                placeholder="Think out loud…"
                value={active.body}
                onChange={(e) => update(active.id, { body: e.target.value })}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
