mod ssh;
mod window;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .manage(ssh::AppState::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            ssh::connect_ssh,
            ssh::disconnect_ssh,
            ssh::list_dir,
            ssh::start_tail,
            ssh::stop_tail,
            ssh::start_terminal,
            ssh::stop_terminal,
            ssh::write_terminal,
            ssh::resize_terminal,
            ssh::upload_file,
            ssh::download_file,
            ssh::rename_entry,
            ssh::delete_entry,
            ssh::read_text_file,
            ssh::write_text_file,
            ssh::create_file,
            ssh::create_dir,
            ssh::chmod_entry,
            ssh::connect_local,
            ssh::disconnect_local,
            ssh::start_local_terminal,
            ssh::stop_local_terminal,
            ssh::write_local_terminal,
            ssh::resize_local_terminal,
            window::show_main_window,
            window::default_ssh_key_dir
        ]);

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
        window::focus_main_window(app);
    }));

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
