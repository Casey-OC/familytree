# Build status

Updated 15 Oct 2026 (v0.3.0).

## Done

**Phase 1: foundation and offline tree (desktop)**: complete.
- Tauri 2 + React + TypeScript + Vite. One codebase; `src-tauri/src/lib.rs` has the mobile entry point ready for Phase 4.
- Theme system: 10 themes × light/dark, compact density, saved in `prefs.json`.
- Local data: one SQLite file per tree at `<app data>/trees/<id>/tree.db`, media in `…/media/`. Schema in `src/data/schema.ts`; every change is written immediately (`commit()` in `src/data/store.ts`).
- Sample tree (`src/lib/sample.ts`), Tree (family / pedigree / descendants, pan, zoom, pinch), People, Person profile, Sources and citations, Media (real files, thumbnails, face tagging, profile photos), Search, Research (tasks, unverified list, hints from a sample provider), GEDCOM 5.5.1 import (preview, problems, merge with duplicate matching, or new tree) and export (living excluded), local backups (scheduled, manual, restore, copy to a folder), native menus, keyboard shortcuts.
- Release workflow builds Windows (.exe/.msi), macOS (universal .dmg) and Linux installers into a draft GitHub Release.

**Phase 2: charts, map and polish**: complete (v0.3.0).
- Fan / pedigree / descendant charts with colour modes and print; family history book as a real PDF via the system print dialog.
- Map with pins, migration arrows and the timeline: detailed MapLibre map (OpenFreeMap tiles through the `tilecache://` protocol, cached in `<app data>/tilecache`, 400 MB cap) with the stylised offline map as fallback. "Find on map" uses OpenStreetMap Nominatim.
- App password lock (PBKDF2 verifier in prefs, password only in memory) and per-tree SQLCipher encryption with the app password; backups stay encrypted; change/remove password re-keys or decrypts every file.
- Accessibility: axe scan clean on every screen, contrast checked for all themes, keyboard tree navigation, skip link, reduced motion.
- Auto-updater: not done. Casey chose manual installs, because the repo is private and private repos can't serve updates.

## Next

Phase 3: Supabase project (Casey to create), accounts, invites, Family Wall, moderation, life-event approval, offline post queue, online sync with the conflict screen, cloud backup, `HintProvider` integrations (decision needed: FamilySearch developer key).

## Decisions still open for Casey

- App name (placeholder "Family Tree")
- Code signing: Apple Developer Program, Windows certificate
- Real record-hint providers (FamilySearch needs an approved developer key; Ancestry has no public API)
- Phase 4 phone scope: full app or companion

## How to run

- `npm install`, then `npm run tauri dev` (desktop) or `npm run dev` (browser preview with an in-memory database)
- `npm test` (interface logic) and `cd src-tauri && cargo test` (native side)
- Installers: Actions → "Build installers" → Run workflow, or push a tag `v*`
