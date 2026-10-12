//! System tray: status item + menu, and overlay-window visibility.

use anyhow::Result;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager};

pub fn build(app: &AppHandle) -> Result<()> {
    let open = MenuItem::with_id(app, "open", "Open FreeFlow", true, None::<&str>)?;
    let dictate = MenuItem::with_id(app, "dictate", "Dictate", true, None::<&str>)?;
    let meeting = MenuItem::with_id(app, "meeting", "Start meeting", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &open,
            &dictate,
            &meeting,
            &PredefinedMenuItem::separator(app)?,
            &quit,
        ],
    )?;

    TrayIconBuilder::new()
        .menu(&menu)
        .tooltip("FreeFlow — local voice typing")
        .icon(
            app.default_window_icon()
                .cloned()
                .unwrap_or_else(|| tauri::image::Image::new(&[], 0, 0)),
        )
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.unminimize();
                    let _ = w.set_focus();
                }
            }
            "dictate" => {
                let app2 = app.clone();
                tauri::async_runtime::spawn(async move {
                    let _ = crate::commands::start_dictation(app2).await;
                });
            }
            "meeting" => {
                let app2 = app.clone();
                tauri::async_runtime::spawn(async move {
                    let recording = app2
                        .state::<crate::state::AppState>()
                        .meeting
                        .lock()
                        .is_some();
                    if recording {
                        let _ = crate::commands::stop_meeting(app2).await;
                    } else {
                        let _ = crate::commands::start_meeting(app2, None).await;
                    }
                });
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.unminimize();
                    let _ = w.set_focus();
                }
            }
        })
        .build(app)?;
    Ok(())
}

/// Show/hide the status overlay without focusing it.
pub fn set_overlay_visible(app: &AppHandle, visible: bool) {
    if let Some(w) = app.get_webview_window("overlay") {
        if visible {
            let _ = w.show();
            let _ = w.set_ignore_cursor_events(true);
        } else {
            let _ = w.hide();
        }
    }
}
