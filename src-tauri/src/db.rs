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

use crate::storage::{tree_dir, valid_id};

pub struct OpenTree {
    pub id: String,
    pub conn: Connection,
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
pub async fn tree_open(app: AppHandle, state: State<'_, DbState>, id: String) -> Result<TreeOpenInfo, String> {
    valid_id(&id)?;
    let dir = tree_dir(&app, &id)?;
    let media = dir.join("media");
    std::fs::create_dir_all(&media).map_err(|e| e.to_string())?;
    let path = dir.join("tree.db");
    let is_new = !path.exists();
    let conn = open_connection(&path)?;
    let mut guard = state.0.lock().map_err(|_| "Database lock poisoned".to_string())?;
    *guard = Some(OpenTree { id: id.clone(), conn });
    Ok(TreeOpenInfo {
        id,
        path: path.to_string_lossy().into_owned(),
        media_dir: media.to_string_lossy().into_owned(),
        is_new,
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
