import { useEffect, useState } from "react";
import { Banner, H } from "../components/Banner";

// Local-only scratchpad: freeform notes in this browser profile.
const KEY = "freeflow.scratchpad";

export function Scratchpad() {
  const [text, setText] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setText(localStorage.getItem(KEY) ?? "");
  }, []);

  const save = () => {
    localStorage.setItem(KEY, text);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-serif text-[28px] font-semibold tracking-tight">Scratchpad</h2>
          <p className="mt-1 text-sm text-muted">
            Quick notes. Stored only in this app — nothing leaves the machine.
          </p>
        </div>
        <button
          onClick={save}
          className="rounded-lg bg-ink px-3.5 py-2 text-sm font-semibold text-white hover:bg-black"
        >
          Save{saved ? "d ✓" : ""}
        </button>
      </div>
      <div className="mt-3">
        <Banner dark
          title={<>For quick thoughts you <H>come back to</H></>}
          body="Drop a to-do list, polish a message before you send it, brain dump an idea. Your safe space to save and explore."
          action="Start new note"
          onAction={() => document.getElementById("scratchpad-box")?.focus()}
        />
      </div>
      <textarea
        id="scratchpad-box"
        className="mt-3 h-96 w-full rounded-card border border-border bg-surface p-4 text-[15px] leading-relaxed outline-none placeholder:text-faint focus:border-muted"
        placeholder="Think out loud…"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
    </div>
  );
}
