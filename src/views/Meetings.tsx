import { useEffect, useState } from "react";
import type { MeetingRow } from "../lib/api";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";

export function Meetings() {
  const [rows, setRows] = useState<MeetingRow[]>([]);
  const [title, setTitle] = useState("");
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState("");
  const [detail, setDetail] = useState<MeetingRow | null>(null);

  const load = () => api.meetings().then(setRows).catch(() => {});
  useEffect(() => {
    load();
  }, []);

  const toggle = () => {
    if (recording) {
      api
        .stopMeeting()
        .then(() => {
          setRecording(false);
          load();
        })
        .catch((e) => setBusy(String(e)));
    } else {
      api
        .startMeeting(title.trim() || undefined)
        .then(() => {
          setRecording(true);
          setTitle("");
          setBusy("");
        })
        .catch((e) => setBusy(String(e)));
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Meeting recorder</h2>
          <p className="mt-1 text-sm text-muted">
            Mic plus system audio, transcribed on-device when you stop.
          </p>
        </div>
        <div className="flex gap-2">
          {!recording && (
            <input
              className="w-40 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none placeholder:text-faint focus:border-muted"
              placeholder="Title (optional)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          )}
          <Button variant={recording ? "danger" : "default"} onClick={toggle}>
            {recording ? "Stop & transcribe" : "Record"}
          </Button>
        </div>
      </div>
      {busy && <p className="mt-2 text-sm text-red-600">{busy}</p>}
      <div className="mt-3 space-y-2">
        {rows.map((m) => (
          <div
            key={m.id}
            className="rounded-card border border-border bg-surface p-3.5 shadow-card"
          >
            <div className="flex items-center justify-between">
              <span className="text-[15px] font-semibold">{m.title}</span>
              <span className="rounded-full bg-wash px-2 py-0.5 text-xs font-medium text-muted">
                {m.status}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-faint">
              {new Date(m.startedAt).toLocaleString()}
            </p>
            <div className="mt-2 flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => api.meeting(m.id).then((r) => setDetail(r))}>
                View
              </Button>
              {m.transcript && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => api.meetingNotes(m.id).then(() => load()).catch((e) => setBusy(String(e)))}
                >
                  Notes
                </Button>
              )}
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <p className="text-sm text-muted">No meetings recorded yet.</p>
        )}
      </div>
      {detail && (
        <div className="mt-3 rounded-card border border-ink/20 bg-surface p-4 shadow-card">
          <div className="flex items-center justify-between">
            <h3 className="font-bold">{detail.title}</h3>
            <Button variant="ghost" size="sm" onClick={() => setDetail(null)}>
              Close
            </Button>
          </div>
          {detail.transcript && (
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
              {detail.transcript}
            </p>
          )}
          {detail.notes && (
            <p className="mt-2 whitespace-pre-wrap border-t border-border pt-2 text-sm leading-relaxed">
              {detail.notes}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
