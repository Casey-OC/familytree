//! The local tree database.
//!
//! Each family tree is one SQLite file at `<app data>/trees/<tree id>/tree.db`.
//! The interface only sends SQL text plus parameters; the TypeScript side owns
//! the schema and the queries, so the same logic works on desktop and mobile.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use rusqlite::types::{Value, ValueRef};
use rusqlite::{params_from_iter, Connection};
use serde::{Deserialize, Serialize};
use serde_json::Value as Json;
use tauri::{AppHandle, State};

use crate::crypto::{self, KeyState};
use crate::storage::{app_dir, tree_dir, valid_id};

pub struct OpenTree {
    pub id: String,
    pub conn: Connection,
    pub encrypted: bool,
}

#[derive(Default)]
pub struct DbState(pub Mutex<Option<OpenTree>>);

#[derive(Deserialize, Debug, Clone)]
pub struct Stmt {
    pub sql: String,
    #[serde(default)]
    pub params: Vec<Json>,
}

#[derive(Serialize, Debug)]
pub struct QueryResult {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<Json>>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TreeOpenInfo {
    pub id: String,
    pub path: String,
    pub media_dir: String,
    pub is_new: bool,
    pub encrypted: bool,
}

pub fn to_sql(v: &Json) -> Value {
    match v {
        Json::Null => Value::Null,
        Json::Bool(b) => Value::Integer(*b as i64),
        Json::Number(n) => {
            if let Some(i) = n.as_i64() {
                Value::Integer(i)
            } else {
                Value::Real(n.as_f64().unwrap_or(0.0))
            }
        }
        Json::String(s) => Value::Text(s.clone()),
        other => Value::Text(other.to_string()),
    }
}

pub fn from_sql(v: ValueRef) -> Json {
    match v {
        ValueRef::Null => Json::Null,
        ValueRef::Integer(i) => Json::from(i),
        ValueRef::Real(f) => serde_json::Number::from_f64(f).map(Json::Number).unwrap_or(Json::Null),
        ValueRef::Text(t) => Json::String(String::from_utf8_lossy(t).into_owned()),
        ValueRef::Blob(_) => Json::Null,
    }
}

pub fn open_connection(path: &Path) -> Result<Connection, String> {
    let conn = Connection::open(path).map_err(|e| format!("Could not open the tree file: {e}"))?;
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         PRAGMA foreign_keys = ON;
         PRAGMA busy_timeout = 5000;",
    )
    .map_err(|e| e.to_string())?;
    Ok(conn)
}

pub fn run_query(conn: &Connection, sql: &str, params: &[Json]) -> Result<QueryResult, String> {
    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let columns: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
    let n = columns.len();
    let values: Vec<Value> = params.iter().map(to_sql).collect();
    let mut rows = stmt.query(params_from_iter(values.iter())).map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let mut r = Vec::with_capacity(n);
        for i in 0..n {
            r.push(from_sql(row.get_ref(i).map_err(|e| e.to_string())?));
        }
        out.push(r);
    }
    Ok(QueryResult { columns, rows: out })
}

pub fn run_batch(conn: &mut Connection, stmts: &[Stmt]) -> Result<(), String> {
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    for s in stmts {
        let values: Vec<Value> = s.params.iter().map(to_sql).collect();
        if values.is_empty() && !s.sql.contains('?') {
            tx.execute_batch(&s.sql).map_err(|e| format!("{e} — in: {}", s.sql))?;
        } else {
            tx.execute(&s.sql, params_from_iter(values.iter()))
                .map_err(|e| format!("{e} — in: {}", s.sql))?;
        }
    }
    tx.commit().map_err(|e| e.to_string())
}

pub fn db_file(app: &AppHandle, id: &str) -> Result<PathBuf, String> {
    Ok(tree_dir(app, id)?.join("tree.db"))
}

