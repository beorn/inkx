---
id: "@km/tui/tea"
aliases:
  - km-tui.tea
  - km-tui-tea
created_by: Bjørn Stabell
created_at: 2026-04-11T00:41:10Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tui.tea
    depends_on_id: km-silvery.tea
    type: parent-child
    created_at: 2026-04-18T10:42:54Z
    created_by: Bjørn Stabell
    metadata: "{}"
  - issue_id: km-tui.tea
    depends_on_id: km-silvery.tea-useinput
    type: blocks
    created_at: 2026-04-15T11:31:28Z
    created_by: Bjørn Stabell
    metadata: "{}"
  - issue_id: km-tui.tea
    depends_on_id: km-tui.atomic-tree-ops
    type: blocks
    created_at: 2026-04-15T08:36:39Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [ ] TEA state machines for km-tui: unified selection + atomic operations @km/tui #feature #P0

blocks:: [[@km/silvery/tea]], [[@km/silvery/tea-useinput]], [[@km/tui/atomic-tree-ops]]

# Refactor Plan: @km/tui/tea — Domain Plugin Migration

## Status (updated 2026-04-21): substrate shipped, production cutover pending

**Earlier versions of this bead opened with "NOT READY TO START — silvery's TEA framework is not shipped." That framing is outdated and contradicted `km-all.tea-discuss` §8. The accurate status is two-part**:

- **Substrate library — shipped ✓.** `@silvery/create` v0.18.x exposes `pipe()`, `createApp()`, `withApp()`, `withCommands`, `withKeybindings`, `withReact`, `withTerminal`, `withFocus`, `withDomEvents`, `withLinks`, `withDiagnostics`, `withRender`. The `@silvery/create/runtime/` substrate (`base-app.ts`, `event-loop.ts`, `with-{input,focus,paste,terminal}-chain.ts`, `lifecycle-effects.ts`) passes 90 contract tests.
- **Production cutover — pending (specific unblocker).** `vendor/silvery/packages/ag-term/src/runtime/create-app.tsx` (2,978 LOC) still uses the legacy `processEventBatch + runtimeInputListeners + handleFocusNavigation + RuntimeContext.on(...)` pattern. Migration to `runEventBatch` on a piped chain is tracked by **`km-silvery.tea-useinput`** (P1). Until that lands, the substrate is bench-tested in isolation but has never been exercised against km's real React reconciler surface (modifier tracking, bracketed paste, focus in/out, error boundaries, reentrant dispatch).

**What Phase 1 specifically blocks on**: `km-silvery.tea-useinput` (production cutover), not "the framework" abstractly. Once `create-app.tsx` runs on `runEventBatch` with the piped substrate, @km/tui/tea Phase 1 becomes unblocked.

**Recommended validation before Phase 1**: a <2-day "dialog precedence spike" or "board nav spike" (see `km-all.tea-discuss` and the dual-pro review notes) — the smallest vertical slice that exercises the real piped runtime, focus precedence, command bridge, plugin-owned state, and effect drain. If that spike lands cleanly, confidence in the 7-phase plan is concrete rather than theoretical.

## Pre-flight gates (must all land before Phase 1)

| Gate | Status | Blocker bead |
|---|---|---|
| **G1a** — substrate library | ✓ shipped | `@silvery/create` v0.18.x + `@silvery/create/runtime/` substrate (90 contract tests) |
| **G1b** — production cutover | pending | `km-silvery.tea-useinput` — `create-app.tsx` → `runEventBatch` on piped chain |
| **G2** — unified selection | ✓ closed | `km-all.unified-selection` — `Selection = TextSelection \| NodeSelection \| GapSelection` on SelectionStore |
| **G3** — atomic tree ops | ✓ closed | `km-tui.atomic-tree-ops` — atomic tree+selection op contract at the repo layer |

All gates live under `km-silvery.selection-focus-plateau` Phases 1–3. Only G1b remains open.

## Current state (blast radius verified)

**Centers of gravity** (LOC):
- board-actions.ts 2934 | state/board-app-store.ts 1814 | board-app.ts 1279 | board-reducer.ts 890 | board-actions-edit.ts 778 | use-board-dialogs.ts 480 | ui-reducer.ts 459 | board-actions-zoom.ts 450 | board-actions-nav.ts 478 | undo/undoable-repo.ts 367

