# TEA Cutover — SearchDialog — Plan + Interaction Inventory

**Date:** 2026-04-20
**Bead:** `km-tui.tea-searchdialog-cutover`
**Pattern baseline:** `hub/km/tea-mini-cutover-help-overlay.md`
**Feature flag:** `KM_TEA_SEARCH=1`

## Purpose

HelpOverlay's mini-cutover validated the reducer + external store + bridge pattern
on the easiest possible dialog (no text input, no focus scope, no grace period,
no atomic multi-slice commit). SearchDialog is the first dialog that exercises
all the hard interactions TEA Phase 1 must carry. If the HelpOverlay pattern
survives SearchDialog with no imperative escape hatches, Phase 1's
`withDialogs()` gets real confidence; if it fights the framework, the substrate
needs redesign before the 7-phase migration.

## Interaction Inventory (current SearchDialog behavior to preserve)

### State owned by UI reducer (`ui-reducer.ts`)
- `showSearchDialog: boolean` — visibility
- `searchDialogInitialInput: string` — buffered printable-key before the dialog registered its input layer
- `searchScope: "all" | "selected"` — scope toggle
- `searchScopeNodeIds: string[]` — scope ids (cursor subtree) when scope=="selected"

### State owned locally in SearchDialog.tsx
- `selectedIndex: number` — result-list selection (React.useState)
- `editCtx.value` — text query (via `useEditContext`/`useDialogInput`/TextInput)

### Open path
1. User presses `/` OR dispatches "search" command → action `SHOW_SEARCH_DIALOG`
2. Handler: `pushDialogMode("dialog:search")` (focus scope), `closeDetailPane()`,
   `ctx.setUI({ showSearchDialog: true, searchDialogInitialInput: "",
   searchScope: "all", searchScopeNodeIds: [cursor] })`, `clearSelection`.
3. WorkspaceChrome sees `ui.showSearchDialog` → renders `<CenterDialog focusScope>`
   → `<SearchDialog>`.
4. SearchDialog mounts, calls `useDialogInput({ initialValue: initialInput })`,
   which installs `dialogTargetRef.current = {navUp, navDown, confirm, cancel}`.
5. After first render, `useEffect` clears `searchDialogInitialInput`.

### Key handling while open
- **Printable keys** (letters, digits, symbols): captured by TextInput via
  `useEditContext` → updates `editCtx.value` → `onChange` resets `selectedIndex` to 0.
  NOT routed through command system.
- **Enter**: keybinding → command `dialog.confirm` → action `DIALOG_CONFIRM` →
  `markDialogConfirmed()` (grace period), `popDialogMode()`,
  `dialogTargetRef.current.confirm()` which in turn:
  - `editCtx.target.cancel()` — sets cancelledRef so useEditContext auto-save doesn't double-fire
  - `onConfirm(value)` → `handleSearchSelect(targetNode)` from `use-board-dialogs.ts`:
    navigates the board via `dispatchBoard({type: "ZOOM_IN"})` + `dispatchSelection(...)`
    + `setUI({showSearchDialog: false, searchDialogInitialInput: "", searchScope: "all", searchScopeNodeIds: []})`.
- **Escape**: keybinding → command `dialog.cancel` → action `DIALOG_CANCEL` →
  `popDialogMode()`, `dialogTargetRef.current.cancel()` which:
  - `editCtx.target.cancel()`
  - `onCancel()` → `handleSearchCancel` → `setUI({showSearchDialog: false, ...})`.
- **Arrow Up/Down** (or `ctrl-p`/`ctrl-n`): keybinding → command `dialog.nav_up`/
  `dialog.nav_down` → `dialogTargetRef.current.navUp/Down` → `setSelectedIndex`.
- **Tab** (while `inScope("dialog:search")`): command `dialog.toggle_search_scope` →
  action `TOGGLE_SEARCH_SCOPE` → `setUI({searchScope: prev==='all' ? 'selected' : 'all'})`.
- **Ctrl+A/E/K/U/W**: readline edits → handled by useEditContext/TextInput.

### Close paths (where `showSearchDialog: false` is set)
1. DIALOG_CONFIRM → dialogTargetRef.confirm() → handleSearchSelect → setUI
2. DIALOG_CANCEL → dialogTargetRef.cancel() → handleSearchCancel → setUI
3. DIALOG_CONFIRM/CANCEL fallback (both refs null): direct `setUI({showSearchDialog: false})`
4. "Closest-open dialog" Escape handler in board-actions.ts (Layer 3 contextual escape) → popDialogMode + dialogTargetRef.cancel()

## Plugin design (KM_TEA_SEARCH=1)

### Plugin file: `apps/km-tui/src/plugins/with-search-dialog.ts`

Shape mirrors `with-help-overlay.ts` exactly:

