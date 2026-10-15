# Family Tree app — Build handover

Owner: Casey · Repo: `Casey-OC/familytree` (private) · Written 15 Oct 2026

This document tells Claude Code how to turn the approved prototype into a real, installable app.
The design is already agreed in `docs/prototype/Main.dc.html`, so build to match it.

---

## 1. What we're building

A genealogy workspace for families, combining:
- **The tree:** people, relationships, facts with evidence, sources and citations, media, map and migration, charts and reports, research tasks and record hints, plus GEDCOM import and export. This part works **fully offline**.
- **The Family Wall:** a private, Facebook-style feed for invited living relatives (posts, photos, life events, comments, reactions). It needs the internet and an account.

Platforms: **Windows, macOS** (desktop installers) first, then **Android and iOS**.

Two kinds of user:
| User | Needs |
|---|---|
| Tree owner (researcher) | Fast, dense data entry, evidence on every fact, full control |
| Invited relative | Simple screens, and clear control over what they share about themselves |

---

## 2. Tech stack (recommended — use unless there is a strong reason not to)

| Layer | Choice | Why |
|---|---|---|
| App shell | **Tauri 2** | One codebase builds Windows, macOS, Linux, Android and iOS. Small installers. Native file access. |
| UI | **React + TypeScript + Vite** | The prototype maps cleanly onto components |
| Styling | CSS variables / design tokens lifted from the prototype | Themes become token sets |
| Local database | **SQLite**, encrypted at rest (SQLCipher via `rusqlite` with the `bundled-sqlcipher` feature, or equivalent) | Offline-first, with the brief's "encryption on/off" |
| Local media | Files in the app data folder, referenced from SQLite | Photos, scans and audio stay on the device |
| Cloud service | **Supabase** (Postgres, Auth, Storage, Realtime, row-level security) | Family Wall, invites, sync and cloud backup |
| Maps | MapLibre GL with a free vector tile source, cached for offline use | Pins, migration arrows and a timeline |
| Charts | Custom SVG (as in the prototype) | Fan, pedigree and descendant charts must match the design |
| PDF | Generate in-app (for example `pdf-lib`, or HTML to PDF via the webview's print) | "Family history book" export |
| GEDCOM | Parser and writer for GEDCOM 5.5.1 (an existing npm parser is fine, wrapped with tests) | Import preview, merge, and export with living people excluded |
| Tests | Vitest (UI and logic) and `cargo test` (Rust) | |

If you deviate from this stack, explain why to Casey before doing it.

---

## 3. Design source of truth

`docs/prototype/Main.dc.html` contains, in one file:
- **CSS (`<helmet><style>`):** all colour tokens, light and dark mode, compact density, and the **10 colour themes** (`.th-heritage`, `.th-ink`, `.th-euc`, `.th-ochre`, `.th-reef`, `.th-jac`, `.th-rose`, `.th-slate`, `.th-harbour`, `.th-sepia`, plus `.app.dark.th-*` overrides and the `--deco` decorative band).
- **Markup (`<x-dc>`):** every screen's layout and copy. `{{ }}` holes and `<sc-if>`/`<sc-for>` are template syntax: read them as React conditionals and loops.
- **Logic (`class Component`):** sample data (`sample()`), confidence rules (`confOf`), tree layout (`layDesc`, `layPed`), fan, pedigree and descendant chart geometry (`vmCharts`), map and migration (`vmMap`), GEDCOM export (`gedText`), hint accept (`acceptHint`), life-event approval (`approveLife`) and offline queueing.

Port the behaviour faithfully. Where the prototype fakes something (marked "mock" or "simulated"), build the real thing (§7).

Fonts: **Literata** (names and headings) and **Atkinson Hyperlegible** (UI and data). Bundle them locally; don't rely on Google Fonts at runtime, because the app must work offline.

---

## 4. App structure

Three-part desktop layout: a left sidebar, the main area, and a right detail panel (slides in, can be pinned, Esc closes it).
- **Top bar:** tree switcher, global search (grouped People / Places / Sources / Media; Ctrl/⌘ K), Add person, online/sync status, notifications, profile menu (view-as preview, colour theme, light/dark, density).
- **Sidebar order:** Home, Tree, People, Family Wall, Sources, Media, Map, Charts and Reports, Research, Settings.
- **First run:** Start a new tree / Import a GEDCOM file / Open sample tree.
- **One person, one place:** clicking any name anywhere opens the same person profile panel.

Mobile (Phase 4) uses the same features with phone layouts: a bottom tab bar instead of the sidebar, and full-screen sheets instead of the right panel.

---

## 5. Data model

### Local SQLite (per tree file)
| Table | Key fields | Notes |
|---|---|---|
| `person` | id (uuid), given_names, surname (at birth), sex (M/F/X/U), living, photo_media_id, privacy, notes, updated_at | |
| `relationship` | id, type (`parent` / `spouse` / `sibling`), person_a, person_b, start_date, end_date | For `parent`, a = parent and b = child |
| `fact` | id, person_id, type, date_text, date_qualifier (exact/about/before/after/between), date2_text, sort_year, place_id, description, confidence_override (null = automatic) | |
| `source` | id, title, type, repository, url | |
| `citation` | id, source_id, page, date_accessed, quality (Primary/Secondary/Questionable), extract | |
| `fact_citation` | fact_id, citation_id | many-to-many |
| `media` | id, kind (photo/document/audio), file_path, title, date_text, place_id, description, duration_s | |
| `media_face` | media_id, person_id, x_pct, y_pct | face tags |
| `media_person` / `media_source` | links | |
| `place` | id, name, historical_name, lat, lon | |
| `hint` | id, provider, collection, person_id, score, status (pending/later/accepted/rejected), record_json, proposals_json | |
| `task` | id, title, person_id, fact_id, status (To do/In progress/Done), priority, notes | |
| `settings` | key, value | theme, dark, density, backup schedule, privacy defaults |
| `sync_log` | change tracking for online sync | |

**Confidence rule** (automatic, matching the prototype's `confOf`):
- no citations → **Unverified**
- an exact date and at least one Primary citation → **Proven**
- otherwise → **Probable**
- a manual override wins.

### Cloud (Supabase)
| Table | Purpose |
|---|---|
| `profiles` | one per signed-in user |
| `trees` | owner_id, name |
| `wall_members` | tree_id, person_id (local id), user_id, email, permissions (view, post, photos, suggest), opt-ins (status, photos, birthday, location, contact; **all false by default**), status (pending/accepted/left/removed) |
| `posts` | tree_id, author_member_id, type (text/photo/life), text, media path, life_event json, life_status (pending/approved/declined), tagged person ids, created_at, removed |
| `comments`, `reactions`, `hidden_posts` | |
| `shared_people` | the minimum person data a member may see. Deceased people are shared freely; living people only as their opt-ins allow. |

Row-level security is required: members can only read their own tree's wall, and only the owner can moderate, remove members or approve life events.

---

## 6. Features and acceptance checklist

Build every screen in the prototype. The release is done when someone can complete all of these without hitting a dead end:

- [ ] Add a new child to a couple on the tree; they appear on the tree, in People, and in the parents' Relationships tab.
- [ ] Edit a birth date to "about 1890" and attach a citation from an existing source; the fact turns from Unverified to Probable.
- [ ] Accept a record hint; the new facts and citation appear on the person's profile.
- [ ] Open the Map, pick the emigrant couple's line and play the migration timeline from 1880 to today.
- [ ] Generate a 5-generation fan chart from any person and switch the colour mode.
- [ ] Upload a **real** photo, tag two people's faces, and see it on both of their profiles.
- [ ] Create a research task from an unverified fact and mark it Done.
- [ ] Invite a living relative **by real email**, accept on a second account with opt-ins, and post a life event on the Family Wall.
- [ ] Approve that life event as a tree fact from the owner's moderation view.
- [ ] Import a **real** GEDCOM file with preview, merge or new tree; export a GEDCOM with living people excluded.
- [ ] Search "Cairns" and get grouped results for people, places and sources.
- [ ] Every name anywhere opens the same person profile.
- [ ] Switch between all 10 colour themes in light and dark mode; the choice persists after restart.
- [ ] Turn off the internet: the tree keeps working, the wall shows cached posts, and new posts queue and send on reconnect.

Ship the sample tree (the Pascoes, Cornwall to Queensland 1885) as **"Open sample tree"**. Port it from `sample()` in the prototype.

---

## 7. Replace the prototype's mocks

| Prototype mock | Real implementation |
|---|---|
| In-memory data | Encrypted SQLite file per tree, with autosave |
| "Choose file (mock)" uploads | Native file picker; copy into the app media folder; generate thumbnails |
| Fake record hints | Phase 3: provider integrations behind an interface. **DECISION:** Ancestry has no open public API, and FamilySearch requires an approved developer key. Build the hint queue against a `HintProvider` interface with a sample provider first, and ask Casey before integrating real providers. |
| Simulated invites and acceptance | Supabase Auth email invites, deep link into the app, and the welcome then opt-in flow from the prototype |
| Simulated sync and conflicts | Change log and a merge flow with the "changed on both sides, keep which?" screen |
| Cloud backup toggle | Encrypted upload of the tree file to Supabase Storage; restore list |
| PDF export mock | Real PDF generation of the family history book and charts |
| Stylised map | MapLibre with real tiles, cached for offline use, with the same pins, arrows and timeline slider |
| "Preview as relative" | Keep it: render with the member's permissions applied |
| Window-style toggle | Remove it. Use native window chrome on each OS (macOS traffic lights and system menu bar; Windows title bar controls and in-window menu). |

---

## 8. Installers and releases (GitHub Actions)

`.github/workflows/release.yml` is included. Pushing a tag `v*` builds:
- **Windows:** `.msi` and `.exe` (NSIS)
- **macOS:** `.dmg` for Apple Silicon and Intel
- **Linux:** `.AppImage` / `.deb` (free extra)

They are uploaded to a **draft GitHub Release** for Casey to download and test.

**Code signing (DECISION — needs Casey to buy or enrol):**
- **macOS:** Apple Developer Program membership, a Developer ID certificate and notarisation. Without these, macOS warns that the app is from an unidentified developer.
- **Windows:** a code-signing certificate. Without one, SmartScreen shows a warning.

Until signing is set up, build unsigned installers and tell Casey how to open them. When ready, add the certificate secrets listed in the Tauri signing docs to GitHub → Settings → Secrets and variables → Actions.

**Auto-update:** use the Tauri updater plugin with update artifacts on GitHub Releases (Phase 2).

**Mobile (Phase 4):** Tauri Android (`.aab` for Google Play) and iOS (TestFlight then the App Store). This needs a Google Play developer account and an Apple Developer account. Apple reviews social features, so it requires reporting and blocking of posts and a privacy policy.

---

## 9. Phases

1. **Foundation and offline tree (desktop).** Scaffold Tauri, React and TypeScript; the theme system (all 10 themes, light and dark, density); the shell layout; local SQLite; sample tree; Tree (pan, zoom, family, pedigree and descendant views, add relatives); People; Person profile (facts with evidence, relationships, notes, media); Sources and citations; Media with real files and face tagging; Search; Research tasks and the unverified list; GEDCOM import and export; local backups; release workflow producing installers. **Demo to Casey.**
2. **Charts, map and polish.** Fan, pedigree and descendant charts; the family history book with real PDF output; the map with migration timeline; app password lock and encryption toggle; auto-updater; accessibility pass (keyboard navigation, screen reader labels, contrast in every theme).
3. **Cloud: Family Wall and sync.** Supabase project; accounts; invites, acceptance and opt-ins; the wall (composer, feed, filters, reactions, comments, tagging); moderation; life-event approval into the tree; offline caching and post queue; online tree sync with the conflict screen; cloud backup; hints provider interface.
4. **Mobile.** Android and iOS builds with phone layouts. **DECISION for Casey:** a full app on the phone, or a **companion** (Family Wall, browsing the tree and profiles, camera photo upload and tagging, quick edits; GEDCOM, the book builder, chart printing and hint review stay on desktop). If Casey hasn't decided, build the companion scope first, structured so the remaining screens can be added later.

---

## 10. Things Casey must provide or set up (tell Casey when each is needed)

- [ ] **App name** (the prototype uses the placeholder "Family Tree")
- [ ] Supabase account and project (Phase 3), with keys added as GitHub secrets
- [ ] Apple Developer Program (macOS signing in Phase 1–2, iOS in Phase 4)
- [ ] Windows code-signing certificate (optional at first)
- [ ] Google Play developer account (Phase 4)
- [ ] Privacy policy and terms (required before the Family Wall goes live and for the app stores)
- [ ] Decisions marked **DECISION** above
