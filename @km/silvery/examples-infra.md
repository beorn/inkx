---
id: "@km/silvery/examples-infra"
aliases:
  - km-silvery.examples-infra
  - km-silvery-examples-infra
created_by: claude:73d7a332
created_at: 2026-03-12T16:20:33Z
closed_at: 2026-03-13T17:05:07Z
close_reason: "Phase 1 complete: 13 dead web-only files deleted (-2353 lines),
  all 9 showcases now use terminal examples as single source of truth, build.ts
  auto-discovers. Phase 2 already done (CLI viewer had Cmd+K, theme picker,
  cross-links)."
---

# [x] Examples infrastructure: unify web/CLI, auto-discover, kill showcases @km/silvery #task #P1 @claude:c9beade3

Examples infrastructure: unify web/CLI, auto-discover, kill hardcoded showcase lists, add runner-level UI.

## Context

37 terminal examples exist across 5 directories (interactive/, layout/, runtime/, inline/, kitty/). All export meta: ExampleMeta. Goal: consolidate into 9 flagship examples that work on both CLI and web.

### Current Architecture

CLI side (working): cli.ts auto-discovers by scanning dirs. viewer.tsx is a Storybook-style TUI viewer with sidebar, View/Source tabs, theme cycling. Both auto-discover from the same 5 directories.

Web side (hardcoded, needs unification): web/showcases/index.ts has hardcoded imports mapping URL keys to components. showcase-app.tsx embeds single demos in VitePress docs. viewer-app.tsx is full DOM viewer with HARDCODED DEMO_METADATA (~430 lines of inline source strings). build.ts generates viewer-registry.ts with hardcoded showcaseKeys/showcaseMeta arrays.

Key insight already proven: renderToXterm() with input:true makes terminal examples work in web. Standard hooks (useInput, useMouse, useTerminalFocused) all work.

### Uncommitted WIP (in silvery submodule)

- examples/web/showcases/index.ts — rewritten to import terminal examples (Dashboard, KanbanBoard, CodingAgent, etc.)
- examples/web/showcase-app.tsx — changed to input:true instead of manual onMouse/onFocus callbacks

## Implementation Plan

### Phase 1: Kill Hardcoded Web Metadata

1. Commit WIP changes (showcases/index.ts and showcase-app.tsx)
2. Update web/build.ts: Remove hardcoded showcaseKeys and showcaseMeta (lines 142-211). Auto-discover from terminal example meta exports + SHOWCASES registry.
3. Update web/viewer-app.tsx: Remove DEMO_METADATA (lines 53-483). Import generated viewer-registry.ts instead. renderDemo() already uses SHOWCASES for components.
4. Delete web-only showcase files after terminal equivalents exist: layout-feedback.tsx, focus.tsx, text-input.tsx, theme-explorer.tsx, shared.tsx (dead code — emitMouse/setTermFocused replaced by input:true).

### Phase 2: CLI Viewer Upgrades

1. Cmd+K/Ctrl+K command palette: Use existing PickerDialog (modal + fuzzy search + readline + scrolling). State: mode browse/palette/settings. Platform: process.platform=darwin shows Cmd else Ctrl.
2. Settings dialog (s key): theme picker via PickerDialog listing builtinThemes (38 palettes). Replace single-key t cycle.
3. Cross-links in status bar: silvery.dev/examples/key and bunx silvery example key.
4. Bottom bar: Cmd-K switch | s settings | Tab source | Enter run | q quit

### Phase 3: Update SHOWCASES Registry

Map URL keys to 9 flagship examples: aichat, gallery, kanban, explorer, wizard, dashboard, terminal, components, theme.

### Key Files

- examples/web/showcases/index.ts — bridge registry (WIP started)
- examples/web/showcase-app.tsx — VitePress embed (WIP done)
- examples/web/viewer-app.tsx — kill DEMO_METADATA, auto-discover
- examples/web/build.ts — kill hardcoded lists, auto-discover
- examples/viewer.tsx — add Cmd+K, settings, cross-links
- examples/_banner.tsx — ExampleMeta type

### Components Available

PickerDialog, CommandPalette, ModalDialog, SelectList, TextInput — all exported from silvery.