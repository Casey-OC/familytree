//! Local backups.
//!
//! A backup is a consistent copy of the tree database, made with `VACUUM INTO`,
//! saved to `<app data>/backups/<tree id>/<timestamp>.db`. Media files never
//! change once added (each has a unique name), so the backup folder keeps one
//! shared copy of every media file and each new backup only copies new ones.

use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, State};

use crate::db::{db_file, open_connection, DbState, OpenTree};
use crate::storage::{app_dir, tree_dir, valid_id};

const KEEP: usize = 20;

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub file: String,
    pub created: String,
    pub size_bytes: u64,
    pub reason: String,
}

fn backup_dir(app: &AppHandle, id: &str) -> Result<PathBuf, String> {
    valid_id(id)?;
    let d = app_dir(app)?.join("backups").join(id);
    std::fs::create_dir_all(d.join("media")).map_err(|e| e.to_string())?;
    Ok(d)
}

/// Copies media files that the destination doesn't have yet. Returns how many were copied.
pub fn sync_media(from: &Path, to: &Path) -> Result<usize, String> {
    std::fs::create_dir_all(to).map_err(|e| e.to_string())?;
    let mut n = 0;
    if let Ok(entries) = std::fs::read_dir(from) {
        for e in entries.flatten() {
            let p = e.path();
            if p.is_file() {
                let dest = to.join(e.file_name());
                if !dest.exists() {
                    std::fs::copy(&p, &dest).map_err(|e| e.to_string())?;
                    n += 1;
                }
            }
        }
    }
    Ok(n)
}

fn info_for(path: &Path) -> Option<BackupInfo> {
    let name = path.file_name()?.to_string_lossy().into_owned();
    if !name.ends_with(".db") {
        return None;
    }
    // File names look like 20261015-180000_auto.db
    let stem = name.trim_end_matches(".db");
    let (stamp, reason) = stem.split_once('_').unwrap_or((stem, "manual"));
    let (stamp, reason) = (stamp.to_string(), reason.to_string());
    let created = chrono::NaiveDateTime::parse_from_str(&stamp, "%Y%m%d-%H%M%S")
        .map(|d| d.format("%Y-%m-%dT%H:%M:%S").to_string())
        .unwrap_or_default();
    let size_bytes = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
    Some(BackupInfo { file: name, created, size_bytes, reason })
}

pub fn list_in(dir: &Path) -> Vec<BackupInfo> {
    let mut v: Vec<BackupInfo> = std::fs::read_dir(dir)
        .map(|it| it.flatten().filter_map(|e| info_for(&e.path())).collect())
        .unwrap_or_default();
    v.sort_by(|a, b| b.file.cmp(&a.file));
    v
}

pub fn snapshot(conn: &rusqlite::Connection, dest: &Path) -> Result<(), String> {
    if dest.exists() {
        std::fs::remove_file(dest).map_err(|e| e.to_string())?;
    }
    conn.execute("VACUUM INTO ?1", [dest.to_string_lossy().as_ref()])
        .map_err(|e| format!("Backup failed: {e}"))?;
    Ok(())
}

fn clean_reason(r: &str) -> String {
    let s: String = r.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-').take(24).collect();
    if s.is_empty() { "manual".into() } else { s }
}

#[tauri::command]
pub async fn backup_now(app: AppHandle, state: State<'_, DbState>, tree_id: String, reason: String) -> Result<BackupInfo, String> {
    let dir = backup_dir(&app, &tree_id)?;
    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S").to_string();
    let dest = dir.join(format!("{stamp}_{}.db", clean_reason(&reason)));
    {
        let guard = state.0.lock().map_err(|_| "Database lock poisoned".to_string())?;
        match guard.as_ref() {
            Some(t) if t.id == tree_id => snapshot(&t.conn, &dest)?,
            _ => {
                let conn = open_connection(&db_file(&app, &tree_id)?)?;
                snapshot(&conn, &dest)?;
            }
        }
    }
    sync_media(&tree_dir(&app, &tree_id)?.join("media"), &dir.join("media"))?;
    // Keep the newest backups only.
    let all = list_in(&dir);
    for old in all.iter().skip(KEEP) {
        let _ = std::fs::remove_file(dir.join(&old.file));
    }
    info_for(&dest).ok_or_else(|| "Backup was not written".into())
}

