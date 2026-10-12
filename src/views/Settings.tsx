import { useEffect, useState } from "react";
import type { ModelInfo, Settings, SidecarStatus } from "../lib/api";
import { api, modelGroup } from "../lib/api";
import { Button } from "../components/ui/button";
import { IconCheck } from "../components/icons";

const field =
  "mt-1 w-full rounded-lg border border-border bg-surface px-2.5 py-2 text-sm outline-none focus:border-muted";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-border bg-surface p-4 shadow-card">
      <h3 className="text-[13px] font-bold uppercase tracking-wide text-faint">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function SettingsView() {
  const [s, setS] = useState<Settings | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [status, setStatus] = useState<SidecarStatus | null>(null);
  const [devices, setDevices] = useState<string[]>([]);
  const [ollama, setOllama] = useState(false);
  const [saved, setSaved] = useState("");

  useEffect(() => {
    api.settings().then(setS).catch(() => {});
    api.audioDevices().then(setDevices).catch(() => {});
    api.ollama().then(setOllama).catch(() => {});
    const refresh = () => {
      api.sttModels().then(setModels).catch(() => {});
      api.sidecarStatus().then(setStatus).catch(() => {});
    };
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, []);

  if (!s) return <p className="text-sm text-muted">Loading…</p>;

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) =>
    setS({ ...s, [k]: v });

  const save = () =>
    api
      .updateSettings(s)
      .then(() => setSaved("Saved."))
      .catch((e) => setSaved(String(e)));

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold tracking-tight">Settings</h2>

      <Section title="Speech model">
        <p className="text-[13px] text-muted">
          {status?.running
            ? `Transcriber running · active: ${status.model ?? "loading…"}`
            : "Transcriber starting…"}
        </p>
        {(["English-only", "Multilingual"] as const).map((g) => (
          <div key={g} className="mt-2.5">
            <p className="text-xs font-semibold text-muted">{g}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {models
                .filter((m) => modelGroup(m.id) === g)
                .map((m) => {
                  const active = s.model === m.id;
                  return (
                    <button
                      key={m.id}
                      onClick={() => {
                        set("model", m.id);
                        api.selectModel(m.id).then(() =>
                          api.sttModels().then(setModels).catch(() => {}),
                        );
                      }}
                      className={`flex items-center gap-1 rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                        active
                          ? "border-ink bg-ink text-white"
                          : "border-border bg-surface hover:border-muted"
                      }`}
                    >
                      {active && <IconCheck className="h-3.5 w-3.5" />}
                      {m.id}
                      {!m.downloaded && <span className="text-faint">↓</span>}
                    </button>
                  );
                })}
            </div>
          </div>
        ))}
      </Section>

      <Section title="Dictation">
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-medium">
            Language
            <select className={field} value={s.language} onChange={(e) => set("language", e.target.value)}>
              {["auto", "en"].map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            Hotkey
            <input className={field} value={s.hotkey} onChange={(e) => set("hotkey", e.target.value)} />
          </label>
          <label className="text-sm font-medium">
            Microphone
            <select className={field} value={s.micDevice} onChange={(e) => set("micDevice", e.target.value)}>
              <option value="">System default</option>
              {devices.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            Polish
            <select className={field} value={s.polish} onChange={(e) => set("polish", e.target.value)}>
              <option value="rules">Rules (built in)</option>
              <option value="none">None (raw transcript)</option>
              <option value="ollama">Local model{ollama ? " (available)" : " (offline)"}</option>
            </select>
          </label>
        </div>
        {s.polish === "ollama" && (
          <label className="mt-3 block text-sm font-medium">
            Local model name
            <input className={field} value={s.ollamaModel} onChange={(e) => set("ollamaModel", e.target.value)} />
          </label>
        )}
      </Section>

      <Section title="App">
        <div className="space-y-2 text-sm">
          {(
            [
              ["livePartials", "Type live partials while speaking"],
              ["autostart", "Launch at login"],
              ["overlay", "Show dictation overlay"],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="flex cursor-pointer items-center gap-2.5 font-medium">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[#1a1a1a]"
                checked={s[k]}
                onChange={(e) => set(k, e.target.checked)}
              />
              {label}
            </label>
          ))}
        </div>
      </Section>

      <div className="flex items-center gap-3 pb-2">
        <Button onClick={save}>Save settings</Button>
        {saved && <span className="text-sm text-muted">{saved}</span>}
      </div>
    </div>
  );
}
