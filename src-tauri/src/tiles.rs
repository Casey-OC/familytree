//! Map tiles with an offline cache, plus place lookups.
//!
//! The map asks for `tilecache://localhost/<upstream URL>`. If we already have that
//! file in `<app data>/tilecache/` it's served straight from disk (works offline);
//! otherwise it's fetched once from the internet and saved for next time.

use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::Serialize;
use tauri::http::{Request, Response, StatusCode};
use tauri::{AppHandle, Manager, UriSchemeContext, UriSchemeResponder, Wry};

const ALLOWED_HOSTS: &[&str] = &["tiles.openfreemap.org", "localhost", "127.0.0.1"];
const MAX_CACHE_BYTES: u64 = 400 * 1024 * 1024;

fn fnv64(s: &str) -> u64 {
    let mut h: u64 = 0xcbf29ce484222325;
    for b in s.as_bytes() {
        h ^= *b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    h
}

pub fn cache_dir(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|d| d.join("tilecache"))
}

fn upstream_from(uri: &str) -> Option<String> {
    // tilecache://localhost/<encoded>  or  http://tilecache.localhost/<encoded> (Windows)
    let after = uri.splitn(4, '/').nth(3)?;
    let decoded = percent_decode(after);
    if decoded.starts_with("https://") || decoded.starts_with("http://") {
        Some(decoded)
    } else {
        None
    }
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn host_of(url: &str) -> &str {
    url.split("://").nth(1).unwrap_or("").split(['/', ':', '?']).next().unwrap_or("")
}

fn agent() -> ureq::Agent {
    ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(20))
        .user_agent(concat!("FamilyTreeApp/", env!("CARGO_PKG_VERSION"), " (desktop genealogy app)"))
        .build()
}

/// Serves one cached-or-fetched file. Returns (status, content type, body).
pub fn fetch_cached(dir: &Path, url: &str) -> (u16, String, Vec<u8>) {
    if !ALLOWED_HOSTS.contains(&host_of(url)) {
        return (403, "text/plain".into(), b"host not allowed".to_vec());
    }
    let key = format!("{:016x}", fnv64(url));
    let body_path = dir.join(&key[..2]).join(&key);
    let type_path = body_path.with_extension("type");
    if let Ok(body) = std::fs::read(&body_path) {
        let ct = std::fs::read_to_string(&type_path).unwrap_or_else(|_| "application/octet-stream".into());
        return (200, ct, body);
    }
    match agent().get(url).call() {
        Ok(resp) => {
            let ct = resp.header("content-type").unwrap_or("application/octet-stream").to_string();
            let mut body = Vec::new();
            if resp.into_reader().take(20 * 1024 * 1024).read_to_end(&mut body).is_err() {
                return (502, "text/plain".into(), b"read failed".to_vec());
            }
            if let Some(parent) = body_path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            let _ = std::fs::write(&body_path, &body);
            let _ = std::fs::write(&type_path, &ct);
            (200, ct, body)
        }
        Err(ureq::Error::Status(code, _)) => (code, "text/plain".into(), Vec::new()),
        // Offline and not cached yet.
        Err(_) => (504, "text/plain".into(), b"offline".to_vec()),
    }
}

pub fn handle(ctx: UriSchemeContext<'_, Wry>, request: Request<Vec<u8>>, responder: UriSchemeResponder) {
    let app = ctx.app_handle().clone();
    let uri = request.uri().to_string();
    tauri::async_runtime::spawn_blocking(move || {
        let resp = match (upstream_from(&uri), cache_dir(&app)) {
            (Some(url), Some(dir)) => {
                let (status, ct, body) = fetch_cached(&dir, &url);
                Response::builder()
                    .status(StatusCode::from_u16(status).unwrap_or(StatusCode::BAD_GATEWAY))
                    .header("Content-Type", ct)
                    .header("Access-Control-Allow-Origin", "*")
                    .body(body)
            }
            _ => Response::builder().status(StatusCode::BAD_REQUEST).body(Vec::new()),
        };
        responder.respond(resp.unwrap_or_else(|_| Response::new(Vec::new())));
    });
}

fn dir_size(dir: &Path, files: &mut Vec<(PathBuf, u64, std::time::SystemTime)>) -> u64 {
    let mut total = 0;
    if let Ok(it) = std::fs::read_dir(dir) {
        for e in it.flatten() {
            let p = e.path();
            if p.is_dir() {
                total += dir_size(&p, files);
            } else if let Ok(m) = e.metadata() {
                total += m.len();
                files.push((p, m.len(), m.modified().unwrap_or(std::time::UNIX_EPOCH)));
            }
        }
    }
    total
}

