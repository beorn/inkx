# km-tui.tea Phase 1 Implementation Plan: withDialogs()

**Status**: READY TO STAGE (blockers documented)  
**Effort**: Medium (3-5 sessions)  
**Risk**: Medium (focus scope timing, mutation sequencing)  
**Blocker severity**: CRITICAL (silvery TEA framework not shipped)

---

## 1. Executive Summary

Phase 1 extracts km-tui's dialog subsystem into a standalone TEA plugin (`withDialogs()`). This is the first plugin in the 7-phase km-tui decomposition, establishing the architectural pattern for all subsequent phases.

**Scope**: Extract 116 + 24 + 233 = 373 LOC of dialog state management + command handlers from board-actions.ts into a plugin with its own model, commands, and focus scope.

**Deletion**: `dialog-guard.ts`, `dialog-target.ts`, `useBoardDialogs.ts` (480 LOC).

**Gateway blockers** (Phase 1 cannot start until these ship):
1. **G1**: silvery TEA framework — `pipe()`, `apply()` chain, `app.commands` tree, `app.models`, `withX()` plugin protocol at runtime (in-progress: `km-silvery.tea-useinput`)
2. **G2**: `km-silvery.focus-ink-parity` Phase 1 — silvery FocusManager wired into ink-render.ts (unblocks focus scope inside plugins)

---

## 2. Inventory: Dialog State Across km-tui

### 2.1 Files That Define Dialog Logic

| File | LOC | Role | Fate |
|------|-----|------|------|
| `dialog-guard.ts` | 116 | Dialog mode stack + grace period | DELETE |
| `dialog-target.ts` | 24 | Ref interface for dialog commands | DELETE |
| `views/use-board-dialogs.ts` | 233 | Dialog handlers hook | DELETE |
| `views/Board.tsx` | 283 | Board component, installs guard | EDIT: remove installDialogGuard/resetDialogGuard calls |
| `views/WorkspaceChrome.tsx` | 734 | Dialog UI + command dispatch | EDIT: migrate handlers to withDialogs plugin |
| `views/DatePromptDialog.tsx` | ~80 | Date prompt modal | EDIT: wire to plugin commands |
| `hooks/use-dialog-input.ts` | ~85 | Dialog input + navUp/navDown routing | EDIT: delegate to plugin |
| `UnifiedOmnibox.tsx` | ~200 | Omnibox component, uses dialogTargetRef | EDIT: receive commands from plugin |
| `board/board-actions.ts` | 3009 | Handlers + dialog commands | EDIT: remove 11 dialog operations (see 2.3) |
| `board/board-app.ts` | 1276 | App init, isDialogOpen checks | EDIT: migrate to plugin queries |
| `board/board-actions-find.ts` | ~100 | Local search dialog | EDIT: dispatch to plugin |
| `board/board-actions-search-replace.ts` | ~120 | Search/replace dialog | EDIT: dispatch to plugin |

**Total edits**: 12 files. **Total deletions**: 3 files. **Total new code**: 1 plugin file (with-dialogs.ts) + 1 test file.

### 2.2 Dialog State Variables on UIState

Current `UIState` fields that move into `withDialogs` plugin model:

```ts
// Search dialog
showSearchDialog: boolean
searchDialogInitialInput: string
searchScope: "all" | "selected"
searchScopeNodeIds: string[]

// New item dialog
showNewItemDialog: boolean

// Filter dialog
showFilterDialog: boolean
filterText: string
filterProperties: FilterProperties
filterCursorRow: number
filterCursorVal: number

// Date/recurrence prompt
datePrompt: { field: string; nodeIds: string[]; currentValue: string } | null

// Delete confirmation (currently orphaned, no active dialog guard—candidate for migration later)
deleteConfirm: { nodeIds: string[]; title: string; ... } | null

// Console
showConsole: boolean

// Help
showHelp: boolean
helpScrollOffset: number

// Global input state (command routing)
// These stay on UIState but interact with plugin:
omnibox: OmniboxPane | null
pendingChord: string | null
chordTimedOut: boolean
```