#[tauri::command]
pub async fn backup_list(app: AppHandle, tree_id: String) -> Result<Vec<BackupInfo>, String> {
    Ok(list_in(&backup_dir(&app, &tree_id)?))
}

/// Replaces the tree with a backup. A safety backup of the current state is made first.
#[tauri::command]
pub async fn backup_restore(app: AppHandle, state: State<'_, DbState>, tree_id: String, file: String) -> Result<(), String> {
    if file.contains('/') || file.contains('\\') || file.contains("..") || !file.ends_with(".db") {
        return Err("Not a backup file".into());
    }
    let dir = backup_dir(&app, &tree_id)?;
    let src = dir.join(&file);
    if !src.exists() {
        return Err("That backup no longer exists".into());
    }
    let target = db_file(&app, &tree_id)?;
    let mut guard = state.0.lock().map_err(|_| "Database lock poisoned".to_string())?;
    // Safety copy of the current tree before replacing it.
    if target.exists() {
        let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S").to_string();
        let safety = dir.join(format!("{stamp}_before-restore.db"));
        match guard.as_ref() {
            Some(t) if t.id == tree_id => snapshot(&t.conn, &safety)?,
            _ => snapshot(&open_connection(&target)?, &safety)?,
        }
    }
    *guard = None;
    for ext in ["-wal", "-shm"] {
        let _ = std::fs::remove_file(PathBuf::from(format!("{}{}", target.to_string_lossy(), ext)));
    }
    std::fs::copy(&src, &target).map_err(|e| format!("Restore failed: {e}"))?;
    sync_media(&dir.join("media"), &tree_dir(&app, &tree_id)?.join("media"))?;
    let conn = open_connection(&target)?;
    *guard = Some(OpenTree { id: tree_id, conn });
    Ok(())
}

/// Saves a complete copy (database + media) into a folder the person chose, such as a USB drive.
#[tauri::command]
pub async fn backup_export(
    app: AppHandle,
    state: State<'_, DbState>,
    tree_id: String,
    dest_dir: String,
    folder_name: String,
) -> Result<String, String> {
    let safe: String = folder_name
        .chars()
        .map(|c| if c.is_alphanumeric() || c == ' ' || c == '-' || c == '_' { c } else { '_' })
        .collect();
    let out = Path::new(&dest_dir).join(safe.trim());
    std::fs::create_dir_all(out.join("media")).map_err(|e| e.to_string())?;
    {
        let guard = state.0.lock().map_err(|_| "Database lock poisoned".to_string())?;
        match guard.as_ref() {
            Some(t) if t.id == tree_id => snapshot(&t.conn, &out.join("tree.db"))?,
            _ => snapshot(&open_connection(&db_file(&app, &tree_id)?)?, &out.join("tree.db"))?,
        }
    }
    sync_media(&tree_dir(&app, &tree_id)?.join("media"), &out.join("media"))?;
    Ok(out.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snapshot_copies_data_and_lists_newest_first() {
        let dir = tempfile::tempdir().unwrap();
        let conn = open_connection(&dir.path().join("tree.db")).unwrap();
        conn.execute_batch("CREATE TABLE t(x); INSERT INTO t VALUES (42);").unwrap();
        let b = dir.path().join("b");
        std::fs::create_dir_all(&b).unwrap();
        snapshot(&conn, &b.join("20261014-180000_auto.db")).unwrap();
        snapshot(&conn, &b.join("20261015-180000_manual.db")).unwrap();
        let list = list_in(&b);
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].reason, "manual");
        assert_eq!(list[0].created, "2026-10-15T18:00:00");
        let copy = rusqlite::Connection::open(b.join(&list[1].file)).unwrap();
        let x: i64 = copy.query_row("SELECT x FROM t", [], |r| r.get(0)).unwrap();
        assert_eq!(x, 42);
    }

    #[test]
    fn media_sync_only_copies_new_files() {
        let dir = tempfile::tempdir().unwrap();
        let (a, b) = (dir.path().join("a"), dir.path().join("b"));
        std::fs::create_dir_all(&a).unwrap();
        std::fs::write(a.join("1.jpg"), b"x").unwrap();
        assert_eq!(sync_media(&a, &b).unwrap(), 1);
        std::fs::write(a.join("2.jpg"), b"y").unwrap();
        assert_eq!(sync_media(&a, &b).unwrap(), 1);
        assert_eq!(sync_media(&a, &b).unwrap(), 0);
    }
}
