# CLAUDE.md — Family Tree app

You are building a family tree app for Windows, macOS, Android and iOS from this repo.
The owner, Casey, is **not a developer**. Casey writes the product requirements and tests the builds; you write all of the code.

## Read first
1. `docs/HANDOVER.md` — the full build spec: what to build, the stack, the data model, the phases and the definition of done.
2. `docs/prototype/Main.dc.html` — the approved clickable design prototype. It is the **visual and behavioural source of truth**: layout, copy, colours, the 10 themes, the sample data and how every flow behaves. It is a design-tool file, not production code. Read its CSS, markup and the `class Component` script for reference, and rebuild it properly in the real stack. Don't copy it in wholesale.

## How to work with Casey
- Explain what you did in plain English, with no jargon, in one short paragraph per change.
- Work in phases (see HANDOVER §9). Finish and demo one phase before starting the next.
- Use small pull requests, one feature each, with a checklist in the PR description of what Casey should click to test it.
- When a decision is Casey's (anything marked **DECISION** in the handover), ask before building it. Otherwise pick a sensible default and say which one you picked.
- Never commit secrets. Keys and certificates go in GitHub Actions secrets, and you tell Casey exactly which ones to add and where.
- After every merge to `main`, keep the app runnable and keep the installers building.

## Commands (once scaffolded)
- `npm install` — install dependencies
- `npm run tauri dev` — run the desktop app locally
- `npm test` — unit tests
- `npm run tauri build` — local installer build
- Release installers: push a tag like `v0.1.0` and GitHub Actions builds the Windows, macOS and Linux installers into a draft GitHub Release (`.github/workflows/release.yml`).

## Non-negotiables
- The family tree works **fully offline**. Only the Family Wall, record hints, online sync and cloud backup need the internet.
- Living people are private by default, and sharing is always opt-in.
- Every fact can show its sources. Confidence is Proven, Probable or Unverified, and it is never shown by colour alone.
- Accessibility: minimum 15px body text, strong contrast, large click and tap targets, and the app is keyboard friendly.