**Fields that stay on UIState**: windowWidth, windowHeight, isLoading, loadingStartTime, backgroundParsing, watcherStatus, syncEvents, bellState, status, toastVersion, clipboard, droppedFiles, showDropNotification, navHistory, navHistoryIndex, terminalFocused, dimensions, borderMode, iconStyle.

### 2.3 Dialog-Related Operations (Commands)

Extracted from board-actions.ts handleKmOp() switch:

```
Dialog open commands:
- SHOW_NEW_ITEM_DIALOG → pushDialogMode("dialog:newItem")
- SHOW_SEARCH_DIALOG → pushDialogMode("dialog:search")
- SHOW_FILTER_DIALOG → pushDialogMode("dialog:filter") [or pop then push]
- OPEN_UNIFIED_OMNIBOX → pushDialogMode("dialog:omnibox") [or SET omnibox field]

Dialog close commands:
- SET_FILTER / CLEAR_FILTER / CLEAR_FILTERS → popDialogMode()
- DIALOG_CANCEL → popDialogMode() + dialogTargetRef.current?.cancel()

Dialog navigation:
- DIALOG_NAV_UP → dialogTargetRef.current?.navUp()
- DIALOG_NAV_DOWN → dialogTargetRef.current?.navDown()
- DIALOG_NAV_LEFT / DIALOG_NAV_RIGHT → dialogTargetRef.current?.navLeft/Right() [not yet wired]

Dialog confirm:
- DIALOG_CONFIRM → markDialogConfirmed() + popDialogMode() + dialogTargetRef.current?.confirm()

Auxiliary:
- SHOW_HELP / HIDE_HELP → ctx.setUI({ showHelp: true/false })
- TOGGLE_CONSOLE → ctx.setUI({ showConsole: !prev.showConsole })
```

**Total lines in board-actions.ts that reference these**: ~120 lines across the switch statement.

### 2.4 Runtime Reference Points (Global State)

**dialog-guard.ts exports**:
```ts
export function installDialogGuard(fm: FocusManager): void
export function currentMode(): InputMode
export function isDialogOpen(): boolean
export function pushDialogMode(mode: InputMode): void
export function popDialogMode(): InputMode | undefined
export function resetDialogGuard(): void
export function markDialogConfirmed(): void
export function isDialogConfirmGracePeriod(): boolean
```

**Usage sites**:
- `driver.ts:179` — calls `resetDialogGuard()` on test setup
- `Board.tsx:116` — calls `resetDialogGuard()` on cleanup; line 106 calls `installDialogGuard(focusManager)`
- `board-app.ts:50` — calls `resetDialogGuard()` on app init
- `board-app.ts:918,929,935,941,952` — calls `popDialogMode()` in 5 places
- `board-actions.ts:1262, 1285, 1296, 1308, 1310, 1317, 1321, 1368, 1412, 1481` — pushDialogMode/popDialogMode in 10 places
- `board-actions-find.ts:54` — `pushDialogMode("dialog:localFind")`
- `board-actions-search-replace.ts:19` — `pushDialogMode("dialog:searchReplace")`
- `WorkspaceChrome.tsx:359, 361, 373` — `popDialogMode()` in 3 places

**dialog-target.ts exports**:
```ts
export interface DialogTarget { navUp/Down/confirm/cancel: () => void }
export const dialogTargetRef: { current: DialogTarget | null }
```

**Usage sites**:
- `use-dialog-input.ts:59-79` — wires dialogTargetRef on mount
- `WorkspaceChrome.tsx:416-434` — wires dialogTargetRef for omnibox
- `DatePromptDialog.tsx:5` — uses dialogTargetRef (comment only)
- `UnifiedOmnibox.tsx:11` — uses dialogTargetRef (comment, key routing note)
- `board-actions.ts:1424, 1434, 1482-1485, 1497, 1501` — calls dialogTargetRef.current?.navUp/Down/confirm/cancel()

