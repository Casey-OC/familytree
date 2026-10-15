//! Photos, documents and recordings: copied into the tree's media folder so they
//! stay with the tree, plus a small JPEG thumbnail for pictures.

use std::path::Path;

use serde::Serialize;
use tauri::AppHandle;

use crate::storage::tree_dir;

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MediaImport {
    pub id: String,
    /// Path relative to the tree folder, e.g. `media/<id>.jpg`
    pub file: String,
    pub thumb: Option<String>,
    pub kind: String,
    pub mime: String,
    pub size_bytes: u64,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub original_name: String,
}

pub fn kind_for(ext: &str) -> (&'static str, &'static str) {
    match ext {
        "jpg" | "jpeg" => ("photo", "image/jpeg"),
        "png" => ("photo", "image/png"),
        "gif" => ("photo", "image/gif"),
        "webp" => ("photo", "image/webp"),
        "tif" | "tiff" => ("photo", "image/tiff"),
        "bmp" => ("photo", "image/bmp"),
        "heic" | "heif" => ("photo", "image/heic"),
        "pdf" => ("document", "application/pdf"),
        "txt" => ("document", "text/plain"),
        "doc" | "docx" | "rtf" | "odt" => ("document", "application/octet-stream"),
        "mp3" => ("audio", "audio/mpeg"),
        "m4a" | "aac" => ("audio", "audio/mp4"),
        "wav" => ("audio", "audio/wav"),
        "ogg" | "oga" => ("audio", "audio/ogg"),
        "flac" => ("audio", "audio/flac"),
        _ => ("document", "application/octet-stream"),
    }
}

/// Creates a thumbnail no larger than 480 px on its longest side.
pub fn make_thumbnail(src: &Path, dest: &Path) -> Result<(u32, u32), String> {
    let img = image::ImageReader::open(src)
        .map_err(|e| e.to_string())?
        .with_guessed_format()
        .map_err(|e| e.to_string())?
        .decode()
        .map_err(|e| e.to_string())?;
    let (w, h) = (img.width(), img.height());
    let thumb = img.thumbnail(480, 480).to_rgb8();
    let mut out = std::fs::File::create(dest).map_err(|e| e.to_string())?;
    let mut enc = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, 82);
    enc.encode_image(&thumb).map_err(|e| e.to_string())?;
    Ok((w, h))
}

pub fn import_into(tree_folder: &Path, src: &Path) -> Result<MediaImport, String> {
    if !src.is_file() {
        return Err("That file can't be found".into());
    }
    let original_name = src.file_name().map(|s| s.to_string_lossy().into_owned()).unwrap_or_else(|| "file".into());
    let ext = src
        .extension()
        .map(|e| e.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default();
    let (kind, mime) = kind_for(&ext);
    let id = uuid::Uuid::new_v4().simple().to_string();
    let media = tree_folder.join("media");
    std::fs::create_dir_all(&media).map_err(|e| e.to_string())?;
    let file_name = if ext.is_empty() { id.clone() } else { format!("{id}.{ext}") };
    let dest = media.join(&file_name);
    std::fs::copy(src, &dest).map_err(|e| format!("Couldn't copy the file: {e}"))?;
    let size_bytes = std::fs::metadata(&dest).map(|m| m.len()).unwrap_or(0);

    let mut thumb = None;
    let (mut width, mut height) = (None, None);
    if kind == "photo" && ext != "heic" && ext != "heif" {
        let tname = format!("{id}_thumb.jpg");
        if let Ok((w, h)) = make_thumbnail(&dest, &media.join(&tname)) {
            thumb = Some(format!("media/{tname}"));
            width = Some(w);
            height = Some(h);
        }
    }
    Ok(MediaImport {
        id,
        file: format!("media/{file_name}"),
        thumb,
        kind: kind.into(),
        mime: mime.into(),
        size_bytes,
        width,
        height,
        original_name,
    })
}

#[tauri::command]
pub async fn media_import(app: AppHandle, tree_id: String, src_path: String) -> Result<MediaImport, String> {
    let folder = tree_dir(&app, &tree_id)?;
    import_into(&folder, Path::new(&src_path))
}

/// Removes a media file and its thumbnail from the tree folder.
#[tauri::command]
pub async fn media_remove(app: AppHandle, tree_id: String, file: String) -> Result<(), String> {
    let folder = tree_dir(&app, &tree_id)?;
    if !file.starts_with("media/") || file.contains("..") {
        return Err("Not a media file".into());
    }
    let p = folder.join(&file);
    let _ = std::fs::remove_file(&p);
    if let Some(stem) = p.file_stem() {
        let _ = std::fs::remove_file(folder.join("media").join(format!("{}_thumb.jpg", stem.to_string_lossy())));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn imports_photo_and_makes_thumbnail() {
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("Holiday Photo.PNG");
        let img = image::RgbImage::from_fn(1200, 800, |x, y| image::Rgb([(x % 255) as u8, (y % 255) as u8, 90]));
        img.save_with_format(&src, image::ImageFormat::Png).unwrap();
        let tree = dir.path().join("tree");
        let m = import_into(&tree, &src).unwrap();
        assert_eq!(m.kind, "photo");
        assert_eq!(m.original_name, "Holiday Photo.PNG");
        assert_eq!((m.width, m.height), (Some(1200), Some(800)));
        let thumb = tree.join(m.thumb.unwrap());
        let t = image::open(thumb).unwrap();
        assert_eq!(t.width(), 480);
        assert!(tree.join(&m.file).exists());
    }

    #[test]
    fn audio_has_no_thumbnail() {
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("interview.mp3");
        std::fs::write(&src, b"ID3").unwrap();
        let m = import_into(&dir.path().join("t"), &src).unwrap();
        assert_eq!(m.kind, "audio");
        assert!(m.thumb.is_none());
    }
}
