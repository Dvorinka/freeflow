//! Foreground-app detection -> app category. Mirrors the original's
//! per-app formatting styles without any UIA text reading.

use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AppCategory {
    Code,
    Email,
    Chat,
    Document,
    Casual,
    Unknown,
}

impl AppCategory {
    /// Stable settings-map key for per-category style presets.
    pub fn key(self) -> &'static str {
        match self {
            AppCategory::Code => "code",
            AppCategory::Email => "email",
            AppCategory::Chat => "chat",
            AppCategory::Document => "document",
            AppCategory::Casual => "casual",
            AppCategory::Unknown => "unknown",
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ForegroundApp {
    pub process: String,
    pub title: String,
    pub category: AppCategory,
}

pub fn category_for(exe: &str) -> AppCategory {
    let e = exe.to_lowercase();
    let e = e.trim_end_matches(".exe");
    match e {
        "code" | "devenv" | "rider64" | "idea64" | "pycharm64" | "goland64" | "webstorm64"
        | "clion64" | "sublime_text" | "notepad++" | "vim" | "nvim" | "emacs" | "zed"
        | "cursor" | "windsurf" | "devin" | "windowsterminal" | "wt" | "powershell" | "pwsh"
        | "cmd" | "gitkraken" | "fork" => AppCategory::Code,
        "outlook" | "thunderbird" | "mailspring" | "eM Client" | "hudsmail" => AppCategory::Email,
        "slack" | "discord" | "ms-teams" | "teams" | "telegram" | "signal" | "whatsapp"
        | "messenger" | "element" => AppCategory::Chat,
        "winword" | "notion" | "obsidian" | "writemonkey" | "scrivener" | "libreoffice"
        | "soffice" | "powerpnt" | "excel" | "typora" | "google docs" | "evernote" => {
            AppCategory::Document
        }
        "chrome" | "msedge" | "firefox" | "brave" | "arc" | "vivaldi" | "opera" => {
            AppCategory::Casual
        }
        _ => AppCategory::Unknown,
    }
}

#[cfg(windows)]
pub fn foreground() -> Option<ForegroundApp> {
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_FORMAT,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowTextW, GetWindowThreadProcessId,
    };
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.0.is_null() {
            return None;
        }
        let mut title = [0u16; 512];
        let n = GetWindowTextW(hwnd, &mut title);
        let title = String::from_utf16_lossy(&title[..n as usize]);

        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        let proc = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut buf = [0u16; 1024];
        let mut len = buf.len() as u32;
        let ok = QueryFullProcessImageNameW(
            proc,
            PROCESS_NAME_FORMAT(0),
            windows::core::PWSTR(buf.as_mut_ptr()),
            &mut len,
        )
        .is_ok();
        let _ = CloseHandle(proc);
        if !ok {
            return None;
        }
        let path = String::from_utf16_lossy(&buf[..len as usize]);
        let exe = path.rsplit('\\').next().unwrap_or("").to_string();
        Some(ForegroundApp {
            category: category_for(&exe),
            process: exe,
            title,
        })
    }
}

#[cfg(not(windows))]
pub fn foreground() -> Option<ForegroundApp> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn categories() {
        assert_eq!(category_for("code.exe"), AppCategory::Code);
        assert_eq!(category_for("OUTLOOK.EXE"), AppCategory::Email);
        assert_eq!(category_for("Slack"), AppCategory::Chat);
        assert_eq!(category_for("winword.exe"), AppCategory::Document);
        assert_eq!(category_for("chrome.exe"), AppCategory::Casual);
        assert_eq!(category_for("whatever.exe"), AppCategory::Unknown);
    }
}
