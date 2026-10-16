# Build status

Updated 16 Oct 2026 (v0.8.0).

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

**Accounts and sign-up**: complete (v0.4.0).
- Sign up, log in, "Keep me signed in" (data key in Windows Credential Manager / macOS Keychain), forgot password with a 24-character recovery code shown once at sign-up.
- Sign-up asks "About you" and creates the tree automatically, named after your surname, with you as the home person. Your own birth and where you live now are marked Proven, cited to a "Personal knowledge" source.
- Each account has a random data key (`src/lib/accounts.ts`) wrapped by the password and by the recovery code (PBKDF2 + AES-GCM). New trees are SQLCipher-encrypted with it. Changing the password re-wraps the key only. v0.3 app-password trees are migrated at first sign-up.
- Accounts are local for now; the same email/password become the online account once Supabase is connected.
- Calendar date picker on every date field (`src/components/DateInput.tsx`); partial dates ("1890", "Aug 1885") can still be typed.
- "New tree" removed; "Import a GEDCOM file as a new tree" and "Explore the sample tree" are in the tree menu.

**Profile pages and one profile per person**: complete (v0.5.0).
- Full profile page per person (`src/features/profile/ProfilePage.tsx`): cover photo, profile photo, About, Photos, Family, Life story, Sources.
- Profile photo framing (`src/lib/photoFrame.ts`): cover-fit at the right shape, centred on the face tag, with a saved per-person crop from "Adjust profile photo".
- Photo tags: `media_tag` table (pending / shown / hidden, tagged by). Tags of another account holder wait for their approval. Any photo can be hidden from a profile.
- Visibility (Casey's decision): close family (parents, children, siblings, partners, grandparents, grandchildren) see your profile; distant relatives need an invite. `src/lib/profile.ts`. Enforced online when the Family Wall arrives.
- Duplicates (Casey's decision): living people with accounts are never duplicated; other duplicates must be merged into one profile. `src/lib/merge.ts`: finder (names, nicknames, years, places, parents, partners), merge (facts combined with all sources, photos, links, tasks, hints; backup first), "different people" memory, add-person warning. Each person has a permanent `profile_id`; merged IDs are mapped in the `merged_profiles` setting for cross-tree merging online.
- Database schema v2 (migrates v0.4 trees automatically, including encrypted ones).

**Life stories, timeline and tree polish**: complete (v0.6.0).
- Life stories (`src/features/profile/Stories.tsx`, `src/lib/stories.ts`): stories with date, place, linked event, people and photos; shown on every subject's profile and woven into their Timeline; others' stories about an account holder wait for approval. Tables `story`, `story_person`, `story_media`.
- "Life story" tab renamed "Timeline". Ages on events (`src/lib/ages.ts`).
- Birth/Death "home at the time" (`fact.home_place_id`): profile, timeline, map, GEDCOM (as RESI), sign-up.
- Tree cards show profile photos, blue (male) / pink (female) with the M/F mark kept; charts default to the same colours.
- Casey's decision: gender options are Male and Female only ('U' remains internally for imported records with no sex).
- Database schema v3.

**Phase 3a: Family Wall**: built (v0.7.0); goes live once Supabase is set up.
- Supabase schema + RLS in `supabase/migrations/0001_family_wall.sql`; 39 privacy checks in `supabase/tests/run_tests.py` (local PostgreSQL with an auth/storage stand-in). Setup steps in `supabase/README.md`.
- App: `src/wall/` (types, Supabase backend, demo backend for the sample tree, offline cache + send queue in IndexedDB, store) and `src/features/wall/` (feed, composer, members, moderation, My wall settings, connect, invite and welcome/opt-in windows).
- Invites are matched on the invitee's confirmed email; the invitation email is sent from the owner's own email program (no server email needed).
- Approved life events become Probable facts cited to a "Family Wall post" source.
- Builds read `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` GitHub secrets.

**Family titles, story dates, private messages**: built (v0.8.0).
- Family titles (`src/lib/kinship.ts`): closest-shared-ancestor calculator for blood relations (great-/half-/Nth cousin X removed), partners, in-laws, step relations, and "Father of your daughter-in-law" one step out; relative to you or the home person. Shown on tree cards, panel, profile, People, wall members, messages.
- Life stories: date qualifiers and "at N years old" (`dateFromAge`, `storyWhen` in `src/lib/stories.ts`); database v4.
- Private messages: `supabase/migrations/0002_private_messages.sql` (participants-only RLS; contacts = people sharing a wall), `src/messages/` (Supabase + demo backends, store with offline queue), `src/features/messages/MessagesPage.tsx`. 55 privacy checks in total.

## Next

Phase 3 (rest): live test of the wall on Casey's Supabase project, relatives browsing shared parts of the tree, cross-tree profile linking and merging, online tag and story approval, online sync with the conflict screen, cloud backup, `HintProvider` integrations (decision needed: FamilySearch developer key).

## Decisions still open for Casey

- App name (placeholder "Family Tree")
- Code signing: Apple Developer Program, Windows certificate
- Real record-hint providers (FamilySearch needs an approved developer key; Ancestry has no public API)
- Phase 4 phone scope: full app or companion

## How to run

- `npm install`, then `npm run tauri dev` (desktop) or `npm run dev` (browser preview with an in-memory database)
- `npm test` (interface logic) and `cd src-tauri && cargo test` (native side)
- Installers: Actions → "Build installers" → Run workflow, or push a tag `v*`