---

## 3. withDialogs Plugin Shape

### 3.1 Plugin Model

```ts
interface DialogsModel {
  // Dialog visibility flags
  showNewItemDialog: boolean
  showSearchDialog: boolean
  showFilterDialog: boolean
  showConsole: boolean
  showHelp: boolean
  helpScrollOffset: number

  // Search dialog state
  searchDialogInitialInput: string
  searchScope: "all" | "selected"
  searchScopeNodeIds: string[]

  // Filter dialog state
  filterText: string
  filterProperties: FilterProperties
  filterCursorRow: number
  filterCursorVal: number

  // Date/recurrence prompt
  datePrompt: {
    field: "due_at" | "start_at" | "rrule"
    nodeIds: string[]
    currentValue: string
  } | null

  // Delete confirmation
  deleteConfirm: {
    nodeIds: string[]
    title: string
    childCount: number
    backlinkCount: number
    hasMetadata?: boolean
  } | null

  // Modal state for local search & search/replace
  localSearch: LocalSearchState | null
  searchReplace: SearchReplaceState | null

  // Grace period flag (suppress Enter key after confirm)
  dialogConfirmedAt: number // timestamp, 0 = no grace
}
```

**Total fields**: 17. **Initial state**: all false/null/0.

### 3.2 Plugin Commands

Structured as `app.commands.dialogs.*`:

```ts
// Dialog open/close
app.commands.dialogs.openNewItem()
app.commands.dialogs.openSearch()
app.commands.dialogs.openFilter()
app.commands.dialogs.openOmnibox()
app.commands.dialogs.closeDialog()  // generic close
app.commands.dialogs.cancelDialog() // cancel = close + callback

// Search scope
app.commands.dialogs.setSearchScope(scope: "all" | "selected")
app.commands.dialogs.setSearchQuery(input: string)

// Filter operations
app.commands.dialogs.setFilterText(text: string)
app.commands.dialogs.setFilterCursor(row: number, val: number)
app.commands.dialogs.toggleFilterProperty(category: string, value: string)
app.commands.dialogs.clearFilterCategory(category: string)
app.commands.dialogs.clearAllFilters()

// Help & console
app.commands.dialogs.showHelp()
app.commands.dialogs.hideHelp()
app.commands.dialogs.toggleConsole()

// Dialog input navigation
app.commands.dialogs.navUp()     // → dialogTarget.navUp()
app.commands.dialogs.navDown()   // → dialogTarget.navDown()
app.commands.dialogs.navLeft()   // → dialogTarget.navLeft()
app.commands.dialogs.navRight()  // → dialogTarget.navRight()

// Dialog confirm/cancel
app.commands.dialogs.confirmDialog()  // → setGracePeriod() + dialogTarget.confirm()
app.commands.dialogs.cancelDialog()   // → dialogTarget.cancel()

// Date prompt
app.commands.dialogs.openDatePrompt(field: string, nodeIds: string[])
app.commands.dialogs.closeDatePrompt()

// Delete confirm
app.commands.dialogs.openDeleteConfirm(nodeIds: string[], title: string, ...)
app.commands.dialogs.closeDeleteConfirm()
```

**Total commands**: 22 (will be discovered via app.commands tree).

### 3.3 Focus Scope Integration

The plugin owns a **focus scope** named `"dialog:container"` that:

1. **Auto-activates** when any dialog opens (`showNewItemDialog | showSearchDialog | showFilterDialog | datePrompt | deleteConfirm | localSearch | searchReplace | showHelp` changes to true)
2. **Auto-deactivates** when all dialogs close
3. **Owns focus order** for dialog input fields (search input, filter input, date prompt input)
4. **Interops with silvery FocusManager** via:
   - `useFocusManager()` to read/control scope stack
   - Plugin registers dialog focusables on mount (depends on G2: `km-silvery.focus-ink-parity` Phase 1)
