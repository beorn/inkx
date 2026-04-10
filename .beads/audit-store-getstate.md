# Store.getState() Audit Report

**Date**: 2026-04-09  
**Scope**: All `store.getState()` call sites in `/Users/beorn/Code/pim/km/apps/km-tui/tests/`  
**Total Occurrences**: 522 verified calls across 34 files

## Executive Summary

| Classification | Count | % | Action | Priority |
|---|---|---|---|---|
| **SCREEN** | 239 | 44% | Convert to screen assertions (`app.expect()`) | HIGH |
| **GETTER** | 82 | 15% | Create typed observability getters | HIGH |
| **UNCLASSIFIED** | 152 | 28% | Review `getActiveBoardPane(store.getState())` usage | MEDIUM |
| **REMOVE** | 58 | 11% | Delete side effect calls (`.setUI()`, `.dispatch()`) | HIGH |
| **LOWER_LAYER** | 3 | 0% | Move to km-board reducer or km-storage tests | LOW |

---

## Distribution by File (All 34 Files)

### Top 10 Largest Files

| File | Total | SCREEN | GETTER | REMOVE | UNCLASS |
|---|---|---|---|---|---|
| windowing-wire.test.ts | 93 | 60 | 0 | 28 | 5 |
| production-entry.slow.spec.ts | 45 | 22 | 19 | 0 | 4 |
| detail-pane.slow.test.ts | 40 | 37 | 0 | 2 | 1 |
| search.slow.spec.ts | 36 | 0 | 0 | 1 | 33 |
| escape-layering.slow.test.ts | 32 | 22 | 6 | 0 | 4 |
| windowing-mouse.test.ts | 29 | 13 | 0 | 12 | 4 |
| mouse-click.test.ts | 28 | 23 | 0 | 0 | 5 |
| fold.slow.test.ts | 24 | 2 | 0 | 6 | 16 |
| undo-redo.slow.spec.ts | 22 | 7 | 15 | 0 | 0 |
| board-features.slow.spec.ts | 22 | 15 | 0 | 0 | 7 |

---

## SCREEN Assertions (44% - 239 calls)

Visible state that should be tested via screen assertions, not store inspection.

**Examples**:
- `.workspace.panes.has("main-detail")` — pane visibility
- `.workspace.focusedPaneId` — which pane has focus  
- `.sel.node.cursor()` — cursor position
- `.sel.node.ids()` — selected cards

**Replacement Pattern**:
```typescript
// Before: store inspection
expect(store.getState().workspace.panes.has("main-detail")).toBe(true)
expect(store.getState().workspace.focusedPaneId).toBe("main-detail")

// After: screen assertion
app.expect("#main-detail").toBeVisible()
app.expectHasFocus("#main-detail")
```

**Top Files**:
- windowing-wire.test.ts (60)
- detail-pane.slow.test.ts (37)
- smart-p-toggle.test.ts (19)
- escape-layering.slow.test.ts (22)
- mouse-click.test.ts (23)

---

## GETTER Accessors (15% - 82 calls)

Non-visible internal state requiring typed observability getters.

**Examples**:
- `.ui.showHelp` — overlay state
- `.undoStack.size`, `.undoHandle.canUndo()` — undo state
- `.ui.pendingChord` — keyboard input
- `.ui.datePrompt` — dialog contents

**Required Getters**:
```typescript
// UI state
getShowHelp() → boolean
getShowConsole() → boolean
getShowSearchDialog() → boolean
getShowNewItemDialog() → boolean

// Dialog state
getDatePrompt() → DatePromptState | null
getBellState() → BellState | null

// Scroll/keyboard
getHelpScrollOffset() → number | undefined
getPendingChord() → string | null
getTextEditHints() → TextEditHints

// Loading
getIsLoading() → boolean
getStatus() → string | null

// Undo/Redo
getUndoStackSize() → number
canUndo() → boolean
canRedo() → boolean
```

**Top Files**:
- production-entry.slow.spec.ts (19)
- undo-redo.slow.spec.ts (15)
- board-spec.slow.test.ts (16)
- which-key.test.ts (13)