```ts
export type SearchOp =
  | { type: "search.show"; scopeNodeIds: string[]; initialInput?: string }
  | { type: "search.hide" }
  | { type: "search.toggleScope" }
  | { type: "search.setScope"; scope: "all" | "selected" }
  | { type: "search.consumeInitialInput" }

export interface SearchState {
  visible: boolean
  initialInput: string
  scope: "all" | "selected"
  scopeNodeIds: string[]
}

export function apply(op: SearchOp, state: SearchState): [SearchState, Effect[]]
export function createSearchStore(): SearchStore
export function getSearchStore(): SearchStore
export function resetSearchStore(): void
export function isTeaSearchEnabled(): boolean
```

Crucially this plugin does NOT own:
- `selectedIndex` (local, internal UI; migrate in a later phase if useful)
- `editCtx.value` (the actual query text; owned by TextInput; Phase 2+ concern)
- `dialogTargetRef` or `dialog-guard.ts` (keep as-is; the plugin is an
  additive mirror, not a replacement)

This is the SAME discipline HelpOverlay used — the plugin owns the coarse
dialog visibility+scope; the text editor stays in its existing React hook
until a later phase explicitly migrates text input.

### Hook: `apps/km-tui/src/plugins/use-search-dialog.ts`

```ts
export function useSearchDialog(): SearchState {
  const store = getSearchStore()
  return useSyncExternalStore(store.subscribe, store.getState, store.getState)
}
```

Exact mirror of `useHelpOverlay`.

### Bridge: `apps/km-tui/src/plugins/SearchDialogBridge.tsx`

Feature-flag adapter. When `KM_TEA_SEARCH=1`, reads dialog visibility + scope
from the plugin store. Otherwise, reads from legacy props (same as HelpOverlay).
The SearchDialog component itself stays unchanged.

```tsx
export function SearchDialogBridge({
  legacyVisible, legacyInitialInput, legacyScope, legacyScopeNodeIds,
  legacyOnConsumeInitialInput, onSelect, onCancel, width, maxHeight
}): ReactElement | null {
  const { visible, initialInput, scope, scopeNodeIds } = isTeaSearchEnabled()
    ? useSearchDialog()  // MUST be conditionally called → extract to inner component like HelpOverlay
    : { visible: legacyVisible, initialInput: legacyInitialInput, scope: legacyScope, scopeNodeIds: legacyScopeNodeIds }
  if (!visible) return null
  return <SearchDialog .../>
}
```

### Integration in `board-actions.ts`

Dual-write pattern — mirrors the HelpOverlay hooks. For every mutation, when
the flag is on, also dispatch to the plugin store:

- `SHOW_SEARCH_DIALOG`: `if (isTeaSearchEnabled()) getSearchStore().dispatch({ type: "search.show", scopeNodeIds, initialInput: "" })`
- `TOGGLE_SEARCH_SCOPE`: also `{ type: "search.toggleScope" }`
- Close sites (DIALOG_CONFIRM, DIALOG_CANCEL, fallback force-close): also `{ type: "search.hide" }`
- Contextual Escape (`if (ui.showSearchDialog)`): also `{ type: "search.hide" }`

### Integration in `WorkspaceChrome.tsx`

Replace:
```tsx
{ui.showSearchDialog && (
  <CenterDialog ... focusScope>
    <SearchDialog onSelect={dialogHandlers.handleSearchSelect} ... />
  </CenterDialog>
)}
```

With:
```tsx
<SearchDialogBridge
  legacyVisible={ui.showSearchDialog}
  legacyInitialInput={ui.searchDialogInitialInput}
  legacyScope={ui.searchScope}
  legacyScopeNodeIds={ui.searchScopeNodeIds}
  onSelect={dialogHandlers.handleSearchSelect}
  onCancel={dialogHandlers.handleSearchCancel}
  onConsumeInitialInput={() => setUI({ searchDialogInitialInput: "" })}
  termWidth={termWidth}
  contentHeight={contentHeight}
/>
```

The bridge owns the flag-check, CenterDialog wrapping, and SearchDialog render.

## Friction points — predicted and observed

### F1. `useInput` dispatch restriction (from dual-pro review 3 § 4, 8)

**Predicted risk.** HelpOverlay sidestepped this because it has no submit
action. SearchDialog's Enter commit flow goes through `dialog.confirm` command
→ reducer → `dialogTargetRef.current.confirm()` → `onConfirm` callback →
`dispatchBoard + setUI`.

**Observed.** `dispatchBoard` and `setUI` are not `app.dispatch()` (silvery's
TEA substrate) — they're reducer dispatch and signal setters. No Reentrant
dispatch error. Confirmed by reading board-actions.ts:1482-1495.

**Verdict.** Not a friction point for this port. The existing chain is
compatible with the dual-write plugin because the plugin dispatch happens
inside the reducer, not inside a React useInput hook.

### F2. Focus scope / dialog-guard integration (from review § 4)

**Predicted risk.** dialog-guard.ts tracks mode via FocusManager.scopeStack;
the plugin could race with the focus scope push/pop.

**Observed.** The plugin stays additive: it mirrors visibility. We keep
`pushDialogMode("dialog:search")` and `popDialogMode()` intact. The
`inScope("dialog:search")` keybinding when-clauses keep working.
`<CenterDialog ... focusScope>` still installs the scope via silvery.

