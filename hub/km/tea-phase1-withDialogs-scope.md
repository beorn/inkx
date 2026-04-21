# Phase 1 — `withDialogs()` — Scope + Dialog Inventory

**Date:** 2026-04-21
**Parent bead:** `km-tui.tea` (Phase 1 gate)
**Baseline pattern:** HelpOverlay (Phase 0 mini-cutover, `KM_TEA_HELP=1`) + SearchDialog (Phase 1 real cutover, `KM_TEA_SEARCH=1`). Verdict: **dirty-but-resolved, GO**.

## TL;DR

Ten UI surfaces in `WorkspaceChrome.tsx` qualify as "dialog/overlay." Two are migrated. Of the remaining eight, **four are small enough to migrate following the SearchDialog pattern** (in-scope for Phase 1), **three are large/architectural enough to earn their own phase** (out-of-scope), and **one is arguably not a dialog at all** (`SyncPane`).

**This session migrates `deleteConfirm`** — the smallest remaining dialog (pure confirm/cancel, no text input, no focus scope complexity). That ships the Phase 1 extension of the HelpOverlay/Search cutover pattern with a third independent proof point. The remaining three in-scope dialogs (`datePrompt`, `filterDialog`, `newItemDialog`) each get a follow-up bead and migrate in subsequent sessions.

## Dialog inventory

Each row: current location in WorkspaceChrome + shape of its UI state + verdict.

### Already migrated

| Dialog | Phase | Flag | Plugin file | Status |
|---|---|---|---|---|
| HelpOverlay | 0 | `KM_TEA_HELP=1` | `plugins/with-help-overlay.ts` | Ship. 2 state fields, 4 ops. |
| SearchDialog | 1 real | `KM_TEA_SEARCH=1` | `plugins/with-search-dialog.ts` | Ship. 4 state fields, 5 ops. Dirty-but-resolved. |

### In scope for Phase 1 — small, same pattern applies

| Dialog | UI state shape | Open/close actions | Verdict |
|---|---|---|---|
| **deleteConfirm** | `{ nodeIds, title, childCount, backlinkCount, hasMetadata? } \| null` | Set by `handleDeleteCard`/`handleDeleteColumn`; confirmed via `DELETE_CONFIRM_EXECUTE`; cancelled via `DELETE_CONFIRM_CANCEL`. | **In-scope, migrated this session.** Simplest non-trivial dialog. No text input, no focus scope (it pre-dates dialog-guard), pure visibility+payload. |
| **datePrompt** | `{ field, nodeIds, currentValue } \| null` | Set by `handleSetDatePrompt`; confirmed via `DATE_PROMPT_CONFIRM` (inside `use-board-dialogs`); cancelled via `DATE_PROMPT_CANCEL`. | **In-scope, follow-up bead.** Has text input via `useDialogInput`, same structural complexity as SearchDialog. Bead: `km-tui.tea-datePrompt-cutover`. |
| **filterDialog** (`showFilterDialog: boolean` + `filterProperties`/`filterText`/`filterCursorRow`/`filterCursorVal`) | boolean + 4 fields | `TOGGLE_FILTER_DIALOG`/cursor actions in reducer | **In-scope, follow-up bead.** 5 fields but no text input. Pattern matches SearchDialog's multi-slice mirror. Bead: `km-tui.tea-filterDialog-cutover`. |
| **showNewItemDialog** | `boolean` (payload derived from cursor) | `SHOW_NEW_ITEM_DIALOG`/`CLOSE_NEW_ITEM_DIALOG` plus `handleNewItemCreate`/`handleNewItemCancel`. | **In-scope, follow-up bead.** Slightly larger because `NewItemDialog` has its own text input + live preview. Bead: `km-tui.tea-newItemDialog-cutover`. |

### Out of scope — too large, own phase

| Dialog | Reason | Tracking bead |
|---|---|---|
| **omnibox** (`ui.omnibox: OmniboxPane \| null`) | ~300 LOC UnifiedOmniboxConnector, owns buffer/results/selectedIndex/keybindings/dispatch shim, has own reducer in `state/omnibox.ts`, 3+ entry points (`:`, `Cmd+K`, `Shift+M`, `item_picker`), sigil routing, recents store. **Migration is its own epic.** | `km-tui.omnibox-unified` (existing) |
| **searchReplace** (`ui.searchReplace: SearchReplaceState \| null`) | Full find/replace state machine — query, replacement, current index, match count, regex mode, case sensitivity. Handlers registered on the store (`_searchReplaceSearchHandler`, `_searchReplaceReplaceHandler`) form a non-trivial cross-component binding. | New bead: `km-tui.tea-searchReplace-cutover` (file it when this comes up). |
| **localSearch / CommandBox find-bar** (`ui.localSearch: LocalSearchState \| null`) | Inline overlay in the bottom command bar, not a centered dialog; wired to find/next/prev keybindings; `_findQueryHandler` registered on the store. Mechanically similar to searchReplace but lives in a different visual slot. | New bead: `km-tui.tea-localSearch-cutover` (file it when this comes up). |

