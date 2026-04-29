---
id: "@km/all/test-whitebox-api"
aliases:
  - km-all.test-whitebox-api
  - km-all-test-whitebox-api
created_by: Bjørn Stabell
created_at: 2026-04-10T02:34:55Z
closed_at: 2026-04-15T19:25:09Z
close_reason: "Grooming 2026-04-15: duplicate of km-all.test-system.p1-whitebox
  (already closed). Typed white-box API work is done."
owner: bjorn@stabell.org
---

# [x] Close FREEZE bucket — typed white-box APIs on createTestApp @km/all #feature #P0

## Problem

The testEnv → createTestApp migration left ~25 tests in the FREEZE bucket because createTestApp has no white-box API. Tests that need undo stack depth, internal selection state, dialog stack, or clipboard state still reach into store.getState(). The result: when internal state shape changes (ModeStack deletion, selection consolidation, rect renames), those tests break en masse (157 slow test failures in the 2026-04-09 session from exactly this).

## Root cause

The decision to hide the store was the right call to prevent coupling, but it left a gap for legitimate observability needs. Tests fell back to testEnv instead of staying on createTestApp, and testEnv tests then broke when internals were refactored.

## Solution — typed capability getters

Add stable, typed getters to TestApp in apps/@km/tui/tests/helpers/test-app.ts. These form an observability contract — the supported white-box surface. Anything not on the list should be a screen assertion.

Initial API:

  interface TestApp {
    readonly cursorNodeId: string | null
    readonly cursorDepth: "card" | "column" | "board" | null
    selectionIds(): string[]
    isMultiSelection(): boolean

    readonly undoDepth: number
    readonly redoDepth: number

    readonly viewMode: "cards" | "columns" | "tabs" | "detail"
    readonly activePaneId: string | null
    paneCount(): number

    readonly overlayDepth: number
    topOverlay(): string | null

    clipboardItemCount(): number
    clipboardNodeIds(): string[]

    readonly bellCount: number
    readonly filterActive: boolean
    readonly filterCount: number
  }

Each getter maps to a single store path internally. When the store path changes, update the getter — not the 42 call sites.

## Escape hatch

  createTestApp(item(...), { exposeStore: true })

Opt-in flag exposes app.store for tests that genuinely need full inspection. Makes white-box tests greppable and auditable.

## Backend-agnostic style assertions (termless path)

Tests that need cell-level style checks should switch to termless backend, not testEnv:

  app.cell(col, row): FrameCell
  app.expectNodeBorder(nodeId, color): void
  app.expectNodeColor(nodeId, color): void

## Mouse events via termless

  app.click(nodeId): void
  app.clickAt(col, row): void
  app.hover(nodeId): void

## Phases

### Phase 1 — Add getters
- Add typed getter API to TestApp
- Document observability contract in apps/@km/tui/tests/CLAUDE.md
- /complete: all getters return correct values

### Phase 2 — Escape hatch
- Add { exposeStore: true } option
- /complete: documented, works

### Phase 3 — Termless cell + mouse APIs
- Wire FrameCell through TestApp
- Wire mouse via termless
- /complete: 5 reference tests migrated

### Phase 4 — Migrate FREEZE bucket
- Audit ~25 FREEZE tests
- Migrate or reclassify each
- /complete: 0 files use testEnv

### Phase 5 — Remove testEnv
- Delete testEnv from helpers
- Update CLAUDE.md
- /complete: grep -r testEnv apps/@km/tui/tests/ returns 0 hits

## Why P0

Every test refactor breaks testEnv tests again. The 157-failure CI mess isn't a one-time event — it recurs on every big refactor. Closing the gap permanently eliminates the failure mode.

Related: @km/all/test-migrate (bulk migration of 75 files, also P0, reopened).