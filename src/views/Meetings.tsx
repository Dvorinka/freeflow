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
        })
        .catch((e) => setBusy(String(e)));
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Meeting recorder</h2>
        <div className="flex gap-2">
          {!recording && (
            <input
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm"
              placeholder="title (optional)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          )}
          <Button variant={recording ? "danger" : "default"} onClick={toggle}>
            {recording ? "Stop & transcribe" : "Record"}
          </Button>
        </div>
      </div>
      {busy && <p className="text-sm text-red-400">{busy}</p>}
      {rows.map((m) => (
        <div key={m.id} className="rounded-md border border-border bg-surface p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{m.title}</span>
            <span className="text-xs text-muted">{m.status}</span>
          </div>
          <p className="mt-1 text-xs text-muted">
            {new Date(m.startedAt).toLocaleString()}
          </p>
          <div className="mt-2 flex gap-2">
            <Button variant="secondary" onClick={() => api.meeting(m.id).then((r) => setDetail(r))}>
              View
            </Button>
            {m.transcript && (
              <Button variant="secondary" onClick={() => api.meetingNotes(m.id).then(() => load()).catch((e) => setBusy(String(e)))}>
                Notes (local LLM)
              </Button>
            )}
          </div>
        </div>
      ))}
      {detail && (
        <div className="rounded-md border border-accent bg-surface p-3 text-sm">
          <h3 className="font-semibold">{detail.title}</h3>
          {detail.transcript && (
            <p className="mt-2 whitespace-pre-wrap">{detail.transcript}</p>
          )}
          {detail.notes && (
            <p className="mt-2 whitespace-pre-wrap border-t border-border pt-2">
              {detail.notes}
            </p>
          )}
          <Button variant="secondary" onClick={() => setDetail(null)}>
            Close
          </Button>
        </div>
      )}
    </div>
  );
}