---

## REMOVE Side Effects (11% - 58 calls)

Method calls on `store.getState()` — not assertions, should be cleaned up.

**Examples**:
- `.setDimensions({ columns: 200, rows: 50 })`
- `.dispatchBoard({ type: "SELECT", ... })`
- `.splitFocusedPane("h")`
- `.sel.deselect()`

**Solution**: Call directly on store or move to setup:
```typescript
// Before
store.getState().setDimensions({ columns: 200 })
store.getState().dispatchBoard({ type: "SELECT" })

// After (clearer)
store.setDimensions({ columns: 200 })
store.dispatchBoard({ type: "SELECT" })
```

**Top Files**:
- windowing-wire.test.ts (28)
- windowing-mouse.test.ts (12)
- resize-garble.slow.test.ts (6)
- fold.slow.test.ts (6)

---

## UNCLASSIFIED (28% - 152 calls)

`getActiveBoardPane(store.getState())` helper calls. Classification depends on what the pane property is used for.

**Typical Pattern**:
```typescript
const pane = getActiveBoardPane(store.getState())!
expect(pane.rootId).toBe("board")  // Likely SCREEN (visible)
expect(pane.sel.node.cursor()).toBe("task1")  // Likely SCREEN
```

**Status**: Can be reclassified once helper usage is reviewed.

**Top Files**:
- search.slow.spec.ts (33)
- fold.slow.test.ts (16)
- body-nav.slow.test.ts (14)

---

## LOWER_LAYER (0.5% - 3 calls)

Tests of library internals that belong in km-board or km-storage test suites.

**Examples**:
- `.repo.getNode()`
- `.jobRunner`

**Action**: Move to appropriate layer tests.

---

## All Unique Store Paths

### SCREEN Paths (239 total)
```
.workspace.panes
.workspace.focusedPaneId
.workspace.previousFocusedPaneId
.workspace.layout
.sel.node.cursor()
.sel.node.ids()
.sel.text()
.sel.deselect()
```

### GETTER Paths (82 total)
```
.ui.showHelp
.ui.showConsole
.ui.showSearchDialog
.ui.showNewItemDialog
.ui.datePrompt
.ui.bellState
.ui.helpScrollOffset
.ui.pendingChord
.ui.isLoading
.ui.status
.undoStack.size
.undoHandle.canUndo()
.undoHandle.canRedo()
.textEditHints
```

### REMOVE Paths (58 total)
```
.setDimensions()
.setUI()
.dispatchBoard()
.splitFocusedPane()
.closeFocusedPane()
.focusPaneById()
.cyclePaneFocus()
.setSplitRatio()
.setFoldDepths()
.sel.deselect()
```

---

## Recommended Implementation Plan

### Phase 1: REMOVE (2 hours)
- Delete or refactor side effect calls
- Move `.setDimensions()`, `.setUI()` to setup phase
- 58 call sites eliminated

### Phase 2: GETTER (4 hours)
- Create typed accessor functions
- Update test imports
- 82 call sites converted to use `getShowHelp()` style API

### Phase 3: SCREEN (8 hours)
- Add screen matchers to createTestApp
- Replace store assertions with visual assertions
- 239 call sites converted

**Total Effort**: ~14 hours  
**Benefits**: 
- Tests no longer coupled to internal store shape
- Clear intent via method names
- Better maintainability and refactor safety

---

## Key Insights

1. **windowing-wire.test.ts is an outlier** (93 calls = 18% of total)
   - Heavy use of pane state assertions (SCREEN)
   - Many side effect calls (.splitFocusedPane)

2. **SCREEN vs GETTER divide is clear**
   - Pane/cursor/selection = visible (SCREEN)
   - Flags/dialogs/keyboard = internal (GETTER)

3. **No deep store coupling needed**
   - Most tests just need: "Is pane visible?" or "Is cursor here?"
   - These are answerable via `app.expect()` matchers

4. **Helper functions (getActiveBoardPane) are the main pattern**
   - 152 unclassified calls mostly go through getActiveBoardPane
   - Once that helper is updated, bulk of unclassified resolves
