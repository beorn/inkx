---
id: "@km/silvery/docs-reorg"
aliases:
  - km-silvery.docs-reorg
  - km-silvery-docs-reorg
created_by: claude:491faf6c
created_at: 2026-03-25T18:22:11Z
owner: bjorn@stabell.org
---

# [ ] silvery.dev docs reorganization — fix duplication, narrative flow, and information architecture @km/silvery #task #P1

## Problem

silvery.dev and the GitHub README leak unpublished TEA/era2b APIs, have duplicated content, broken examples, and no coherent reader journey.

### FTUE Broken
A first-time user sees this flow:
1. **GitHub README** → mentions `createApp` (not shipped), lists `@silvery/create` as a package
2. **silvery.dev homepage** → "Gradually sip TEA" feature card, `@silvery/create` in packages table
3. **Quick Start** → actually clean (era2a only)
4. **Migrate from Ink** → wrong API (`await render()` instead of `render().run()`), no `silvery/ink` compat path, references TEA plugins at bottom
5. **Guides** → state-management.md documents entire TEA API behind a weak "Coming Soon" warning
6. **Building Apps** → terminal-apps.md Levels 3-5 document commands/signals/plugins

The reader's impression: "this framework is half-built and confused about what it ships."

### Specific Issues
- **Duplication**: 2 migrate-from-ink guides, 2 getting-started docs, component/hook refs in 3 places
- **TEA leakage**: 3 files entirely era2b, 7+ files with significant TEA references that look shipped
- **Stale content**: migrate-from-ink.md has wrong render() API, missing silvery/ink path
- **Confused hierarchy**: 7 sidebar sections from 4 directories, 30+ orphaned files not in sidebar
- **87 files, ~21K lines** — but no clear progression from "hello world" to "production app"

## Design Principles

1. **Era2a only** — silvery.dev ships the renderer story. TEA is "coming soon" with zero API docs
2. **FTUE-first** — README → homepage → quick start must be a seamless 60-second path to "I built something"
3. **Meet readers where they are** — newcomer, Ink migrator, production builder each get their own entry
4. **Progressive disclosure** — quick start → guides → deep dives → reference. Don't show runtime-layers.md to someone building a counter
5. **One home per concept** — zero duplication. Cross-reference, never copy
6. **Showcase the wins** — layout feedback, incremental rendering, scrollable containers, 30+ components, testing — these are shipped and excellent
7. **Maps to architecture** — components (ag-react) → runtime (ag-term) → reference. No composition layer docs until TEA ships

## Phase 1: Fix FTUE (do first — highest impact)

### README.md
- Remove `createApp` mention from "Extremely composable" bullet. Replace with: "Use as just a renderer (`render`), add a runtime (`run`), or build full apps with any React state library"
- Remove `@silvery/create` from packages table (it's not shipped for users yet)
- Keep it in "Coming" section where it already is

### Homepage (docs/index.md)
- **"Flexible Rendering" feature card**: Remove TEA mention. Change to: "Three modes: render once, run() for interactive apps, or compose with plugins. Same renderer, pick your level." Remove link to "Gradually sip TEA"
- **Packages table**: Remove `@silvery/create` row or change to "Coming soon" with no link
- Keep everything else — the hero, examples, renderer section are all excellent

### getting-started/migrate-from-ink.md (the published one)
- **Fix** `await render()` → `render(<App />)` + `.run()` pattern
- **Add** `silvery/ink` compat path at the top (the "you don't have to migrate" section from guide/migration-from-ink.md)
- **Remove** the TEA compat layer section at the bottom (`pipe`, `createApp`, `withInk`)
- **Delete** guide/migration-from-ink.md (the duplicate) after merging best content

## Phase 2: Gate TEA Content

### Remove from sidebar entirely
- reference/signals.md
- reference/plugins.md
- design/app-composition.md
- design/plugin-architecture.md

### Gate with prominent "Coming Soon" + remove from default nav
- guides/state-management.md — keep file but remove from sidebar. Add "This documents Silvertea, which is not yet released" banner
- guides/terminal-apps.md — truncate at Level 2 (useState/useInput). Levels 3-5 get "Coming with Silvertea" banner or are removed

### Clean up leaks in kept files
- guide/imports.md — remove @silvery/create section
- reference/packages.md — mark @silvery/create as "Coming Soon", remove API details
- guide/silvery-vs-ink.md — remove TEA comparison points
- reference/compatibility.md — remove createApp/pipe references
- guide/the-silvery-way.md — check principle 9 "Gradually sip TEA" for leaky API refs

## Phase 3: Consolidate Structure

### Target sidebar (6 sections, clean)

```
Getting Started
  Quick Start
  Migrate from Ink
  Migrate from Chalk

The Silvery Way (standalone link)

Guides
  Components & Layout
  Styling & Theming
  Input & Focus
  Scrolling
  Testing
  Debugging

API Reference
  Box | Text | Newline | Spacer | Static
  render | useContentRect | useInput | useApp | useStdout | useFocus

Reference (collapsed)
  Packages
  Ink/Chalk Compatibility
  Imports & Subpaths
  Layout Engine (Flexily vs Yoga)
  Terminal Capabilities
  Troubleshooting
  Recipes

Internals (collapsed)
  Runtime Layers
  ANSI Pipeline
  Cursor API
  React 19 Notes
```

### File consolidation
- Merge guide/layouts.md + guides/components.md → guides/components-layout.md
- Merge guide/styling.md + guides/theming.md → guides/styling.md
- Merge guide/event-handling.md + reference/input-features.md → guides/input-focus.md
- Delete: guide/getting-started.md, guide/installation.md, guide/comparison.md (merge into silvery-vs-ink), guide/why-silvery.md (merge into homepage), guides/future-targets.md (internal)
- Move design/*.md → silvery-internal (internal design docs, not user-facing)

### Fix the 3 directories → 1 directory problem
- `getting-started/` stays (3 files)
- `guide/` → rename to `internals/` (deep technical docs only)
- `guides/` → rename to `guide/` (the main guide section)
- `reference/` stays
- `api/` stays

## Phase 4: Quality Pass

- Read entire site as a newcomer: README → homepage → quick start → first guide → build something
- Read as an Ink migrator: homepage → migrate from ink → test → ship
- Read as a production builder: quick start → components → styling → testing → reference
- Verify every sidebar link resolves
- Verify no orphaned files remain
- Verify zero TEA API documentation visible (only "coming soon" mentions)

## Acceptance Criteria

- [ ] Zero `createApp`/`pipe`/`withApp`/`signal()`/`commands` API docs visible on silvery.dev
- [ ] README mentions TEA only in "Coming" section
- [ ] Homepage feature cards are all shipped features
- [ ] migrate-from-ink has correct render() API + silvery/ink compat path
- [ ] Zero duplicate files (no two files covering same topic)
- [ ] Every .md file appears in sidebar OR is explicitly internal
- [ ] FTUE flow works: README → homepage → quick start → first guide in <60 seconds
- [ ] `bun run docs:build` succeeds with no broken links