# Build status

Updated 15 Oct 2026.

## Done

**Phase 1: foundation and offline tree (desktop)**: complete.
- Tauri 2 + React + TypeScript + Vite. One codebase; `src-tauri/src/lib.rs` has the mobile entry point ready for Phase 4.
- Theme system: 10 themes × light/dark, compact density, saved in `prefs.json`.
- Local data: one SQLite file per tree at `<app data>/trees/<id>/tree.db`, media in `…/media/`. Schema in `src/data/schema.ts`; every change is written immediately (`commit()` in `src/data/store.ts`).
- Sample tree (`src/lib/sample.ts`), Tree (family / pedigree / descendants, pan, zoom, pinch), People, Person profile, Sources and citations, Media (real files, thumbnails, face tagging, profile photos), Search, Research (tasks, unverified list, hints from a sample provider), GEDCOM 5.5.1 import (preview, problems, merge with duplicate matching, or new tree) and export (living excluded), local backups (scheduled, manual, restore, copy to a folder), native menus, keyboard shortcuts.
- Release workflow builds Windows (.exe/.msi), macOS (universal .dmg) and Linux installers into a draft GitHub Release.

**Phase 2: charts, map and polish**: partly done.
- Done: fan / pedigree / descendant charts with colour modes and print, family history book exported as a real PDF through the system print dialog, map with pins, migration arrows and the timeline (stylised offline map from the prototype).
- To do: app password lock and SQLCipher encryption toggle, auto-updater (needs an updater signing key in GitHub secrets), accessibility pass, MapLibre detailed tiles with offline caching.

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