**Where state lives**:
- Board/workspace: `BoardAppState.workspace.panes[]` each with `BoardPaneState` (cursor, foldDepths, rootId, zoomStack, navHistory)
- UI: `ui: UIState`, mutated via `setUI()`
- Selection: `sel: SelectionStore` from `@silvery/selection` — dual `sel.text.*`/`sel.node.*` channels, 226 call sites × 20 files
- Tree: `Repo` wrapped by `UndoableRepo`
- Text editing: `activeEditTargetRef`/`activeEditContextRef` on `@silvery/ag-react` — ref-based, imperative
- Dialogs: `ui.activeDialog` + `dialog-guard.ts` stack + `dialogTargetRef` global
- Undo: `UndoStack` + `UndoableRepo` + batched via `startBatch/endBatch`
- Storage: Repo + watcher + materialization via `board-effect-runner.ts` + `config-persist.ts`/`workspace-persist.ts`

**How dispatches happen**: `createBoardApp()` registers 4 silvery handlers (`term:key/mouse/resize/focus`) → `handleKey` → `command-bridge.processKeyWithContext` → `@km/commands.executeCommand` → `handleKmOp` in board-actions.ts → imperative helpers mutating store/sel/repo/dialog-guard. `board-reducer.ts` is a partial TEA reducer (~15% coverage) for nav only.

## Target state

Pipe convention: **later in `pipe()` = outer in dispatch** (the last plugin added is the outermost wrapper; it sees ops first and may delegate via `prev(op)`). See `km-all.tea-discuss` §2 for the canonical rule.

```ts
const app = pipe(
  createApp(storeParams),
  withDialogs(),   // innermost owned state — modals/overlays with own focus scope
  withSelection(), // unified Selection union
  withEditor(),    // PlainText.apply (inline/title/body-as-text — NOT rich Slate)
  withTree(),      // structural ops
  withBoard(),     // nav, view modes, zoom, fold
  withUndo(),      // middleware wrapping tree + editor
  withStorage(),   // outermost — persist/sync effect lane (added last)
)
```

Views read via `app.useStore(selector)`. Keybindings resolve through `app.cmd.<id>()` (the shipped silvery proxy — see `vendor/silvery/packages/commands/src/with-commands.ts`). Tests drive via `dispatch(op)` or `await app.cmd.<id>()` — no more refs or `sel.text.*`. (Historical design docs sometimes wrote `app.commands.*.fn()`; same concept through the `withCommands` plugin — prefer `app.cmd.<id>()` in new code.)

## Phases (7, sequential, each independently shippable)

Ordering rationale: start with shallowest wrap (dialogs), end with deepest. Undo must ship AFTER what it wraps exists. Storage is outermost, last.

### Phase 1: withDialogs() — shallowest (sets the pattern)

**Type**: **Architectural** (first plugin — requires `/discuss`)

**New**: `plugins/with-dialogs.ts` + `.test.ts`. Model: `{activeDialog, stack, query, consoleOpen, helpVisible}`. Commands: `open_search`, `close_dialog`, `toggle_console`, `show_help`, `open_omnibox`, `push_mode`, `pop_mode`. Focus scope owned by plugin.

**Delete**: `views/use-board-dialogs.ts` (480), `dialog-guard.ts` (116), `dialog-target.ts`, all `dialogTargetRef`/`pushDialogMode`/`popDialogMode`/`resetDialogGuard` call sites, `ui.activeDialog`/`ui.dialogStack` fields on `UIState`.

**/complete**:
- `rg 'dialog-guard|dialogTargetRef|useBoardDialogs|pushDialogMode|popDialogMode' apps/km-tui/src` → 0
- `rg 'activeDialog' apps/km-tui/src/state` → 0
- `bun run test:fast apps/km-tui` green

**Risks**: Focus scope inside plugin must interop with silvery's FocusManager. Blocks on `km-silvery.focus-ink-parity` if silvery `useFocus` integration lags.

### Phase 2: withBoard() — grow partial reducer to 100%

**Type**: **Surgical**

**New**: `plugins/with-board.ts` + `.test.ts`. Ports `BoardNavState` + `Board.apply()` from board-reducer.ts. Adds zoom/viewMode/navHistory ops. Commands: `cursor_up/down/left/right`, `zoom_in/out`, `fold/unfold`, `cycle_view_mode`, `nav_back/forward`, `page_jump`.

**Delete**: `board-reducer.ts` (890), `board-effect-runner.ts` (129), `board-actions-nav.ts` (478), `board-actions-zoom.ts` (450). Nav/zoom/viewMode branches gutted from board-actions.ts. `BoardState.*` nav fields off board-app-store.ts.

