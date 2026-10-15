//! Family Tree — the native shell around the interface.
//!
//! The same library runs on Windows, macOS and Linux today and on Android and
//! iOS later (Phase 4): `run()` is the shared entry point, and desktop-only
//! pieces such as the menu bar are switched on with `#[cfg(desktop)]`.

mod backup;
mod crypto;
mod db;
mod media;
#[cfg(desktop)]
mod menu;
mod storage;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(db::DbState::default())
        .manage(crypto::KeyState::default())
        .setup(|app| {
            #[cfg(desktop)]
            menu::install(app)?;
            let _ = app;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            db::tree_open,
            db::tree_close,
            db::tree_delete,
            db::db_query,
            db::db_batch,
            db::app_set_key,
            db::tree_is_encrypted,
            db::tree_set_encryption,
            db::app_change_key,
            storage::paths_info,
            storage::prefs_read,
            storage::prefs_write,
            storage::file_read_bytes,
            storage::file_write_text,
            media::media_import,
            media::media_remove,
            backup::backup_now,
            backup::backup_list,
            backup::backup_restore,
            backup::backup_export,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Family Tree");
}
