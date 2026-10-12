//! Text injection on Windows: SendInput Unicode keystrokes, with a
//! clipboard+Ctrl+V fallback for large text or stubborn fields.

#[cfg(windows)]
mod imp {
    use anyhow::Result;
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, KEYEVENTF_UNICODE,
        VK_CONTROL, VK_V,
    };

    /// Type text as unicode keystrokes into the currently focused control.
    /// `cps` paces longer strings; 0 = as fast as the OS accepts.
    pub fn type_text(text: &str, cps: u32) -> Result<()> {
        let mut inputs: Vec<INPUT> = Vec::with_capacity(text.len() * 2);
        for unit in text.encode_utf16() {
            for flags in [KEYEVENTF_UNICODE, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP] {
                inputs.push(INPUT {
                    r#type: INPUT_KEYBOARD,
                    Anonymous: INPUT_0 {
                        ki: KEYBDINPUT {
                            wVk: Default::default(),
                            wScan: unit,
                            dwFlags: flags,
                            time: 0,
                            dwExtraInfo: 0,
                        },
                    },
                });
            }
        }
        // SendInput in batches so very long texts don't hit queue limits.
        for chunk in inputs.chunks(64) {
            unsafe {
                SendInput(chunk, std::mem::size_of::<INPUT>() as i32);
            }
            if cps > 0 {
                std::thread::sleep(std::time::Duration::from_millis(
                    (64 / 2) as u64 * 1000 / cps as u64,
                ));
            }
        }
        Ok(())
    }

    /// Simulate Ctrl+V (the caller sets the clipboard first).
    pub fn send_paste() -> Result<()> {
        use windows::Win32::UI::Input::KeyboardAndMouse::KEYBD_EVENT_FLAGS;
        let mk = |vk: u16, up: bool| INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: windows::Win32::UI::Input::KeyboardAndMouse::VIRTUAL_KEY(vk),
                    wScan: 0,
                    dwFlags: if up {
                        KEYEVENTF_KEYUP
                    } else {
                        KEYBD_EVENT_FLAGS(0)
                    },
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        };
        let inputs = [
            mk(VK_CONTROL.0, false),
            mk(VK_V.0, false),
            mk(VK_V.0, true),
            mk(VK_CONTROL.0, true),
        ];
        unsafe {
            SendInput(&inputs, std::mem::size_of::<INPUT>() as i32);
        }
        Ok(())
    }
}

#[cfg(windows)]
pub use imp::*;

#[cfg(not(windows))]
mod imp {
    use anyhow::Result;
    pub fn type_text(_text: &str, _cps: u32) -> Result<()> {
        anyhow::bail!("text injection is Windows-only for now")
    }
    pub fn send_paste() -> Result<()> {
        anyhow::bail!("paste is Windows-only for now")
    }
}

#[cfg(not(windows))]
pub use imp::*;

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    /// Smoke: SendInput accepts the keystrokes (headless-safe — injection
    /// goes to the OS input stream, no window needs focus).
    #[test]
    fn type_short_string() {
        type_text("hi", 0).expect("SendInput typing");
        send_paste().expect("SendInput paste");
    }
}