**/complete**:
- 4 deleted files gone
- `rg 'handleKmOp.*cursor_|handleKmOp.*zoom_' apps/km-tui/src` → 0
- `rg 'app\.cmd\.(cursor_|zoom_|fold|unfold|cycle_view_mode|nav_|page_jump)' apps/km-tui/src` → >20 sites (board commands now dispatched through silvery's `app.cmd.*` proxy — earlier text said `app\.commands\.board\.`, same concept)
- `wc -l apps/km-tui/src/board/board-actions.ts` < 1500 (was 2934)

**Risks**: `BoardNavState` lives per-pane in `workspace.panes[]`. Plugin must support multi-pane models; verify `@silvery/create` exposes per-scope model pattern (Gate G1 detail).

### Phase 3: withEditor() — PlainText cutover (inline/title/body-as-text)

**Type**: **Architectural** (`/discuss` + `/pro-review`)

**Scope (explicit)**: Phase 3 is a **PlainText cutover only** — inline field edit, title edit, and body edit treated as plain text. It is **NOT the universal/rich editor architecture** (that remains future work — see `docs/future/universal-editor.md` and any downstream `withRichEditor` bead). Rich body editing with Slate/SlateJS-style marks, block structure, and embedded elements is intentionally out of scope here; km reaches the plateau without it, and it lands post-plateau under a separate tracking bead. This scope decision is load-bearing: Phase 3 does not block on any rich-editor design question.

**New**: `plugins/with-editor.ts` + `.test.ts`. Model: `PlainTextState` (cursor, selection, text, mode=inline|body|title — all treated as plain text at this phase). Commands: `enter_edit`, `exit_edit`, `insert`, `delete`, `move_cursor`, `select_all`, `cut`, `copy`, `paste`.

**Delete**: `board-actions-edit.ts` (778), `activeEditTargetRef`/`activeEditContextRef`/`textEditTarget`/`textEditHints` on BoardAppStore, `needsRenderFlush` flag. `InlineEditField.tsx`/`BodyEditField.tsx`/`tree-node-edit.tsx` rewritten to read `app.models.editor` + dispatch `app.cmd.<editor-verb>()` (earlier text: `app.commands.editor.*` — same concept).

**/complete**:
- `ls board-actions-edit.ts` → NOT EXISTS
- `rg 'activeEditTargetRef|activeEditContextRef|needsRenderFlush' apps/km-tui/src` → 0

**Blocker**: `PlainText.apply()` must ship in `@silvery/headless`. If not shipped, phase blocks on a new silvery bead (`km-silvery.headless-plaintext`). Also: `handlers/paste-handler.ts` must move into the plugin.

**Explicitly deferred to post-plateau**: Slate/SlateJS rich body editing, marks (bold/italic/code), inline embedded nodes, multi-level block structure inside a body. See `docs/design/tea.md` "Phase 3: SlateJS integration" — that text describes the eventual universal-editor direction, not this phase.

### Phase 4: withSelection() — unified Selection union (HIGHEST RISK)

**Type**: **Architectural + Mechanical** (`/pro-review` required)

**Key decision (flag a)**: **`withSelection()` absorbs `km-tui.sel-migration`**. The plugin wrap + 226-site mechanical migration must land in the same atomic session — otherwise dual paths persist indefinitely (the exact trap the refactoring lessons warn about). `km-all.unified-selection` stays as Gate G2 (ships the type); Phase 4 ships the plugin wrap + absorbs the mechanical pass from `km-tui.sel-migration` into a single epic session. **No commit leaves both `sel.text.*` and `app.cmd.<selection-verb>()` working.**

**New**: `plugins/with-selection.ts` + `.test.ts`. Model: `Selection = TextSelection | NodeSelection | GapSelection`. Commands: `select_node`, `select_text`, `extend`, `clear`, `toggle`. Normalization hook called by withTree/withEditor after mutations.

**Delete**: `board-selection-helpers.ts` (191), `selection-adapter.ts` (124), `board-actions-selection.ts` (171). All 226 `sel.text.*`/`sel.node.*` sites migrated. `sel: SelectionStore` raw field off BoardAppStore. `textEditHints` folded into TextSelection.

**/complete**:
- `rg 'sel\.text\.|sel\.node\.' apps/km-tui/src` → 0
- 3 helper files gone
- `rg 'app\.cmd\.(select_|extend|clear|toggle)' apps/km-tui/src` → >30 sites (earlier text: `app\.commands\.selection\.`, same concept)

**Risks**: HIGHEST. 20 files × 226 sites. Mechanical migration must land atomically. Undo interaction delicate — selection recorded with undo entry.

### Phase 5: withTree() — structural ops wrapping atomic contract

**Type**: **Surgical** (contract pre-shipped by G3)

**New**: `plugins/with-tree.ts` + `.test.ts`. Thin projection over Repo. Commands: `indent`, `outdent`, `move_up/down`, `delete`, `insert_sibling`, `insert_child`, `reparent`, `toggle_status`. Each calls `Tree.apply(repo, op)` → atomic `[newState, effects]` including selection updates (from G3).

**Delete**: `board-tree-ops.ts` (77), all remaining tree-mutation branches in board-actions.ts, imperative `repo.indentNode()`/`repo.moveNode()` outside plugin.

**/complete**:
- `ls board-tree-ops.ts` → NOT EXISTS
- `rg 'repo\.(indent|outdent|moveNode|deleteNode)' apps/km-tui/src --glob '!**/plugins/**'` → 0
- `wc -l board-actions.ts` < 500 (was 2934) — file may even be deleted entirely

**Risks**: Atomic contract must be GENUINELY atomic. If G3 ships something that splits tree+selection updates, this phase silently reintroduces the bug class the plateau was meant to eliminate.

### Phase 6: withUndo() — middleware wrap

**Type**: **Architectural** (`/pro-review` — undo correctness is notoriously subtle)

**New**: `plugins/with-undo.ts` + `.test.ts`. Wraps `apply()`: intercepts tree/editor ops, computes inverses, stacks them. Commands: `undo`, `redo`. Batches by label.

**Placement**: Later-in-pipe = outer in dispatch (canonical rule). `withUndo()` must see ops BEFORE they hit the tree plugin (record) AND effects AFTER (know what was produced), so it is added **after** `withTree` / `withEditor` in `pipe()` but **before** `withStorage` — i.e., it wraps the inner domain plugins and is itself wrapped by storage. Ships LATE in phase order (depends on tree + editor existing) but OUTER relative to them in composition.

**Delete**: `undoable-repo.ts` (367), `undo/operations.ts`, `undo/index.ts`, `undo-stack.ts`, imperative `startBatch`/`endBatch`/`setCursor`/`setCursorAfter` calls, `UNDO_*` effect types.

**/complete**:
- `undo/` directory + `undo-stack.ts` gone
- `rg 'UndoableRepo|undoStack|startBatch|endBatch' apps/km-tui/src` → 0

**Mitigation**: Write differential tests pinning current undo behavior BEFORE deleting.

### Phase 7: withStorage() — persistence/sync effect lane

**Type**: **Surgical**

**New**: `plugins/with-storage.ts` + `.test.ts`. Owns Repo injection, watches mutations, fires persist effects, tracks `syncStatus`+`dirty`. Commands: `save`, `reload`, `sync_now`.

**Delete**: `normalize-plugins.ts` (absorbed), imperative `repo.save()` calls, residual `workspace-persist` callers. `config-persist.ts`/`workspace-persist.ts` kept as pure serializers fired through plugin effects only. `board-app-store.ts` shrinks to ≤200 LOC (or deleted entirely if all state lives on plugins).

**/complete**:
- `rg 'repo\.save\(' apps/km-tui/src --glob '!**/plugins/with-storage.ts'` → 0
- `wc -l board-app-store.ts` < 300 (was 1814)

**Risks**: File watcher + materialization interaction with apply chain. Reentrancy guard must be honored.

## Phase type classification

| Phase | Type | Flags |
|---|---|---|
| 1 Dialogs | Architectural (first plugin) | /discuss |
| 2 Board | Surgical | — |
| 3 Editor | Architectural (PlainText boundary) | /discuss + /pro-review; blocks on silvery headless |
| 4 Selection | Architectural + Mechanical (226 sites) | /pro-review — HIGHEST RISK |
| 5 Tree | Surgical (contract from G3) | — |
| 6 Undo | Architectural (middleware) | /pro-review |
| 7 Storage | Surgical | — |

## Dependencies

```
G1 (silvery TEA) ──┐
G2 (unified sel)  ──┼─→ Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7
G3 (atomic-ops)   ──┘
```

- Gates G1-G3 block ALL phases
- Phase 1 before Phase 2 (establish pattern on low-risk target)
- Phase 4 before Phase 5 (withTree normalizes selection; needs withSelection)
- Phase 5 before Phase 6 (undo wraps tree ops)
- Phase 6 before Phase 7 (storage is outer lane, should not undo)

## Answers to flagged questions

**(a) Should withSelection() absorb @km/tui/sel-migration?** **YES, absorb.** Separate beads produce the dual-path trap. `km-all.unified-selection` stays as Gate G2 (type only), Phase 4 absorbs the mechanical pass, lands atomically. If tracking reasons require separate beads, they must land in the same epic session with "no commit leaves both patterns working" rule.

**(b) Is silvery's TEA framework ready?** **Substrate library: YES ✓; production cutover: not yet.** Phase 1 blocks specifically on `km-silvery.tea-useinput` closing (migrating `create-app.tsx` from legacy `processEventBatch + runtimeInputListeners + handleFocusNavigation` to `runEventBatch` on a piped chain). It does **not** block on the substrate library, which is shipped and tested. See the "Status" section at the top of this bead for the split gate (G1a / G1b). Earlier versions of this bead said a blanket "NO" — that was a simplification of the actual two-part status and contradicted `km-all.tea-discuss` §8.