/// Keeps the cache under its size limit by removing the oldest files.
pub fn prune(dir: &Path, limit: u64) -> u64 {
    let mut files = Vec::new();
    let mut total = dir_size(dir, &mut files);
    if total > limit {
        files.sort_by_key(|f| f.2);
        for (p, len, _) in files {
            if total <= limit * 9 / 10 {
                break;
            }
            if std::fs::remove_file(&p).is_ok() {
                total -= len;
            }
        }
    }
    total
}

#[tauri::command]
pub async fn map_cache_info(app: AppHandle) -> Result<u64, String> {
    let dir = cache_dir(&app).ok_or("No app folder")?;
    Ok(tauri::async_runtime::spawn_blocking(move || prune(&dir, MAX_CACHE_BYTES)).await.unwrap_or(0))
}

#[tauri::command]
pub async fn map_cache_clear(app: AppHandle) -> Result<(), String> {
    if let Some(dir) = cache_dir(&app) {
        let _ = std::fs::remove_dir_all(dir);
    }
    Ok(())
}

#[derive(Serialize)]
pub struct GeoResult {
    pub name: String,
    pub lat: f64,
    pub lon: f64,
}

/// Looks up a place name with OpenStreetMap's Nominatim service (needs the internet).
#[tauri::command]
pub async fn geocode(query: String) -> Result<Vec<GeoResult>, String> {
    let q = query.trim().to_string();
    if q.is_empty() {
        return Ok(vec![]);
    }
    tauri::async_runtime::spawn_blocking(move || {
        let resp = agent()
            .get("https://nominatim.openstreetmap.org/search")
            .query("format", "jsonv2")
            .query("limit", "5")
            .query("q", &q)
            .call()
            .map_err(|e| match e {
                ureq::Error::Status(c, _) => format!("The place search answered with error {c}"),
                _ => "Couldn’t reach the place search — check your internet connection".to_string(),
            })?;
        let v: serde_json::Value = resp.into_json().map_err(|e| e.to_string())?;
        Ok(v.as_array()
            .map(|a| {
                a.iter()
                    .filter_map(|x| {
                        Some(GeoResult {
                            name: x.get("display_name")?.as_str()?.to_string(),
                            lat: x.get("lat")?.as_str()?.parse().ok()?,
                            lon: x.get("lon")?.as_str()?.parse().ok()?,
                        })
                    })
                    .collect()
            })
            .unwrap_or_default())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_upstream_urls_on_every_platform() {
        let enc = "https%3A%2F%2Ftiles.openfreemap.org%2Fplanet%2F1%2F2%2F3.pbf";
        assert_eq!(upstream_from(&format!("tilecache://localhost/{enc}")).unwrap(), "https://tiles.openfreemap.org/planet/1/2/3.pbf");
        assert_eq!(upstream_from(&format!("http://tilecache.localhost/{enc}")).unwrap(), "https://tiles.openfreemap.org/planet/1/2/3.pbf");
        assert!(upstream_from("tilecache://localhost/notaurl").is_none());
    }

    #[test]
    fn blocks_other_hosts_and_serves_from_cache_offline() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(fetch_cached(dir.path(), "https://evil.example.com/x").0, 403);
        // Pretend a tile was cached earlier; it must be served without the network.
        let url = "https://tiles.openfreemap.org/planet/0/0/0.pbf";
        let key = format!("{:016x}", fnv64(url));
        let p = dir.path().join(&key[..2]).join(&key);
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(&p, b"tile").unwrap();
        std::fs::write(p.with_extension("type"), "application/x-protobuf").unwrap();
        let (code, ct, body) = fetch_cached(dir.path(), url);
        assert_eq!((code, ct.as_str(), body.as_slice()), (200, "application/x-protobuf", b"tile".as_slice()));
    }

    #[test]
    fn prune_keeps_cache_under_limit() {
        let dir = tempfile::tempdir().unwrap();
        for i in 0..10 {
            std::fs::write(dir.path().join(format!("{i}")), vec![0u8; 1000]).unwrap();
        }
        let left = prune(dir.path(), 5000);
        assert!(left <= 4500);
    }
}