### Not a dialog — skip

| Surface | Why skip |
|---|---|
| **SyncPane** (`ui.showSyncPane`) | Passive status overlay, not modal, no focus scope, no dispatch surface. |
| **ToastStack** | Transient feedback, not modal, own queue abstraction. |
| **CommandBox bottom bar** | Permanent chrome, not modal. |
| **BellState** | Single-frame render trigger, no user-interactive surface. |

## Migration pattern (4-file template)

Inherited unchanged from HelpOverlay + SearchDialog:

1. `plugins/with-<name>.ts` — `<Name>Op` union, `<Name>State` interface, pure `apply(op, state) → [state, effects]`, closure-scoped external store, `getXStore()`/`resetXStore()` singleton, `isTeaXEnabled()` env flag reader.
2. `plugins/use-<name>.ts` — `useSyncExternalStore` React bridge. ~24 LOC. Copy-paste from `use-search-dialog.ts`.
3. `plugins/<Name>Bridge.tsx` — feature-flagged adapter. Legacy-or-plugin prop switch. Owns any positioning/focusScope wrapper that WorkspaceChrome previously inlined.
4. Parity tests in `tests/plugins/`:
   - `with-<name>.test.ts` — pure reducer unit tests (every op × every reachable state)
   - `<name>-mini-cutover.spec.ts` — parity tests via `withBothPaths(name, body)` helper; legacy and plugin paths under identical assertions
   - (Optional for small dialogs) `<name>-termless.test.ts` — real-ANSI-pipeline verification

Integration points:
- Board-reducer (`board-actions.ts`) `case "..."` blocks dual-write: legacy `setUI(...)` unchanged + `if (isTeaXEnabled()) getXStore().dispatch(...)`
- Test helpers (`helpers/board-test.ts`, `helpers/test-app.ts`) add `resetXStore()` to per-test reset block (plugin singletons leak across `isolate:false` tests)
- `WorkspaceChrome.tsx` replaces the inline `{ui.showX && <CenterDialog>...}` block with `<XDialogBridge ...>`

### Co-location discipline (inherited from SearchDialog)

**Rule**: Plugin dispatch for *close* paths must happen co-located with `setUI(closeDialog)` — from the handler callback (e.g., `handleXCancel`), not from the reducer. Reasons live in `hub/km/tea-searchdialog-cutover.md` § F1. For *open* paths, dispatching from the reducer is fine because both transitions are false→true in a single reducer call.

`deleteConfirm` simplifies this: it has no handler callbacks outside the reducer. Its `DELETE_CONFIRM_EXECUTE` and `DELETE_CONFIRM_CANCEL` are both reducer cases, both clear the dialog in the same action, and neither unmounts an imperative ref before the clear lands. So the rule holds vacuously — no handler co-location needed.

## What ships this session

- `plugins/with-delete-confirm.ts` — reducer + store + feature flag (`KM_TEA_DELETE_CONFIRM=1`)
- `plugins/use-delete-confirm.ts` — React bridge
- `plugins/DeleteConfirmDialogBridge.tsx` — feature-flagged render adapter
- Integration: dual-write in `board-actions.ts` (`DELETE_CONFIRM_EXECUTE`, `DELETE_CONFIRM_CANCEL`, `handleDeleteCard`, `handleDeleteColumn`) + wire bridge into `WorkspaceChrome.tsx` + `resetDeleteConfirmStore()` in test helpers
- Tests:
  - `tests/plugins/with-delete-confirm.test.ts` — reducer unit
  - `tests/plugins/delete-confirm-mini-cutover.spec.ts` — parity (both paths)

## Follow-up beads

| Bead | P | Scope |
|---|---|---|
| `km-tui.tea-withDialogs` | P1 | Parent tracker for the whole Phase 1 migration (all in-scope dialogs). Child of `km-tui.tea`. |
| `km-tui.tea-deleteConfirm-cutover` | P2 | This session (landed inside this bead). |
| `km-tui.tea-datePrompt-cutover` | P2 | Follow-up — has text input like SearchDialog, so smaller than omnibox, bigger than deleteConfirm. |
| `km-tui.tea-filterDialog-cutover` | P2 | Follow-up — 5-field mirror, similar to SearchDialog. |
| `km-tui.tea-newItemDialog-cutover` | P2 | Follow-up — has text input. |
| `km-tui.tea-searchReplace-cutover` | P2 | Out-of-scope for Phase 1 initial roll; file if/when withDialogs() shows it's time. |
| `km-tui.tea-localSearch-cutover` | P2 | Same. |

Omnibox migration stays at `km-tui.omnibox-unified` — not forced through `withDialogs()`.
