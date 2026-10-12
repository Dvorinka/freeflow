import { invoke } from "@tauri-apps/api/core";

// Mirror of src-tauri/src/{state,store,stt}.rs (all camelCase over IPC).

export type DictationPhase =
  | "idle"
  | "listening"
  | "transcribing"
  | "polishing"
  | "injecting";

export interface HistoryEntry {
  id: string;
  timestamp: number;
  asrText: string;
  formattedText: string;
  editedText: string | null;
  app: string;
  url: string | null;
  language: string;
  durationMs: number;
  numWords: number;
  model: string;
}

export interface DictEntry {
  phrase: string;
  lastUsed: number | null;
  lastSeen: number | null;
  frequencyUsed: number;
  frequencySeen: number;
  manuallyAdded: boolean;
}

export interface Snippet {
  id: string;
  trigger: string;
  expansion: string;
}

export interface Transform {
  name: string;
  prompt: string;
  builtin: boolean;
}

export interface MeetingRow {
  id: string;
  startedAt: number;
  endedAt: number | null;
  title: string;
  audioPath: string;
  transcript: string | null;
  notes: string | null;
  status: string;
}

export interface Settings {
  model: string;
  language: string;
  hotkey: string;
  livePartials: boolean;
  polish: string;
  ollamaModel: string;
  micDevice: string;
  autostart: boolean;
  overlay: boolean;
  autoTransform: string;
  styles: Record<string, string>;
  autoLearn: boolean;
}

export interface ModelInfo {
  id: string;
  downloaded: boolean;
  active: boolean;
}

export interface SidecarStatus {
  running: boolean;
  port: number;
  model: string | null;
}

export const api = {
  startDictation: () => invoke<void>("start_dictation"),
  stopDictation: () => invoke<void>("stop_dictation"),
  cancelDictation: () => invoke<void>("cancel_dictation"),
  history: (limit = 200) => invoke<HistoryEntry[]>("get_history", { limit }),
  deleteHistory: (id: string) => invoke<void>("delete_history_entry", { id }),
  clearHistory: () => invoke<void>("clear_history"),
  replay: (text: string) => invoke<void>("replay_history_text", { text }),
  dictionary: () => invoke<DictEntry[]>("dictionary_list"),
  dictAdd: (phrase: string) => invoke<void>("dictionary_add", { phrase }),
  dictRemove: (phrase: string) => invoke<void>("dictionary_remove", { phrase }),
  snippets: () => invoke<Snippet[]>("snippets_list"),
  snippetUpsert: (snippet: Snippet) => invoke<void>("snippet_upsert", { snippet }),
  snippetRemove: (id: string) => invoke<void>("snippet_remove", { id }),
  transforms: () => invoke<Transform[]>("transforms_list"),
  transformUpsert: (transform: Transform) =>
    invoke<void>("transform_upsert", { transform }),
  transformRemove: (name: string) => invoke<void>("transform_remove", { name }),
  settings: () => invoke<Settings>("get_settings"),
  updateSettings: (settings: Settings) =>
    invoke<void>("update_settings", { settings }),
  sttModels: () => invoke<ModelInfo[]>("list_stt_models"),
  selectModel: (id: string) => invoke<void>("select_stt_model", { id }),
  sidecarStatus: () => invoke<SidecarStatus>("sidecar_status"),
  audioDevices: () => invoke<string[]>("list_audio_devices"),
  ollama: () => invoke<boolean>("ollama_status"),
  startMeeting: (title?: string) => invoke<string>("start_meeting", { title }),
  stopMeeting: () => invoke<void>("stop_meeting"),
  meetings: (limit = 100) => invoke<MeetingRow[]>("list_meetings", { limit }),
  meeting: (id: string) => invoke<MeetingRow | null>("get_meeting", { id }),
  meetingNotes: (id: string) => invoke<string>("meeting_notes", { id }),
  meetingAsk: (id: string, question: string) =>
    invoke<string>("meeting_ask", { id, question }),
};

/** English-only vs multilingual grouping for the model switcher. */
export function modelGroup(id: string): "English-only" | "Multilingual" {
  return id.endsWith(".en") ? "English-only" : "Multilingual";
}
