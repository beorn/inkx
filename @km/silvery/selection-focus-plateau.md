---
id: "@km/silvery/selection-focus-plateau"
aliases:
  - km-silvery.selection-focus-plateau
  - km-silvery-selection-focus-plateau
created_by: Bjørn Stabell
created_at: 2026-04-09T07:48:05Z
---

# [ ] Selection & Focus Quality Plateau — roadmap to elimination of seam fragility @km/silvery #epic #P0

blocks:: [[@km/silvery/architectural-plateau]]

# Selection & Focus Quality Plateau — unified tracking roadmap

The single tracking bead for the plateau: selection seams, TEA, omnibox completion, gap analysis, and the smoke-test lock-in. All phase children are reparented here and sequenced with hard dependencies where cross-phase order is load-bearing.

## Why this epic exists

Selection and focus are ~80% to quality plateau. Individual subsystems are solid (`@silvery/selection`, reduced signals, FocusManager, invariants). The remaining fragility lives at the SEAMS between them, in @km/tui's state containers, and in the duplication between @km/tui views and silvery primitives. Closing the plateau requires a sequenced push through TEA (the architecture that eliminates the seam class) and a gap analysis (that eliminates the duplication class).

## Shipped foundations (reference)

- `@silvery/selection` pure state machine + typed store API (202 tests)
- `silvery-selection.tree.contains(id)` — O(1) hot path, killed 2-5s startup freeze
- `cursor-in-walkOrder` invariant reverted to fatal (contains() made recoverable obsolete)
- Unified omnibox on silvery `ModalDialog + TextInput + PickerList`
- `.claude/skills/tui/silvery-components.md` audit gate + per-package CLAUDE.md pre-flights
- Activation-rules audit across 7 package CLAUDE.md files

## Roadmap (sequenced)

### Phase 1 — Selection seams finish
Cheap, independent, unlocks Phase 2.
- `km-tui.zoomin-atomic-sync` P3 — delete redundant ZOOM_IN/sel.root.set pair sites OR make syncPaneSignals unconditional
- `km-all.unified-selection` P0 — TextSelection | NodeSelection | GapSelection on BoardState

### Phase 2 — TEA foundations (silvery side)
Foundational. The architecture that eliminates the seam class structurally.
- `km-silvery.tea-useinput` P1 — Fix useInput precedence inside createApp
- `km-silvery.tea` P0 epic — signals, commands, scopes (has own children)
- `km-silvery.selection-quality` P1 — dual systems consolidation + integration tests

### Phase 3 — TEA in @km/tui
Depends on Phase 2. When this lands, the cursor recoverable mechanism and manual reconciliation get deleted.
- `km-tui.atomic-tree-ops` P0 — structural ops include selection update (depends on unified-selection)
- `km-tui.tea` P0 — TEA state machines for @km/tui (depends on atomic-tree-ops + silvery.tea)
- `km-silvery.tea.migration` P2 — Era2b Phase 7: km migration to TEA packages

### Phase 4 — Omnibox completion
Parallelizable with Phase 3 (different files, no shared state).
- `km-tui.omnibox-quality-plateau` P2 — finish retiring legacy Omnibox.tsx
- `km-tui.omnibox-command-projection` P1 — command-tree projection (TEA shim, Phase 3)

### Phase 5 — Gap analysis
Must come AFTER Phases 2-3 so the silvery surface is stable. Auditing duplication against a moving target produces migration plans that rot on landing.
- `km-review.silvery-gap-analysis` P2 — full sweep of @km/tui views/hooks/text vs silvery primitives; produces migration beads per DUPLICATE + `km-silvery.*` beads per SILVERY GAP

### Phase 6 — Lock it in
- `km-tui.real-vault-smoke-test` P3 — real-vault termless smoke runner; wire into `/complete` and pre-release

## Hard dependencies

- `km-tui.tea` blocks on `km-silvery.tea-useinput`, `km-silvery.tea`, `km-tui.atomic-tree-ops`
- `km-tui.atomic-tree-ops` blocks on `km-all.unified-selection`
- `km-review.silvery-gap-analysis` blocks on `km-tui.tea` + `km-silvery.tea.migration`
- `km-tui.real-vault-smoke-test` blocks on `km-review.silvery-gap-analysis`

Soft ordering (Phase 1 → 2, Phase 4 parallel to Phase 3) is doc-only — not encoded as hard deps.

## What this supersedes

- The cursor recoverable+heal pattern (commits 791067dd1, 40aacb487, f6505a9ea, 1d5ed465e) — Phase 3 deletes it
- `km-tui.cursor-gate-refactor` — unified-selection subsumes structurally
- Most cursor items in `km-tribe.reliability-sweep-0415`

## Status

Phase 1 zoomin-atomic-sync is independent and cheap — go first. Phases 2-3 are the weight. Phase 5 unlocks the dialog duplication wins (SearchDialog, ItemPicker, FavoritesDialog, NewItemDialog, DatePromptDialog still on InputBox + useDialogInput).