5. **Fallback for grace period**: dialog confirm sets timestamp; ENTER_INLINE_EDIT check reads `isDialogConfirmGracePeriod()` from plugin model

**Scope ID pool**:
- `"dialog:container"` — focus scope owned by plugin (ONE scope, auto-activate/deactivate)
- Individual dialog modes (`"dialog:newItem"`, `"dialog:search"`, etc.) are DELETED — replaced by single scope + model visibility flags

**FocusManager interaction**:
```ts
// When first dialog opens:
focusManager.enterScope("dialog:container")

// When last dialog closes:
focusManager.exitScope()

// When Tab/Shift-Tab in dialog:
focusManager.focusNext() / focusPrev() (automatically routed by FocusManager)
```

**Blocking dependency**: requires `km-silvery.focus-ink-parity` Phase 1 to wire FocusManager into ink-render.ts Tab dispatch path.

---

## 4. Deletion List

### 4.1 Files to Delete (3 total, 140 LOC)

1. **apps/km-tui/src/dialog-guard.ts** (116 LOC)
   - All exports moved to plugin model fields + helper functions
   - `installDialogGuard` → plugin auto-registers on mount
   - `currentMode`, `isDialogOpen` → derived from plugin.showXDialog flags
   - `pushDialogMode`, `popDialogMode` → plugin commands manage visibility
   - `resetDialogGuard` → plugin reset in cleanup
   - `markDialogConfirmed`, `isDialogConfirmGracePeriod` → plugin model fields

2. **apps/km-tui/src/dialog-target.ts** (24 LOC)
   - `DialogTarget` interface → plugin provides methods via focus scope registration
   - `dialogTargetRef` → plugin registers dialog components as focusables

3. **apps/km-tui/src/views/use-board-dialogs.ts** (233 LOC)
   - All handlers moved into plugin apply chain OR remain as view-layer event handlers
   - `handleNewItemCreate`, `handleNewItemCancel` → component callbacks (not part of plugin state machine)
   - `handleSearchSelect`, `handleSearchCancel` → component callbacks
   - `handleFilterApply`, `handleFilterCancel` → component callbacks
   - `handleDatePromptConfirm`, `handleDatePromptCancel` → component callbacks

### 4.2 Fields to Delete from UIState (13 fields)

```ts
// Remove from UIState interface in ui-reducer.ts
- showSearchDialog: boolean
- searchDialogInitialInput: string
- searchScope: "all" | "selected"
- searchScopeNodeIds: string[]
- showNewItemDialog: boolean
- showFilterDialog: boolean
- filterText: string
- filterProperties: FilterProperties
- filterCursorRow: number
- filterCursorVal: number
- showConsole: boolean
- showHelp: boolean
- helpScrollOffset: number

// Remove from createInitialUIState()
- Also remove matching initializations
```

**Fields that stay on UIState**:
- `datePrompt` (may migrate later, currently needed by board-app.ts)
- `deleteConfirm` (currently orphaned, not in active path—scope this separately)
- `omnibox`, `pendingChord`, `chordTimedOut` (command palette—separate plugin, Phase 4+)

### 4.3 Calls to Remove from board-actions.ts (~120 lines)

Remove these 11 case blocks:
```ts
case "SHOW_NEW_ITEM_DIALOG": // lines ~1261-1264
case "SHOW_SEARCH_DIALOG": // lines ~1295-1298
case "SHOW_FILTER_DIALOG": // lines ~1306-1318
case "CLEAR_FILTER": // lines ~1317-1320
case "CLEAR_FILTERS": // lines ~1364-1370
case "OPEN_UNIFIED_OMNIBOX": // lines ~1377-1413
case "DIALOG_NAV_UP": // lines ~1416-1425
case "DIALOG_NAV_DOWN": // lines ~1426-1435
case "DIALOG_NAV_LEFT/RIGHT": // lines ~1436-1451
case "DIALOG_CONFIRM": // lines ~1453-1494
case "DIALOG_CANCEL": // lines ~1495-1510
```

