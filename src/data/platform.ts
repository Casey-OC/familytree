// Everything that touches the computer: files, dialogs, menus, preferences, backups.
// In the real app these go through Tauri. When the interface runs in a plain browser
// (development preview only) they fall back to in-memory stand-ins.

import type { Db } from './db';
import type { MediaKind } from '../lib/types';

export const isTauri = (): boolean => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export interface OpenedTree {
  id: string;
  db: Db;
  isNew: boolean;
}

export interface ImportedFile {
  id: string;
  file: string;
  thumb: string;
  kind: MediaKind;
  mime: string;
  sizeBytes: number;
  originalName: string;
}

export interface BackupInfo {
  file: string;
  created: string; // local time ISO without zone
  sizeBytes: number;
  reason: string;
}

export interface PickedFile {
  path?: string; // real path (desktop)
  file?: File; // browser preview
  name: string;
}

// ---------- shared state ----------
let treeFolder = ''; // absolute folder of the open tree (desktop)
let sep = '/';
const blobUrls = new Map<string, string>(); // browser preview: relative path → object URL
const memDbs = new Map<string, Db>();
const memBackups = new Map<string, { info: BackupInfo; bytes: Uint8Array }[]>();

async function tauriCore() {
  return import('@tauri-apps/api/core');
}

// ---------- trees ----------
export async function openTreeDb(id: string): Promise<OpenedTree> {
  if (isTauri()) {
    const { invoke } = await tauriCore();
    const info = await invoke<{ id: string; path: string; mediaDir: string; isNew: boolean }>('tree_open', { id });
    sep = info.path.includes('\\') ? '\\' : '/';
    treeFolder = info.path.slice(0, info.path.lastIndexOf(sep));
    const { TauriDb } = await import('./tauriDb');
    return { id, db: new TauriDb(), isNew: info.isNew };
  }
  const existing = memDbs.get(id);
  if (existing) return { id, db: existing, isNew: false };
  const { newSqlJsDb } = await import('./sqljsDb');
  const wasmUrl = (await import('sql.js/dist/sql-wasm.wasm?url')).default;
  const db = await newSqlJsDb(() => wasmUrl);
  memDbs.set(id, db);
  return { id, db, isNew: true };
}

export async function closeTreeDb(): Promise<void> {
  if (isTauri()) {
    const { invoke } = await tauriCore();
    await invoke('tree_close');
  }
}

export async function deleteTree(id: string): Promise<void> {
  if (isTauri()) {
    const { invoke } = await tauriCore();
    await invoke('tree_delete', { id });
  } else memDbs.delete(id);
}

// ---------- preferences ----------
const PREFS_KEY = 'familytree.prefs';

export async function readPrefs(): Promise<Record<string, unknown>> {
  try {
    if (isTauri()) {
      const { invoke } = await tauriCore();
      return JSON.parse(await invoke<string>('prefs_read'));
    }
    return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
  } catch {
    return {};
  }
}

export async function writePrefs(p: Record<string, unknown>): Promise<void> {
  try {
    if (isTauri()) {
      const { invoke } = await tauriCore();
      await invoke('prefs_write', { json: JSON.stringify(p) });
    } else localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* preferences are a convenience; never block the app */
  }
}

