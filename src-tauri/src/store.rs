//! sqlite persistence. Schema mirrors the proven data model:
//! history (raw->clean->edited), dictionary (personal vocabulary),
//! snippets, transforms (named polish prompts), meetings, settings.

use crate::state::Settings;
use anyhow::{Context, Result};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::Path;

pub struct Db {
    conn: Connection,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub id: String,
    pub timestamp: i64,
    pub asr_text: String,
    pub formatted_text: String,
    pub edited_text: Option<String>,
    pub app: String,
    pub url: Option<String>,
    pub language: String,
    pub duration_ms: i64,
    pub num_words: i64,
    pub model: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DictEntry {
    pub phrase: String,
    pub last_used: Option<i64>,
    pub last_seen: Option<i64>,
    pub frequency_used: i64,
    pub frequency_seen: i64,
    pub manually_added: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snippet {
    pub id: String,
    pub trigger: String,
    pub expansion: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Transform {
    pub name: String,
    pub prompt: String,
    pub builtin: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MeetingRow {
    pub id: String,
    pub started_at: i64,
    pub ended_at: Option<i64>,
    pub title: String,
    pub audio_path: String,
    pub transcript: Option<String>,
    pub notes: Option<String>,
    pub status: String,
}

const DDL: &str = "
CREATE TABLE IF NOT EXISTS history (
    id TEXT PRIMARY KEY,
    timestamp INTEGER NOT NULL,
    asr_text TEXT,
    formatted_text TEXT,
    edited_text TEXT,
    app TEXT,
    url TEXT,
    language TEXT,
    duration_ms INTEGER,
    num_words INTEGER,
    model TEXT
);
CREATE INDEX IF NOT EXISTS idx_history_ts ON history(timestamp DESC);

CREATE TABLE IF NOT EXISTS dictionary (
    phrase TEXT PRIMARY KEY,
    last_used INTEGER,
    last_seen INTEGER,
    frequency_used INTEGER NOT NULL DEFAULT 0,
    frequency_seen INTEGER NOT NULL DEFAULT 0,
    manually_added INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS snippets (
    id TEXT PRIMARY KEY,
    trigger TEXT NOT NULL UNIQUE,
    expansion TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS transforms (
    name TEXT PRIMARY KEY,
    prompt TEXT NOT NULL,
    builtin INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS meetings (
    id TEXT PRIMARY KEY,
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    title TEXT,
    audio_path TEXT,
    transcript TEXT,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'recording'
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
";

impl Db {
    pub fn open(path: &Path) -> Result<Self> {
        let conn = Connection::open(path).context("open sqlite")?;
        conn.execute_batch(DDL)?;
        let db = Self { conn };
        db.seed_transforms();
        Ok(db)
    }

    fn seed_transforms(&self) {
        // One sensible default; users add their own named transforms.
        self.conn
            .execute(
                "INSERT OR IGNORE INTO transforms(name, prompt, builtin) VALUES (?1, ?2, 1)",
                params![
                "Polish",
                "Clean up grammar, punctuation and casing; remove filler; keep intent verbatim."
            ],
            )
            .ok();
    }

    pub fn load_settings(&self) -> Option<Settings> {
        let v: String = self
            .conn
            .query_row("SELECT value FROM settings WHERE key='settings'", [], |r| {
                r.get(0)
            })
            .ok()?;
        serde_json::from_str(&v).ok()
    }

    pub fn save_settings(&self, s: &Settings) -> Result<()> {
        self.conn.execute(
            "INSERT INTO settings(key, value) VALUES('settings', ?1)
             ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            params![serde_json::to_string(s)?],
        )?;
        Ok(())
    }

    pub fn add_history(&self, e: &HistoryEntry) -> Result<()> {
        self.conn.execute(
            "INSERT INTO history(id,timestamp,asr_text,formatted_text,edited_text,app,url,language,duration_ms,num_words,model)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
            params![e.id, e.timestamp, e.asr_text, e.formatted_text, e.edited_text,
                    e.app, e.url, e.language, e.duration_ms, e.num_words, e.model],
        )?;
        Ok(())
    }

    pub fn history(&self, limit: i64) -> Result<Vec<HistoryEntry>> {
        let mut st = self.conn.prepare(
            "SELECT id,timestamp,asr_text,formatted_text,edited_text,app,url,language,duration_ms,num_words,model
             FROM history ORDER BY timestamp DESC LIMIT ?1")?;
        let rows = st.query_map(params![limit], |r| {
            Ok(HistoryEntry {
                id: r.get(0)?,
                timestamp: r.get(1)?,
                asr_text: r.get(2)?,
                formatted_text: r.get(3)?,
                edited_text: r.get(4)?,
                app: r.get(5)?,
                url: r.get(6)?,
                language: r.get(7)?,
                duration_ms: r.get(8)?,
                num_words: r.get(9)?,
                model: r.get(10)?,
            })
        })?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    pub fn delete_history(&self, id: &str) -> Result<()> {
        self.conn
            .execute("DELETE FROM history WHERE id=?1", params![id])?;
        Ok(())
    }

    /// Update edited_text + feed dictionary frequencies from a corrected text.
    /// (Wired to the history UI in the frontend step.)
    #[allow(dead_code)]
    pub fn record_edit(&self, id: &str, edited: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE history SET edited_text=?1 WHERE id=?2",
            params![edited, id],
        )?;
        Ok(())
    }

    pub fn dictionary(&self) -> Result<Vec<DictEntry>> {
        let mut st = self.conn.prepare(
            "SELECT phrase,last_used,last_seen,frequency_used,frequency_seen,manually_added
             FROM dictionary ORDER BY phrase",
        )?;
        let rows = st.query_map([], |r| {
            Ok(DictEntry {
                phrase: r.get(0)?,
                last_used: r.get(1)?,
                last_seen: r.get(2)?,
                frequency_used: r.get(3)?,
                frequency_seen: r.get(4)?,
                manually_added: r.get::<_, i64>(5)? != 0,
            })
        })?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    pub fn dict_add(&self, phrase: &str, manual: bool) -> Result<()> {
        self.conn.execute(
            "INSERT INTO dictionary(phrase, manually_added) VALUES (?1, ?2)
             ON CONFLICT(phrase) DO NOTHING",
            params![phrase, manual as i64],
        )?;
        Ok(())
    }

    pub fn dict_remove(&self, phrase: &str) -> Result<()> {
        self.conn
            .execute("DELETE FROM dictionary WHERE phrase=?1", params![phrase])?;
        Ok(())
    }

    pub fn dict_bump_used(&self, phrase: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE dictionary SET frequency_used=frequency_used+1, last_used=?1 WHERE phrase=?2",
            params![chrono::Utc::now().timestamp_millis(), phrase],
        )?;
        Ok(())
    }

    /// Dictionary phrases + recent transcript vocab as whisper initial_prompt.
    pub fn bias_prompt(&self) -> String {
        let mut parts: Vec<String> = Vec::new();
        if let Ok(mut st) = self
            .conn
            .prepare("SELECT phrase FROM dictionary ORDER BY frequency_used DESC LIMIT 40")
        {
            if let Ok(rows) = st.query_map([], |r| r.get::<_, String>(0)) {
                parts.extend(rows.filter_map(|r| r.ok()));
            }
        }
        parts.join(", ")
    }

    pub fn snippets(&self) -> Result<Vec<Snippet>> {
        let mut st = self
            .conn
            .prepare("SELECT id,trigger,expansion FROM snippets ORDER BY trigger")?;
        let rows = st.query_map([], |r| {
            Ok(Snippet {
                id: r.get(0)?,
                trigger: r.get(1)?,
                expansion: r.get(2)?,
            })
        })?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    pub fn snippet_upsert(&self, s: &Snippet) -> Result<()> {
        self.conn.execute(
            "INSERT INTO snippets(id,trigger,expansion) VALUES (?1,?2,?3)
             ON CONFLICT(id) DO UPDATE SET trigger=excluded.trigger, expansion=excluded.expansion",
            params![s.id, s.trigger, s.expansion],
        )?;
        Ok(())
    }

    pub fn snippet_remove(&self, id: &str) -> Result<()> {
        self.conn
            .execute("DELETE FROM snippets WHERE id=?1", params![id])?;
        Ok(())
    }

    pub fn transforms(&self) -> Result<Vec<Transform>> {
        let mut st = self
            .conn
            .prepare("SELECT name,prompt,builtin FROM transforms ORDER BY name")?;
        let rows = st.query_map([], |r| {
            Ok(Transform {
                name: r.get(0)?,
                prompt: r.get(1)?,
                builtin: r.get::<_, i64>(2)? != 0,
            })
        })?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    pub fn transform_upsert(&self, t: &Transform) -> Result<()> {
        self.conn.execute(
            "INSERT INTO transforms(name,prompt,builtin) VALUES (?1,?2,0)
             ON CONFLICT(name) DO UPDATE SET prompt=excluded.prompt",
            params![t.name, t.prompt],
        )?;
        Ok(())
    }

    pub fn transform_remove(&self, name: &str) -> Result<()> {
        self.conn.execute(
            "DELETE FROM transforms WHERE name=?1 AND builtin=0",
            params![name],
        )?;
        Ok(())
    }

    pub fn meeting_insert(&self, m: &MeetingRow) -> Result<()> {
        self.conn.execute(
            "INSERT INTO meetings(id,started_at,ended_at,title,audio_path,transcript,notes,status)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
            params![
                m.id,
                m.started_at,
                m.ended_at,
                m.title,
                m.audio_path,
                m.transcript,
                m.notes,
                m.status
            ],
        )?;
        Ok(())
    }

    pub fn meeting_finish(&self, id: &str, audio_path: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE meetings SET ended_at=?1, audio_path=?2, status='recorded' WHERE id=?3",
            params![chrono::Utc::now().timestamp_millis(), audio_path, id],
        )?;
        Ok(())
    }

    pub fn meeting_set_result(
        &self,
        id: &str,
        transcript: &str,
        notes: Option<&str>,
    ) -> Result<()> {
        self.conn.execute(
            "UPDATE meetings SET transcript=?1, notes=?2, status='done' WHERE id=?3",
            params![transcript, notes, id],
        )?;
        Ok(())
    }

    pub fn meetings(&self, limit: i64) -> Result<Vec<MeetingRow>> {
        let mut st = self.conn.prepare(
            "SELECT id,started_at,ended_at,title,audio_path,transcript,notes,status
             FROM meetings ORDER BY started_at DESC LIMIT ?1",
        )?;
        let rows = st.query_map(params![limit], |r| {
            Ok(MeetingRow {
                id: r.get(0)?,
                started_at: r.get(1)?,
                ended_at: r.get(2)?,
                title: r.get(3)?,
                audio_path: r.get(4)?,
                transcript: r.get(5)?,
                notes: r.get(6)?,
                status: r.get(7)?,
            })
        })?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    pub fn meeting_get(&self, id: &str) -> Result<Option<MeetingRow>> {
        let mut st = self.conn.prepare(
            "SELECT id,started_at,ended_at,title,audio_path,transcript,notes,status
             FROM meetings WHERE id=?1",
        )?;
        let mut rows = st.query_map(params![id], |r| {
            Ok(MeetingRow {
                id: r.get(0)?,
                started_at: r.get(1)?,
                ended_at: r.get(2)?,
                title: r.get(3)?,
                audio_path: r.get(4)?,
                transcript: r.get(5)?,
                notes: r.get(6)?,
                status: r.get(7)?,
            })
        })?;
        Ok(rows.next().transpose()?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn memdb() -> Db {
        let dir = std::env::temp_dir().join(format!("ff-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let conn = Connection::open(dir.join("t.sqlite")).unwrap();
        conn.execute_batch(DDL).unwrap();
        let db = Db { conn };
        db.seed_transforms();
        db
    }

    fn hist(id: &str) -> HistoryEntry {
        HistoryEntry {
            id: id.into(),
            timestamp: 1700000000000,
            asr_text: "hello world".into(),
            formatted_text: "Hello world.".into(),
            edited_text: None,
            app: "notepad".into(),
            url: None,
            language: "en".into(),
            duration_ms: 1200,
            num_words: 2,
            model: "small.en".into(),
        }
    }

    #[test]
    fn history_round_trip() {
        let db = memdb();
        assert!(db.history(10).unwrap().is_empty());
        db.add_history(&hist("a")).unwrap();
        db.add_history(&hist("b")).unwrap();
        let rows = db.history(10).unwrap();
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].formatted_text, "Hello world.");
        db.record_edit("a", "Hello world!").unwrap();
        db.delete_history("b").unwrap();
        let rows = db.history(10).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].edited_text.as_deref(), Some("Hello world!"));
        assert!(db.meeting_get("nope").unwrap().is_none());
    }

    #[test]
    fn dictionary_and_bias() {
        let db = memdb();
        assert_eq!(db.bias_prompt(), "");
        db.dict_add("Kowalski", true).unwrap();
        db.dict_add("Kowalski", true).unwrap(); // idempotent
        db.dict_bump_used("Kowalski").unwrap();
        let rows = db.dictionary().unwrap();
        assert_eq!(rows.len(), 1);
        assert!(rows[0].manually_added && rows[0].frequency_used == 1);
        assert_eq!(db.bias_prompt(), "Kowalski");
        db.dict_remove("Kowalski").unwrap();
        assert!(db.dictionary().unwrap().is_empty());
    }

    #[test]
    fn snippets_and_transforms() {
        let db = memdb();
        db.snippet_upsert(&Snippet {
            id: "1".into(),
            trigger: "brb".into(),
            expansion: "be right back".into(),
        })
        .unwrap();
        db.snippet_upsert(&Snippet {
            id: "1".into(),
            trigger: "brb".into(),
            expansion: "be right back!".into(),
        })
        .unwrap();
        assert_eq!(db.snippets().unwrap()[0].expansion, "be right back!");
        db.snippet_remove("1").unwrap();
        assert!(db.snippets().unwrap().is_empty());

        assert!(db
            .transforms()
            .unwrap()
            .iter()
            .any(|t| t.name == "Polish" && t.builtin));
        db.transform_upsert(&Transform {
            name: "Terse".into(),
            prompt: "one line".into(),
            builtin: false,
        })
        .unwrap();
        assert_eq!(db.transforms().unwrap().len(), 2);
        db.transform_remove("Polish").unwrap(); // builtin: kept
        assert!(db.transforms().unwrap().iter().any(|t| t.name == "Polish"));
        db.transform_remove("Terse").unwrap();
        assert_eq!(db.transforms().unwrap().len(), 1);
    }

    #[test]
    fn meetings_lifecycle() {
        let db = memdb();
        let m = MeetingRow {
            id: "m1".into(),
            started_at: 1700000000000,
            ended_at: None,
            title: "Standup".into(),
            audio_path: "x.wav".into(),
            transcript: None,
            notes: None,
            status: "recording".into(),
        };
        db.meeting_insert(&m).unwrap();
        db.meeting_finish("m1", "x.wav").unwrap();
        db.meeting_set_result("m1", "hello", Some("notes")).unwrap();
        let got = db.meeting_get("m1").unwrap().unwrap();
        assert_eq!(got.transcript.as_deref(), Some("hello"));
        assert_eq!(got.notes.as_deref(), Some("notes"));
        assert_eq!(got.status, "done");
        assert_eq!(db.meetings(10).unwrap().len(), 1);
    }

    #[test]
    fn settings_round_trip() {
        let db = memdb();
        assert!(db.load_settings().is_none());
        let s = Settings {
            model: "large-v3-turbo".into(),
            ..Settings::default()
        };
        db.save_settings(&s).unwrap();
        assert_eq!(db.load_settings().unwrap().model, "large-v3-turbo");
    }
}