Replace all `pushDialogMode`, `popDialogMode`, `markDialogConfirmed`, `isDialogConfirmGracePeriod`, `dialogTargetRef` calls with:
```ts
// Before phase completion:
app.commands.dialogs.openSearch()
app.commands.dialogs.closeDialog()
app.commands.dialogs.confirmDialog()
// etc.
```

---

## 5. Migration Steps (Phased Execution)

### 5.1 Pre-flight (0.5 sessions)

- [ ] **Verify silvery TEA framework gates**:
  - [ ] Check if `km-silvery.tea-useinput` shipped (run `npm ls @silvery/create` → should show `pipe()`, `apply()` exports)
  - [ ] Confirm `km-silvery.focus-ink-parity` Phase 1 landed (FocusManager wired in ink-render.ts)
  - [ ] Verify `app.commands` tree accessible in runtime (check @silvery/create exports)
- [ ] Create `apps/km-tui/src/plugins/with-dialogs.ts` scaffold
- [ ] Create `apps/km-tui/src/plugins/with-dialogs.test.ts` scaffold

### 5.2 Stage 1: Add Plugin Skeleton (1 session)

- [ ] **Implement withDialogs plugin**:
  ```ts
  export function withDialogs(): (app: AppInstance) => AppInstance {
    return (app) => {
      // Register model fields
      app.models.dialogs = { /* fields from 3.1 */ }
      
      // Register commands
      app.commands.dialogs.openNewItem = () => app.models.dialogs.showNewItemDialog = true
      // ... 21 more commands
      
      // Auto-activate focus scope on dialog open
      // Auto-deactivate on dialog close
      
      return app
    }
  }
  ```
- [ ] **Integrate into app composition**:
  - [ ] Locate km-tui's app creation (driver.ts createBoardApp)
  - [ ] Insert `withDialogs()` into pipe chain (after createApp, before board/editor/selection plugins)
  - [ ] Test app starts + dialogs respond to commands

### 5.3 Stage 2: Migrate UI State (1.5 sessions)

- [ ] **Move state fields from UIState to plugin**:
  - [ ] Update `apps/km-tui/src/state/ui-reducer.ts`:
    - Remove 13 fields (showSearchDialog, searchScope, filterText, etc.)
    - Remove from `createInitialUIState()`
    - Remove from `createInitialPaneUI()` (if present)
  - [ ] Update `UIState` type in all consumers:
    - [ ] `ui-reducer.ts` PaneUI helpers (`PaneUI.isInDialog()`, `isDialogInput()`) — read from plugin model via selector
    - [ ] `board-app.ts` — read `isDialogOpen()` from plugin instead of checking `currentMode()`
    - [ ] All tests that mock UIState

### 5.4 Stage 3: Migrate Command Handlers (1.5 sessions)

- [ ] **Port board-actions.ts dialog cases to plugin commands**:
  - [ ] Remove 11 case blocks from `handleKmOp()`
  - [ ] Update all callsites to use `app.commands.dialogs.*()` instead of `ctx.setUI()`
  - [ ] Audit for missing handlers (esp. filter TOGGLE_FILTER_PROPERTY, date prompt open/close)
  - [ ] Wire dialog-related state mutations into plugin apply chain

- [ ] **Update board-app.ts**:
  - [ ] Remove `isDialogOpen()` calls → use `app.models.dialogs.show*Dialog` selectors
  - [ ] Remove `resetDialogGuard()` call
  - [ ] Remove `dialogTargetRef` imports

### 5.5 Stage 4: Migrate View Components (1 session)

- [ ] **Update Board.tsx**:
  - [ ] Remove `installDialogGuard(focusManager)` call
  - [ ] Remove `resetDialogGuard()` call
  - [ ] Update `useApp` selector to read from plugin model