**Verdict.** Not a friction point for this port. The plugin does NOT try to
own scope stack; that is Phase 1's `withDialogs()` job.

### F3. Enter grace period (markDialogConfirmed)

**Predicted risk.** Enter must either confirm the dialog (dispatching zoom)
OR trigger ENTER_INLINE_EDIT on a post-close frame. The grace period is
imperative time-window state.

**Observed.** Grace period stays in dialog-guard.ts unchanged. The plugin
dispatch happens in the DIALOG_CONFIRM branch BEFORE markDialogConfirmed
(or could be after — order-agnostic since they touch disjoint state).

**Verdict.** Not a friction point. Plugin can leave grace period alone.

### F4. Initial input buffer (searchDialogInitialInput)

**Predicted risk.** A character typed in the same frame as `/` needs to be
buffered and replayed into the dialog's text input on mount. Race-prone.

**Observed.** Currently handled via `initialInput` prop + `useEffect`
consume-on-mount. The plugin mirrors this: `search.show` op takes
`initialInput`; `search.consumeInitialInput` op clears it. The bridge reads
`initialInput` from plugin state when flag is on.

**Verdict.** Not a friction point; just needs care in the op design.

### F5. handleSearchSelect closure (navigation)

**Predicted risk.** onSelect is defined in `use-board-dialogs.ts` with a
stable callback; it takes a KNode. The plugin does NOT own selection or
navigation — those are cross-slice domain ops.

**Observed.** onSelect/onCancel stay as props threaded into the bridge.
Plugin doesn't try to be a selection router. This is deliberate: HelpOverlay
pattern stays narrow (plugin owns its own state, nothing else).

**Verdict.** Not a friction point; unchanged integration seam.

### F6. dialogTargetRef imperative bridge

**Predicted risk.** `dialogTargetRef.current.confirm()` is called from the
reducer — an imperative ref mutation. The plugin doesn't abolish it.

**Observed.** dialogTargetRef stays as the command→component bridge for
nav/confirm/cancel. Phase 1's `withDialogs()` will subsume it. For this
cutover, it's NOT an escape hatch that the plugin introduces — it's an
existing imperative bridge that the plugin doesn't try to replace. Leaving
it alone IS the discipline.

**Verdict.** Pre-existing imperative API. Plugin does not add to or fight
with it.

## Tests

### Parity tests — `apps/km-tui/tests/plugins/search-mini-cutover.spec.ts`
Every scenario runs on both paths under `withBothPaths`:
- show: `app.dispatch("search")` → `app.state.overlay === "search"`
- escape: Escape → overlay null
- scope default is "all"
- Tab toggles scope (scope === "selected" after Tab, "all" after second Tab)
- type query: `for (const ch of "Alpha") app.press(ch)` → dialog still open, editing active
- type query + Enter commits (overlay closes)
- type query + Escape cancels (overlay closes, no navigation)
- arrow down/up moves selectedIndex (best-effort: verify no crash + overlay stays open)
- second open after close: scope back to "all"
- contextual Escape from board layer closes the dialog

Plugin-only tests:
- Subscriber sees every state transition (show → toggleScope → hide)
- Plugin state matches legacy ui state after a complex action sequence

### Unit tests — `apps/km-tui/tests/plugins/with-search-dialog.test.ts`
Reducer semantics for every op × every state (no React).

### Termless tests — `apps/km-tui/tests/plugins/search-termless.test.ts`
- Plugin path: dispatch search → type → Escape (screen clears, no stale cells)
- Legacy path: same sequence
- Cross-path parity on screen text presence/absence

## Elegance baseline (HelpOverlay comparison)

HelpOverlay shipped with these numbers (from `tea-mini-cutover-help-overlay.md`):
- Production files: 3 (with-help-overlay.ts, use-help-overlay.ts, HelpOverlayBridge.tsx)
- LOC: with-help-overlay.ts 213, use-help-overlay.ts 24, HelpOverlayBridge.tsx 61 = 298 total
- Test files: 3 (unit: 24 tests, parity: 16 tests, termless: 3 tests)

SearchDialog target:
- Same 3 production files
- LOC target: comparable (plugin is slightly more complex — 4 fields vs 2 + 5 ops vs 5)
- Same test hierarchy
- **If LOC grows significantly (>50%)** → flag as complexity inflation

## Predicted verdict

Best-case: **clean**. The coupling between plugin-owned state and
React-owned state is well-separated (visibility/scope → plugin; text + selectedIndex → React).
The plugin never has to dispatch from a useInput handler because Enter/Escape/arrows
flow through the reducer, and printable keys go through TextInput (useEditContext).
The plugin additively mirrors the ui state; it does not replace dialog-guard or
dialogTargetRef.

Worst-case: **dirty** if initial-input consumption requires order-sensitive
dispatches across the two paths, or if some close site is missed and the
plugin state desyncs from ui state.

Fought-framework: Would only happen if we tried to make the plugin OWN text
query or selectedIndex; the plan explicitly avoids that scope.
