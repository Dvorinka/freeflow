import { useEffect, useState } from "react";
import type { ModelInfo, Settings, SidecarStatus } from "../lib/api";
import { api, modelGroup } from "../lib/api";
import { Button } from "../components/ui/button";

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

  const groups = ["English-only", "Multilingual"] as const;

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold">Settings</h2>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-muted">SPEECH MODEL</h3>
        <p className="text-xs text-muted">
          Sidecar {status?.running ? `running (:${status.port})` : "not running"} ·
          active: {status?.model ?? "loading…"}
        </p>
        {groups.map((g) => (
          <div key={g}>
            <p className="mt-2 text-xs font-medium text-muted">{g}</p>
            <div className="flex flex-wrap gap-2">
              {models.filter((m) => modelGroup(m.id) === g).map((m) => (
                <Button
                  key={m.id}
                  variant={s.model === m.id ? "default" : "secondary"}
                  onClick={() => {
                    set("model", m.id);
                    api.selectModel(m.id).then(() =>
                      api.sttModels().then(setModels).catch(() => {}),
                    );
                  }}
                >
                  {m.id}
                  {m.downloaded ? "" : " ⭳"}
                </Button>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-2 gap-3">
        <label className="text-sm">
          Language
          <select
            className="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5"
            value={s.language}
            onChange={(e) => set("language", e.target.value)}
          >
            {["auto", "en"].map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Hotkey
          <input
            className="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5"
            value={s.hotkey}
            onChange={(e) => set("hotkey", e.target.value)}
          />
        </label>
        <label className="text-sm">
          Microphone
          <select
            className="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5"
            value={s.micDevice}
            onChange={(e) => set("micDevice", e.target.value)}
          >
            <option value="">System default</option>
            {devices.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Polish
          <select
            className="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5"
            value={s.polish}
            onChange={(e) => set("polish", e.target.value)}
          >
            {["rules", "none", "ollama"].map((p) => (
              <option key={p} value={p}>
                {p}{p === "ollama" ? (ollama ? " (available)" : " (offline)") : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Ollama model
          <input
            className="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5"
            value={s.ollamaModel}
            onChange={(e) => set("ollamaModel", e.target.value)}
          />
        </label>
      </section>

      <section className="space-y-2 text-sm">
        {(
          [
            ["livePartials", "Type live partials while speaking"],
            ["autostart", "Launch at login"],
            ["overlay", "Show dictation overlay"],
          ] as const
        ).map(([k, label]) => (
          <label key={k} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={s[k]}
              onChange={(e) => set(k, e.target.checked)}
            />
            {label}
          </label>
        ))}
      </section>

      <div className="flex items-center gap-3">
        <Button onClick={save}>Save</Button>
        {saved && <span className="text-sm text-muted">{saved}</span>}
      </div>
    </div>
  );
}