- [ ] **Update WorkspaceChrome.tsx**:
  - [ ] Remove `popDialogMode()` calls
  - [ ] Replace with `app.commands.dialogs.closeDialog()` / `app.commands.dialogs.cancelDialog()`
  - [ ] Replace `dialogTargetRef` wiring with plugin focus scope registration (if needed)

- [ ] **Update dialog components** (DatePromptDialog, UnifiedOmnibox, etc.):
  - [ ] Remove `dialogTargetRef` wiring
  - [ ] Register as focusables in plugin focus scope (requires G2)

- [ ] **Delete use-dialog-input.ts**:
  - [ ] Move implementation details to plugin OR keep as utility (if reusable)

### 5.6 Stage 5: Delete & Test (0.5 sessions)

- [ ] **Delete files**:
  - [ ] `rm apps/km-tui/src/dialog-guard.ts`
  - [ ] `rm apps/km-tui/src/dialog-target.ts`
  - [ ] `rm apps/km-tui/src/views/use-board-dialogs.ts`

- [ ] **Run completion checks**:
  ```bash
  rg 'dialog-guard|dialogTargetRef|useBoardDialogs|pushDialogMode|popDialogMode' apps/km-tui/src
  # Expected: 0 matches
  
  rg 'activeDialog' apps/km-tui/src/state
  # Expected: 0 matches
  
  bun run test:fast apps/km-tui
  # Expected: all tests pass
  ```

---

## 6. Completion Criteria

### 6.1 Exact Grep Commands

```bash
# Should return ZERO matches:
rg 'import.*dialog-guard' apps/km-tui/src
rg 'import.*dialog-target' apps/km-tui/src
rg 'import.*use-board-dialogs' apps/km-tui/src
rg 'pushDialogMode|popDialogMode' apps/km-tui/src
rg 'dialogTargetRef' apps/km-tui/src
rg 'resetDialogGuard|installDialogGuard' apps/km-tui/src
rg 'currentMode\(\)|isDialogOpen\(\)' apps/km-tui/src

# Should return specific counts:
rg 'app\.commands\.dialogs\.' apps/km-tui/src
# Expected: >30 matches (command dispatch sites)

rg 'showNewItemDialog|showSearchDialog|showFilterDialog|showConsole|showHelp' apps/km-tui/src/state/ui-reducer.ts
# Expected: 0 matches (fully removed from UIState)

rg 'plugins/with-dialogs' apps/km-tui/src
# Expected: >1 match (import in driver.ts, test file)
```

### 6.2 Runtime Checks

- [ ] App initializes without errors
- [ ] Each dialog opens via command dispatch
- [ ] Each dialog closes via command dispatch
- [ ] Focus scope auto-activates on dialog open
- [ ] Focus scope auto-deactivates on dialog close
- [ ] Tab/Shift-Tab navigates dialog inputs (requires G2)
- [ ] Grace period suppresses Enter key correctly
- [ ] All keybindings that open/close dialogs work

### 6.3 Test Coverage

- [ ] `with-dialogs.test.ts` covers:
  - Model initialization (all fields zero/false/null)
  - Command dispatch → state mutation
  - Focus scope activate/deactivate transitions
  - Grace period timestamp logic
  - Modal stacking (if multiple dialogs open simultaneously)

### 6.4 Git Status

```bash
git status
# Expected: 0 untracked files related to dialogs
# No stray dialog-* files left behind

git diff --stat apps/km-tui/src | grep -E 'with-dialogs|board-actions'
# Expected: +1 file created (with-dialogs.ts), ~200 lines removed from board-actions.ts
```

---

## 7. Risk Assessment

### 7.1 Focus Scope Timing

**Risk**: Plugin activates focus scope too early or late, causing Tab navigation to fail.

**Mitigation**:
- Test focus scope transitions in isolation (setup plugin, open dialog, check FocusManager.scopeStack)
- Verify silvery FocusManager Tab dispatch in ink-render.ts is wired (depends on G2)
- If timing is off, add explicit lifecycle hooks (onDialogOpen/onDialogClose)