// ---------- files ----------
export async function pickFile(opts: { title: string; filters: { name: string; extensions: string[] }[] }): Promise<PickedFile | null> {
  if (isTauri()) {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const path = await open({ title: opts.title, multiple: false, directory: false, filters: opts.filters });
    if (!path || Array.isArray(path)) return null;
    return { path, name: path.split(/[\\/]/).pop() || path };
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = opts.filters.flatMap((f) => f.extensions.map((e) => '.' + e)).join(',');
    input.onchange = () => {
      const f = input.files?.[0];
      resolve(f ? { file: f, name: f.name } : null);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export async function pickFolder(title: string): Promise<string | null> {
  if (!isTauri()) return null;
  const { open } = await import('@tauri-apps/plugin-dialog');
  const path = await open({ title, directory: true, multiple: false });
  return typeof path === 'string' ? path : null;
}

export async function readPickedBytes(f: PickedFile): Promise<Uint8Array> {
  if (f.file) return new Uint8Array(await f.file.arrayBuffer());
  const { invoke } = await tauriCore();
  const buf = await invoke<ArrayBuffer>('file_read_bytes', { path: f.path });
  return new Uint8Array(buf);
}

/** Asks where to save, then writes the text. Returns the saved name, or null if cancelled. */
export async function saveTextFile(defaultName: string, contents: string, filters: { name: string; extensions: string[] }[]): Promise<string | null> {
  if (isTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const path = await save({ defaultPath: defaultName, filters });
    if (!path) return null;
    const { invoke } = await tauriCore();
    await invoke('file_write_text', { path, contents });
    return path.split(/[\\/]/).pop() || path;
  }
  const blob = new Blob([contents], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = defaultName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return defaultName;
}

const MEDIA_EXT: Record<string, [MediaKind, string]> = {
  jpg: ['photo', 'image/jpeg'], jpeg: ['photo', 'image/jpeg'], png: ['photo', 'image/png'], gif: ['photo', 'image/gif'], webp: ['photo', 'image/webp'],
  tif: ['photo', 'image/tiff'], tiff: ['photo', 'image/tiff'], bmp: ['photo', 'image/bmp'], heic: ['photo', 'image/heic'],
  pdf: ['document', 'application/pdf'], txt: ['document', 'text/plain'],
  mp3: ['audio', 'audio/mpeg'], m4a: ['audio', 'audio/mp4'], aac: ['audio', 'audio/mp4'], wav: ['audio', 'audio/wav'], ogg: ['audio', 'audio/ogg'], flac: ['audio', 'audio/flac'],
};

export const MEDIA_FILTERS = [
  { name: 'Photos, documents and audio', extensions: Object.keys(MEDIA_EXT) },
  { name: 'Photos', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'tif', 'tiff', 'bmp', 'heic'] },
  { name: 'Documents', extensions: ['pdf', 'txt'] },
  { name: 'Audio', extensions: ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'flac'] },
];

/** Copies a picked file into the tree's media folder (desktop) and makes a thumbnail. */
export async function importMediaFile(treeId: string, f: PickedFile): Promise<ImportedFile> {
  if (isTauri() && f.path) {
    const { invoke } = await tauriCore();
    const r = await invoke<{ id: string; file: string; thumb: string | null; kind: MediaKind; mime: string; sizeBytes: number; originalName: string }>('media_import', {
      treeId,
      srcPath: f.path,
    });
    return { ...r, thumb: r.thumb || '' };
  }
  const file = f.file!;
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const [kind, mime] = MEDIA_EXT[ext] || ['document', file.type || 'application/octet-stream'];
  const id = crypto.randomUUID().replace(/-/g, '');
  const rel = `media/${id}.${ext}`;
  blobUrls.set(rel, URL.createObjectURL(file));
  return { id, file: rel, thumb: '', kind, mime, sizeBytes: file.size, originalName: file.name };
}

export async function removeMediaFile(treeId: string, file: string): Promise<void> {
  if (!file) return;
  if (isTauri()) {
    const { invoke } = await tauriCore();
    await invoke('media_remove', { treeId, file });
  } else blobUrls.delete(file);
}

let convert: ((p: string) => string) | null = null;
if (isTauri()) tauriCore().then((m) => (convert = m.convertFileSrc));

/** A URL the webview can show for a media file stored with the tree. */
export function mediaUrl(rel: string): string {
  if (!rel) return '';
  if (!isTauri()) return blobUrls.get(rel) || '';
  if (!convert || !treeFolder) return '';
  return convert(treeFolder + sep + rel.split('/').join(sep));
}

export async function openMediaExternally(rel: string): Promise<void> {
  if (!rel) return;
  if (isTauri()) {
    const { openPath } = await import('@tauri-apps/plugin-opener');
    await openPath(treeFolder + sep + rel.split('/').join(sep));
  } else window.open(mediaUrl(rel), '_blank');
}

export async function openUrl(url: string): Promise<void> {
  if (isTauri()) {
    const { openUrl: o } = await import('@tauri-apps/plugin-opener');
    await o(url);
  } else window.open(url, '_blank', 'noopener');
}

export async function revealDataFolder(): Promise<string> {
  if (!isTauri()) return 'In the browser preview, trees live in memory only.';
  const { invoke } = await tauriCore();
  const p = await invoke<{ appData: string; trees: string }>('paths_info');
  try {
    const { revealItemInDir } = await import('@tauri-apps/plugin-opener');
    await revealItemInDir(p.trees);
  } catch {
    /* showing the path in the message is enough */
  }
  return p.trees;
}

// ---------- backups ----------
export async function backupNow(treeId: string, reason: 'manual' | 'auto' | 'close' | 'before-import'): Promise<BackupInfo> {
  if (isTauri()) {
    const { invoke } = await tauriCore();
    return invoke<BackupInfo>('backup_now', { treeId, reason });
  }
  const db = memDbs.get(treeId) as unknown as { raw: { export(): Uint8Array } } | undefined;
  const bytes = db ? db.raw.export() : new Uint8Array();
  const now = new Date();
  const pad = (x: number) => String(x).padStart(2, '0');
  const created = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const info: BackupInfo = { file: created + '_' + reason + '.db', created, sizeBytes: bytes.length, reason };
  const list = memBackups.get(treeId) || [];
  list.unshift({ info, bytes });
  memBackups.set(treeId, list);
  return info;
}

export async function listBackups(treeId: string): Promise<BackupInfo[]> {
  if (isTauri()) {
    const { invoke } = await tauriCore();
    return invoke<BackupInfo[]>('backup_list', { treeId });
  }
  return (memBackups.get(treeId) || []).map((b) => b.info);
}

export async function restoreBackup(treeId: string, file: string): Promise<void> {
  if (isTauri()) {
    const { invoke } = await tauriCore();
    await invoke('backup_restore', { treeId, file });
    return;
  }
  const b = (memBackups.get(treeId) || []).find((x) => x.info.file === file);
  if (!b) throw new Error('That backup no longer exists');
  const initSqlJs = (await import('sql.js')).default;
  const wasmUrl = (await import('sql.js/dist/sql-wasm.wasm?url')).default;
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const { SqlJsDb } = await import('./sqljsDb');
  memDbs.set(treeId, new SqlJsDb(new SQL.Database(b.bytes)));
}

export async function exportBackupToFolder(treeId: string, folderName: string): Promise<string | null> {
  const dest = await pickFolder('Choose where to save a copy of your tree');
  if (!dest) return null;
  const { invoke } = await tauriCore();
  return invoke<string>('backup_export', { treeId, destDir: dest, folderName });
}

// ---------- window ----------
export async function setWindowTitle(title: string): Promise<void> {
  document.title = title;
  if (!isTauri()) return;
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().setTitle(title);
  } catch {
    /* not critical */
  }
}

export async function onMenu(handler: (id: string) => void): Promise<() => void> {
  if (!isTauri()) return () => {};
  const { listen } = await import('@tauri-apps/api/event');
  return listen<string>('menu', (e) => handler(e.payload));
}

export async function onCloseRequested(handler: () => Promise<void>): Promise<() => void> {
  if (!isTauri()) return () => {};
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const win = getCurrentWindow();
  return win.onCloseRequested(async (event) => {
    event.preventDefault();
    try {
      await handler();
    } finally {
      await win.destroy();
    }
  });
}

export function newId(): string {
  return crypto.randomUUID();
}
