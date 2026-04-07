use tauri::Manager;

pub fn focus_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[tauri::command]
pub fn show_main_window(app: tauri::AppHandle) {
    focus_main_window(&app);
}

#[tauri::command]
pub fn default_ssh_key_dir() -> String {
    #[cfg(target_os = "windows")]
    {
        let base = std::env::var("USERPROFILE").unwrap_or_else(|_| String::from("C:\\Users"));
        return format!("{base}\\.ssh");
    }

    #[cfg(not(target_os = "windows"))]
    {
        let base = std::env::var("HOME").unwrap_or_else(|_| String::from("~"));
        format!("{base}/.ssh")
    }
}