### 7.2 dialogTargetRef Replacement

**Risk**: Dialog components (DatePromptDialog, UnifiedOmnibox) lose event routing (navUp/navDown/confirm/cancel).

**Mitigation**:
- Plugin registers dialog components as focusables in focus scope
- Focus scope provides methods: `enter()`, `navUp()`, `navDown()`, `confirm()`, `cancel()`
- Fallback: if G2 incomplete, keep dialogTargetRef as adapter until plugin fully wired

### 7.3 Grace Period Logic

**Risk**: isDialogConfirmGracePeriod() called from board-actions.ts but state moved to plugin.

**Mitigation**:
- Store `dialogConfirmedAt` timestamp in plugin model
- Export helper: `isDialogConfirmGracePeriod(model) => (perf.now() - model.dialogConfirmedAt) < 500`
- Update ENTER_INLINE_EDIT handler in board-actions.ts to call plugin helper

### 7.4 Modal Stacking

**Risk**: User opens new item dialog, then opens omnibox—two dialogs visible, focus scope unclear.

**Mitigation**:
- Design: ONE dialog visible at a time (enforce at model level)
- Commands: `openSearch()` auto-closes other dialogs
- Test: verify only one `show*Dialog` flag is true at any time

### 7.5 Dependency Ordering

**Risk**: Plugin defined before other plugins it depends on (e.g., selection plugin for searchScope).

**Mitigation**:
- Dialogs plugin has no dependencies on other domain plugins
- Can be inserted early in chain (after createApp, before board/editor)
- SearchScope references node IDs—those come from selection plugin later, no circular dependency

### 7.6 Test Helper Fragility

**Risk**: Tests mock `UIState` with dialog fields; those fields no longer exist after deletion.

**Mitigation**:
- Update test utils (createInitialPaneUI) to NOT include deleted fields
- Update any test that asserts `ui.showSearchDialog === true` to use plugin selector instead
- Search for all tests that import ui-reducer.ts and update them

---

## 8. Blocking Dependencies (Gates)

| Gate | Status | ETA | Impact |
|------|--------|-----|--------|
| **G1** | `km-silvery.tea-useinput` Phase 2/3 shipped | IN_PROGRESS (P1) | CRITICAL—plugin cannot dispatch commands without `app.commands` tree |
| **G2** | `km-silvery.focus-ink-parity` Phase 1 done | OPEN (P0) | CRITICAL—focus scope inside plugin depends on FocusManager Tab dispatch in ink-render |
| **G3** | `km-all.unified-selection` landed | OPEN | MEDIUM—searchScope references selection (not blocking, can defer) |

**Recommendation**: Block Phase 1 start until G1 and G2 both land (currently 1-2 weeks away).

---

## 9. Future Phases (Context)

- **Phase 2** (withBoard): board-reducer navigation/zoom, board-app.ts pane state
- **Phase 3** (withEditor): text editing, activeEditTargetRef, PlainText.apply
- **Phase 4** (withSelection): unified Selection union, node/text/gap channels
- **Phase 5** (withUndo): UndoStack, startBatch/endBatch, tree+editor batching
- **Phase 6** (withTree): structural ops (nest, lift, delete), atomic Repo.apply
- **Phase 7** (withStorage): watchers, persistence, materialization

Each phase builds on prior plugins; cannot be reordered.

---

## 10. Session Handoff Notes

- Ensure G1 and G2 gates are confirmed before starting
- Create a worktree for Phase 1 work (do not commit to feat/selection-plateau)
- Use `/discuss` before Stage 1 to align on plugin API shape
- Use `/pro-review` before Stage 3 to validate command dispatch patterns
- Keep this plan open during execution; update "Risk Assessment" with real findings

---

**Document generated**: 2026-04-18  
**Prepared by**: Claude Code  
**Ready to execute**: After G1 + G2 land
