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
          <h2 className="font-serif text-[28px] font-semibold tracking-tight">Meeting recorder</h2>
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
        <MeetingDetail
          meeting={detail}
          onClose={() => {
            setDetail(null);
            load();
          }}
          onError={setBusy}
        />
      )}
    </div>
  );
}

function MeetingDetail({
  meeting,
  onClose,
  onError,
}: {
  meeting: MeetingRow;
  onClose: () => void;
  onError: (e: string) => void;
}) {
  const [tab, setTab] = useState<"transcript" | "notes" | "chat">("transcript");
  const [detail, setDetail] = useState(meeting);
  const [question, setQuestion] = useState("");
  const [qa, setQa] = useState<[string, string][]>([]);
  const [asking, setAsking] = useState(false);

  const refresh = () => api.meeting(detail.id).then((r) => r && setDetail(r));

  const makeNotes = () =>
    api
      .meetingNotes(detail.id)
      .then(() => refresh())
      .catch((e) => onError(String(e)));

  const ask = () => {
    const q = question.trim();
    if (!q || asking) return;
    setAsking(true);
    api
      .meetingAsk(detail.id, q)
      .then((a) => {
        setQa((prev) => [...prev, [q, a]]);
        setQuestion("");
      })
      .catch((e) => setQa((prev) => [...prev, [q, `Couldn't answer: ${e}`]]))
      .finally(() => setAsking(false));
  };

  return (
    <div className="mt-3 rounded-card border border-ink/20 bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between">
        <h3 className="font-serif text-xl font-semibold">{detail.title}</h3>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
      <div className="mt-2 flex gap-4 border-b border-border text-sm">
        {(["transcript", "notes", "chat"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`pb-2 font-medium capitalize ${
              tab === t ? "border-b-2 border-ink text-ink" : "text-muted hover:text-ink"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "transcript" && (
        <div className="mt-2">
          {detail.transcript ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{detail.transcript}</p>
          ) : (
            <p className="text-sm text-muted">
              {detail.status === "recording" ? "Still recording…" : "Transcribing — refresh in a bit."}
            </p>
          )}
        </div>
      )}
      {tab === "notes" && (
        <div className="mt-2">
          {detail.notes ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{detail.notes}</p>
          ) : (
            <p className="text-sm text-muted">No notes yet.</p>
          )}
          {detail.transcript && (
            <Button variant="secondary" size="sm" onClick={makeNotes}>
              Generate notes
            </Button>
          )}
        </div>
      )}
      {tab === "chat" && (
        <div className="mt-2">
          {!detail.transcript ? (
            <p className="text-sm text-muted">Ask once the transcript lands.</p>
          ) : (
            <>
              <div className="max-h-64 space-y-2 overflow-y-auto">
                {qa.length === 0 && (
                  <p className="text-sm text-muted">Ask anything about this meeting.</p>
                )}
                {qa.map(([q, a], i) => (
                  <div key={i} className="space-y-1">
                    <p className="rounded-lg bg-wash px-3 py-2 text-sm font-medium">{q}</p>
                    <p className="whitespace-pre-wrap px-3 text-sm leading-relaxed">{a}</p>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <input
                  className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none placeholder:text-faint focus:border-muted"
                  placeholder="Ask anything"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && ask()}
                />
                <Button onClick={ask} disabled={asking}>
                  {asking ? "…" : "Ask"}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
