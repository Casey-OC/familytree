//! Encryption at rest with SQLCipher.
//!
//! When the person turns on the app password and chooses to encrypt a tree, the tree's
//! database file (and its backups) are encrypted with that password. Without the
//! password the files can't be read. The password is only kept in memory while the
//! app is unlocked.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use rusqlite::Connection;

/// The password for this session, set when the person unlocks the app.
#[derive(Default)]
pub struct KeyState(pub Mutex<Option<String>>);

pub const NEEDS_PASSWORD: &str = "NEEDS_PASSWORD";

fn apply_pragmas(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         PRAGMA foreign_keys = ON;
         PRAGMA busy_timeout = 5000;",
    )
    .map_err(|e| e.to_string())
}

fn readable(conn: &Connection) -> bool {
    conn.query_row("SELECT count(*) FROM sqlite_master", [], |r| r.get::<_, i64>(0)).is_ok()
}

/// Opens a database with `key`, or as a plain file. Returns which one worked.
/// Fails with NEEDS_PASSWORD if the file is encrypted and the key is missing or wrong.
pub fn open_smart(path: &Path, key: Option<&str>) -> Result<(Connection, bool), String> {
    let exists = path.exists();
    // A brand new file stays plain until encryption is switched on for it.
    if !exists {
        let conn = Connection::open(path).map_err(|e| format!("Could not open the tree file: {e}"))?;
        apply_pragmas(&conn)?;
        return Ok((conn, false));
    }
    let plain = Connection::open(path).map_err(|e| format!("Could not open the tree file: {e}"))?;
    if readable(&plain) {
        apply_pragmas(&plain)?;
        return Ok((plain, false));
    }
    drop(plain);
    if let Some(k) = key.filter(|k| !k.is_empty()) {
        let conn = Connection::open(path).map_err(|e| e.to_string())?;
        conn.pragma_update(None, "key", k).map_err(|e| e.to_string())?;
        if readable(&conn) {
            apply_pragmas(&conn)?;
            return Ok((conn, true));
        }
    }
    Err(NEEDS_PASSWORD.into())
}

pub fn is_encrypted(path: &Path) -> bool {
    if !path.exists() {
        return false;
    }
    match Connection::open(path) {
        Ok(c) => !readable(&c),
        Err(_) => false,
    }
}

fn user_version(conn: &Connection) -> i64 {
    conn.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap_or(0)
}

/// Writes a complete copy of `conn` to `dest`, encrypted with `key` (or plain when None).
pub fn export_to(conn: &Connection, dest: &Path, key: Option<&str>) -> Result<(), String> {
    if dest.exists() {
        std::fs::remove_file(dest).map_err(|e| e.to_string())?;
    }
    let uv = user_version(conn);
    let k = key.unwrap_or("");
    conn.execute("ATTACH DATABASE ?1 AS export_target KEY ?2", rusqlite::params![dest.to_string_lossy(), k])
        .map_err(|e| format!("Couldn't write the copy: {e}"))?;
    let res = (|| -> Result<(), String> {
        conn.query_row("SELECT sqlcipher_export('export_target')", [], |_| Ok(())).map_err(|e| e.to_string())?;
        conn.execute_batch(&format!("PRAGMA export_target.user_version = {uv};")).map_err(|e| e.to_string())?;
        Ok(())
    })();
    let _ = conn.execute_batch("DETACH DATABASE export_target;");
    res
}

fn sidecars(path: &Path) -> [PathBuf; 2] {
    let s = path.to_string_lossy();
    [PathBuf::from(format!("{s}-wal")), PathBuf::from(format!("{s}-shm"))]
}

/// Re-writes a database file with a new key (None = plain). `old` is the current key, if any.
/// The file must not be open elsewhere.
pub fn convert_file(path: &Path, old: Option<&str>, new: Option<&str>) -> Result<(), String> {
    let (conn, enc) = open_smart(path, old)?;
    let new = new.filter(|k| !k.is_empty());
    if enc && new.is_some() {
        conn.pragma_update(None, "rekey", new.unwrap()).map_err(|e| e.to_string())?;
        conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);").map_err(|e| e.to_string())?;
        return Ok(());
    }
    if !enc && new.is_none() {
        return Ok(());
    }
    let tmp = path.with_extension("converting");
    conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);").map_err(|e| e.to_string())?;
    export_to(&conn, &tmp, new)?;
    drop(conn);
    for s in sidecars(path) {
        let _ = std::fs::remove_file(s);
    }
    std::fs::rename(&tmp, path).map_err(|e| format!("Couldn't replace the tree file: {e}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make(path: &Path) {
        let (c, _) = open_smart(path, None).unwrap();
        c.execute_batch("CREATE TABLE person(name TEXT); INSERT INTO person VALUES ('Rose'); PRAGMA user_version = 3;").unwrap();
    }

    #[test]
    fn encrypt_rekey_and_decrypt() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("tree.db");
        make(&p);
        assert!(!is_encrypted(&p));
        convert_file(&p, None, Some("correct horse")).unwrap();
        assert!(is_encrypted(&p));
        assert_eq!(open_smart(&p, None).err().unwrap(), NEEDS_PASSWORD);
        assert_eq!(open_smart(&p, Some("wrong")).err().unwrap(), NEEDS_PASSWORD);
        let (c, enc) = open_smart(&p, Some("correct horse")).unwrap();
        assert!(enc);
        let name: String = c.query_row("SELECT name FROM person", [], |r| r.get(0)).unwrap();
        assert_eq!(name, "Rose");
        assert_eq!(user_version(&c), 3);
        drop(c);
        convert_file(&p, Some("correct horse"), Some("battery staple")).unwrap();
        assert!(open_smart(&p, Some("correct horse")).is_err());
        convert_file(&p, Some("battery staple"), None).unwrap();
        assert!(!is_encrypted(&p));
        let (c, enc) = open_smart(&p, Some("anything")).unwrap();
        assert!(!enc);
        assert_eq!(user_version(&c), 3);
    }

    #[test]
    fn encrypted_export_keeps_data() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("tree.db");
        make(&p);
        convert_file(&p, None, Some("pw")).unwrap();
        let (c, _) = open_smart(&p, Some("pw")).unwrap();
        let copy = dir.path().join("copy.db");
        export_to(&c, &copy, Some("pw")).unwrap();
        assert!(is_encrypted(&copy));
        let (c2, _) = open_smart(&copy, Some("pw")).unwrap();
        let n: i64 = c2.query_row("SELECT count(*) FROM person", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 1);
    }
}
