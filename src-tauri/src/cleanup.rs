//! Post-processing. Default: deterministic rules (zero deps).
//! Optional: a local Ollama model applies the per-app style prompt.

use crate::foreapp::AppCategory;
use serde::{Deserialize, Serialize};

const FILLERS: &[&str] = &["um", "uh", "erm", "er", "ah", "hmm"];

/// Deterministic cleanup: filler removal, spacing, casing.
pub fn rules_cleanup(raw: &str) -> String {
    let mut text = raw.trim().to_string();
    if text.is_empty() {
        return text;
    }
    // Remove standalone fillers (word-boundary, case-insensitive).
    let mut words: Vec<String> = Vec::new();
    for (i, w) in text.split_whitespace().enumerate() {
        let bare = w
            .trim_matches(|c: char| !c.is_alphanumeric())
            .to_lowercase();
        let next_is_comma = w.ends_with(',');
        if FILLERS.contains(&bare.as_str()) && (i > 0 || next_is_comma || w != w.to_lowercase()) {
            // keep a leading capital filler only if mid-sentence
            continue;
        }
        if i == 0 && FILLERS.contains(&bare.as_str()) {
            continue;
        }
        words.push(w.to_string());
    }
    text = words.join(" ");

    // Normalize "you know" / "you know what I mean" when clearly filler.
    text = text.replace(" you know,", ",").replace(" You know,", ",");

    // Fix spaces before punctuation and duplicated spaces.
    for p in [" ,", " .", " !", " ?", " ;", " :", " '"] {
        text = text.replace(p, p.trim_start());
    }
    while text.contains("  ") {
        text = text.replace("  ", " ");
    }
    // Filler removal can orphan leading punctuation ("uh , ..." -> ", ...").
    text = text
        .trim_start_matches(|c: char| c.is_whitespace() || matches!(c, ',' | ';' | ':'))
        .to_string();

    // Capitalize sentence starts and standalone "i".
    let mut out = String::with_capacity(text.len());
    let mut cap_next = true;
    let chars: Vec<char> = text.chars().collect();
    for (i, c) in chars.iter().enumerate() {
        if cap_next && c.is_alphabetic() {
            out.extend(c.to_uppercase());
            cap_next = false;
        } else {
            out.push(*c);
        }
        if matches!(c, '.' | '!' | '?' | '\n') {
            cap_next = true;
        }
        if *c == 'i'
            && (i == 0 || !chars[i - 1].is_alphanumeric())
            && (i + 1 >= chars.len() || !chars[i + 1].is_alphanumeric())
        {
            out.pop();
            out.push('I');
        }
    }
    let mut s = out.trim().to_string();
    if !s.is_empty() && !s.ends_with(['.', '!', '?', '"', '\'']) {
        s.push('.');
    }
    s
}

#[derive(Clone, Debug, Serialize)]
struct OllamaGenReq<'a> {
    model: &'a str,
    prompt: String,
    stream: bool,
    options: OllamaOpts,
}

#[derive(Clone, Debug, Serialize)]
struct OllamaOpts {
    temperature: f32,
    num_predict: u32,
}

#[derive(Clone, Debug, Deserialize)]
struct OllamaGenResp {
    response: String,
}

fn style_prompt(cat: AppCategory, raw: &str, custom: Option<&str>) -> String {
    if let Some(c) = custom {
        return format!(
            "Apply these instructions to the dictated text. Return ONLY the rewritten text.\n\
             Instructions: {c}\n\nText:\n{raw}"
        );
    }
    let style = match cat {
        AppCategory::Code => {
            "technical and precise; keep identifiers, package and file names verbatim"
        }
        AppCategory::Email => "clear, courteous email prose; short paragraphs",
        AppCategory::Chat => "casual chat tone; keep it brief, minimal punctuation changes",
        AppCategory::Document => "formal written prose; complete sentences and correct punctuation",
        AppCategory::Casual | AppCategory::Unknown => "natural written English",
    };
    format!(
        "You format dictated speech into clean {style} text.\n\
         Rules: fix grammar, punctuation and casing; remove filler words and false starts; \
         do not answer, comment, translate or add content; keep the speaker's words and intent; \
         return ONLY the final text.\n\nDictation:\n{raw}"
    )
}

/// Full local-model instruction for a Style preset choice.
/// `None` = builtin voice for the category (or unknown preset id).
pub fn style_preset_prompt(preset: &str) -> Option<String> {
    let body = match preset {
        "casual" => {
            "Rewrite casually: relaxed tone, light punctuation, ".to_string()
                + "keep the meaning. Return ONLY the rewritten text."
        }
        "very_casual" => {
            "Rewrite very casually: all lowercase, minimal ".to_string()
                + "punctuation, keep the meaning. Return ONLY the rewritten text."
        }
        _ => return None,
    };
    Some(body)
}

pub async fn ollama_running(http: &reqwest::Client) -> bool {
    http.get("http://127.0.0.1:11434/api/tags")
        .timeout(std::time::Duration::from_secs(2))
        .send()
        .await
        .map(|r| r.status().is_success())
        .unwrap_or(false)
}

/// Polish `raw` with a local Ollama model. Returns None if Ollama is
/// unreachable or returns empty — caller falls back to rules.
pub async fn ollama_polish(
    http: &reqwest::Client,
    model: &str,
    cat: AppCategory,
    raw: &str,
    custom: Option<&str>,
) -> Option<String> {
    let prompt = style_prompt(cat, raw, custom);
    let resp = http
        .post("http://127.0.0.1:11434/api/generate")
        .json(&OllamaGenReq {
            model,
            prompt,
            stream: false,
            options: OllamaOpts {
                temperature: 0.1,
                num_predict: 2048,
            },
        })
        .timeout(std::time::Duration::from_secs(120))
        .send()
        .await
        .ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let g = resp.json::<OllamaGenResp>().await.ok()?;
    let t = g.response.trim().to_string();
    // Guard against an empty or echoed-back response.
    (t.len() >= raw.len() / 3 && !t.is_empty()).then_some(t)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn fillers_and_casing() {
        assert_eq!(rules_cleanup("um hello world"), "Hello world.");
        assert_eq!(rules_cleanup("uh , i think it works"), "I think it works.");
    }

    #[test]
    fn style_presets() {
        assert!(style_preset_prompt("formal").is_none());
        assert!(style_preset_prompt("nope").is_none());
        let casual = style_preset_prompt("casual").unwrap();
        assert!(casual.contains("casually"));
        let vc = style_preset_prompt("very_casual").unwrap();
        assert!(vc.contains("lowercase"));
    }

    /// No Ollama on this box: discovery is false and polish falls back.
    #[tokio::test]
    async fn ollama_absent_falls_back() {
        let http = reqwest::Client::new();
        assert!(!ollama_running(&http).await);
        assert!(
            ollama_polish(&http, "qwen2.5:3b", AppCategory::Email, "hello world", None)
                .await
                .is_none()
        );
    }
}