#[tauri::command]
pub async fn tree_open(app: AppHandle, state: State<'_, DbState>, keys: State<'_, KeyState>, id: String) -> Result<TreeOpenInfo, String> {
    valid_id(&id)?;
    let dir = tree_dir(&app, &id)?;
    let media = dir.join("media");
    std::fs::create_dir_all(&media).map_err(|e| e.to_string())?;
    let path = dir.join("tree.db");
    let is_new = !path.exists();
    let key = session_key(&keys);
    let (conn, encrypted) = crypto::open_smart(&path, key.as_deref())?;
    let mut guard = state.0.lock().map_err(|_| "Database lock poisoned".to_string())?;
    *guard = Some(OpenTree { id: id.clone(), conn, encrypted });
    Ok(TreeOpenInfo {
        id,
        path: path.to_string_lossy().into_owned(),
        media_dir: media.to_string_lossy().into_owned(),
        is_new,
        encrypted,
    })
}

#[tauri::command]
pub async fn tree_close(state: State<'_, DbState>) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|_| "Database lock poisoned".to_string())?;
    *guard = None;
    Ok(())
}

#[tauri::command]
pub async fn tree_delete(app: AppHandle, state: State<'_, DbState>, id: String) -> Result<(), String> {
    valid_id(&id)?;
    {
        let mut guard = state.0.lock().map_err(|_| "Database lock poisoned".to_string())?;
        if guard.as_ref().map(|t| t.id == id).unwrap_or(false) {
            *guard = None;
        }
    }
    let dir = tree_dir(&app, &id)?;
    if dir.exists() {
        std::fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn db_query(state: State<'_, DbState>, sql: String, params: Vec<Json>) -> Result<QueryResult, String> {
    let guard = state.0.lock().map_err(|_| "Database lock poisoned".to_string())?;
    let tree = guard.as_ref().ok_or("No tree is open")?;
    run_query(&tree.conn, &sql, &params)
}

#[tauri::command]
pub async fn db_batch(state: State<'_, DbState>, stmts: Vec<Stmt>) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|_| "Database lock poisoned".to_string())?;
    let tree = guard.as_mut().ok_or("No tree is open")?;
    run_batch(&mut tree.conn, &stmts)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn batch_and_query_round_trip() {
        let dir = tempfile::tempdir().unwrap();
        let mut conn = open_connection(&dir.path().join("t.db")).unwrap();
        run_batch(
            &mut conn,
            &[
                Stmt { sql: "CREATE TABLE person (id TEXT PRIMARY KEY, given TEXT, living INTEGER, h REAL)".into(), params: vec![] },
                Stmt {
                    sql: "INSERT INTO person VALUES (?, ?, ?, ?)".into(),
                    params: vec![Json::from("p1"), Json::from("Rose"), Json::from(true), Json::from(1.5)],
                },
            ],
        )
        .unwrap();
        let r = run_query(&conn, "SELECT id, given, living, h FROM person WHERE id = ?", &[Json::from("p1")]).unwrap();
        assert_eq!(r.columns, vec!["id", "given", "living", "h"]);
        assert_eq!(r.rows[0], vec![Json::from("p1"), Json::from("Rose"), Json::from(1), Json::from(1.5)]);
    }

    #[test]
    fn failed_batch_rolls_back() {
        let dir = tempfile::tempdir().unwrap();
        let mut conn = open_connection(&dir.path().join("t.db")).unwrap();
        run_batch(&mut conn, &[Stmt { sql: "CREATE TABLE t (id TEXT PRIMARY KEY)".into(), params: vec![] }]).unwrap();
        let res = run_batch(
            &mut conn,
            &[
                Stmt { sql: "INSERT INTO t VALUES (?)".into(), params: vec![Json::from("a")] },
                Stmt { sql: "INSERT INTO t VALUES (?)".into(), params: vec![Json::from("a")] },
            ],
        );
        assert!(res.is_err());
        let r = run_query(&conn, "SELECT count(*) FROM t", &[]).unwrap();
        assert_eq!(r.rows[0][0], Json::from(0));
    }
}

pub fn session_key(keys: &State<'_, KeyState>) -> Option<String> {
    keys.0.lock().ok().and_then(|g| g.clone())
}

/// Remembers (or forgets) the app password for this session after the person unlocks.
#[tauri::command]
pub async fn app_set_key(keys: State<'_, KeyState>, key: Option<String>) -> Result<(), String> {
    let mut g = keys.0.lock().map_err(|_| "Key lock poisoned".to_string())?;
    *g = key.filter(|k| !k.is_empty());
    Ok(())
}

#[tauri::command]
pub async fn tree_is_encrypted(app: AppHandle, state: State<'_, DbState>, id: String) -> Result<bool, String> {
    valid_id(&id)?;
    if let Ok(g) = state.0.lock() {
        if let Some(t) = g.as_ref().filter(|t| t.id == id) {
            return Ok(t.encrypted);
        }
    }
    Ok(crypto::is_encrypted(&db_file(&app, &id)?))
}

fn backup_files(app: &AppHandle, id: &str) -> Vec<PathBuf> {
    let dir = match app_dir(app) {
        Ok(d) => d.join("backups").join(id),
        Err(_) => return vec![],
    };
    std::fs::read_dir(dir)
        .map(|it| it.flatten().map(|e| e.path()).filter(|p| p.extension().map(|x| x == "db").unwrap_or(false)).collect())
        .unwrap_or_default()
}

/// Encrypts (or decrypts) one tree and its backups with the session password.
#[tauri::command]
pub async fn tree_set_encryption(
    app: AppHandle,
    state: State<'_, DbState>,
    keys: State<'_, KeyState>,
    id: String,
    encrypt: bool,
) -> Result<(), String> {
    valid_id(&id)?;
    let key = session_key(&keys);
    if encrypt && key.is_none() {
        return Err("Set an app password first".into());
    }
    let path = db_file(&app, &id)?;
    let mut guard = state.0.lock().map_err(|_| "Database lock poisoned".to_string())?;
    let was_open = guard.as_ref().map(|t| t.id == id).unwrap_or(false);
    if was_open {
        *guard = None; // close it while the file is rewritten
    }
    let target = if encrypt { key.as_deref() } else { None };
    let res = crypto::convert_file(&path, key.as_deref(), target);
    for b in backup_files(&app, &id) {
        let _ = crypto::convert_file(&b, key.as_deref(), target);
    }
    if was_open {
        let (conn, encrypted) = crypto::open_smart(&path, key.as_deref())?;
        *guard = Some(OpenTree { id: id.clone(), conn, encrypted });
    }
    res
}

/// Changes the password on every encrypted tree and backup. Returns how many files were updated.
#[tauri::command]
pub async fn app_change_key(
    app: AppHandle,
    state: State<'_, DbState>,
    keys: State<'_, KeyState>,
    old: String,
    new: String,
) -> Result<u32, String> {
    if new.is_empty() {
        return Err("The new password can't be empty".into());
    }
    let mut guard = state.0.lock().map_err(|_| "Database lock poisoned".to_string())?;
    let open_id = guard.as_ref().map(|t| t.id.clone());
    *guard = None;
    let trees = app_dir(&app)?.join("trees");
    let mut n = 0;
    if let Ok(it) = std::fs::read_dir(&trees) {
        for e in it.flatten() {
            let id = e.file_name().to_string_lossy().into_owned();
            let mut files = vec![e.path().join("tree.db")];
            files.extend(backup_files(&app, &id));
            for f in files {
                if crypto::is_encrypted(&f) && crypto::convert_file(&f, Some(&old), Some(&new)).is_ok() {
                    n += 1;
                }
            }
        }
    }
    *keys.0.lock().map_err(|_| "Key lock poisoned".to_string())? = Some(new.clone());
    if let Some(id) = open_id {
        let (conn, encrypted) = crypto::open_smart(&db_file(&app, &id)?, Some(&new))?;
        *guard = Some(OpenTree { id, conn, encrypted });
    }
    Ok(n)
}
