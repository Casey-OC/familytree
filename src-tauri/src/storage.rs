//! App folders, preferences and plain file reads/writes chosen by the user.

use std::path::PathBuf;

use serde::Serialize;
use tauri::{AppHandle, Manager};

pub fn valid_id(id: &str) -> Result<(), String> {
    if !id.is_empty() && id.len() <= 64 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        Ok(())
    } else {
        Err("That tree id isn't valid".into())
    }
}

pub fn app_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

pub fn tree_dir(app: &AppHandle, id: &str) -> Result<PathBuf, String> {
    valid_id(id)?;
    Ok(app_dir(app)?.join("trees").join(id))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Paths {
    pub app_data: String,
    pub trees: String,
    pub backups: String,
}

#[tauri::command]
pub async fn paths_info(app: AppHandle) -> Result<Paths, String> {
    let base = app_dir(&app)?;
    Ok(Paths {
        app_data: base.to_string_lossy().into_owned(),
        trees: base.join("trees").to_string_lossy().into_owned(),
        backups: base.join("backups").to_string_lossy().into_owned(),
    })
}

/// App-wide preferences (theme, light/dark, density, the list of trees).
#[tauri::command]
pub async fn prefs_read(app: AppHandle) -> Result<String, String> {
    let p = app_dir(&app)?.join("prefs.json");
    match std::fs::read_to_string(&p) {
        Ok(s) => Ok(s),
        Err(_) => Ok("{}".into()),
    }
}

#[tauri::command]
pub async fn prefs_write(app: AppHandle, json: String) -> Result<(), String> {
    serde_json::from_str::<serde_json::Value>(&json).map_err(|e| format!("Preferences are not valid JSON: {e}"))?;
    let dir = app_dir(&app)?;
    let tmp = dir.join("prefs.json.tmp");
    std::fs::write(&tmp, json).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, dir.join("prefs.json")).map_err(|e| e.to_string())
}

/// Reads a file the person picked (for example a GEDCOM file) and returns raw bytes.
#[tauri::command]
pub async fn file_read_bytes(path: String) -> Result<tauri::ipc::Response, String> {
    let bytes = std::fs::read(&path).map_err(|e| format!("Couldn't read that file: {e}"))?;
    Ok(tauri::ipc::Response::new(bytes))
}

/// Writes a text file to a location the person picked in a Save dialog.
#[tauri::command]
pub async fn file_write_text(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|e| format!("Couldn't save the file: {e}"))
}
