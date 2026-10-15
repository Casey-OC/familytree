//! "Keep me signed in": the account's data key is kept in the operating system's own
//! secure store (Windows Credential Manager, macOS Keychain), never in a plain file.
//! On systems without one, these calls simply report nothing saved and the person logs in.

const SERVICE: &str = "com.caseyoc.familytree";

fn entry(account: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, account).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn keychain_set(account: String, secret: String) -> Result<bool, String> {
    let e = entry(&account)?;
    if e.set_password(&secret).is_err() {
        return Ok(false);
    }
    // Only report success if it can actually be read back (some systems have no store).
    Ok(matches!(entry(&account)?.get_password(), Ok(s) if s == secret))
}

#[tauri::command]
pub async fn keychain_get(account: String) -> Result<Option<String>, String> {
    Ok(entry(&account)?.get_password().ok())
}

#[tauri::command]
pub async fn keychain_delete(account: String) -> Result<(), String> {
    let _ = entry(&account)?.delete_credential();
    Ok(())
}
