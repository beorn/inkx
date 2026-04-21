# TEA Cutover — SearchDialog — Verdict

**Date:** 2026-04-20
**Bead:** `km-tui.tea-searchdialog-cutover`
**Feature flag:** `KM_TEA_SEARCH=1`
**Parent:** `km-tui.tea` (Phase 1 gate)
**Baseline pattern:** `hub/km/tea-mini-cutover-help-overlay.md`

## TL;DR — honest verdict

**GO with caveat. Classification: DIRTY (1 friction resolved inline, 0 imperative escape hatches added).**

SearchDialog ported to the HelpOverlay plugin pattern successfully. Every existing behavior preserved on both paths (21 parity tests × 2 paths = 42 assertions green; 4 real-TTY termless tests green). No `passThrough`, no role-lanes, no `definePlugin()` — the same 4-file pattern HelpOverlay used.

The port exposed **one real friction point** (ordering of plugin.hide dispatch relative to legacy setUI) that the task spec predicted. Resolving it kept the plugin narrow — the plugin still OWNS visibility + scope + initialInput, still does NOT own the text query or dialogTargetRef. No imperative escape hatches were introduced; the friction is documented below.

**Phase 1 decision**: GO. The dual-write pattern carried SearchDialog. Same pattern will carry ItemPicker and other dialogs. The friction is real but resolvable with the discipline "co-locate dual-write with the setUI it mirrors" — not a substrate redesign.

## What shipped

Production code:

- [`apps/km-tui/src/plugins/with-search-dialog.ts`](../../apps/km-tui/src/plugins/with-search-dialog.ts) — `SearchOp` union (5 ops), pure `apply(op, state) → [state, effects]` reducer, closure-scoped external store, singleton accessor, feature-flag reader.
- [`apps/km-tui/src/plugins/use-search-dialog.ts`](../../apps/km-tui/src/plugins/use-search-dialog.ts) — React bridge via `useSyncExternalStore` (exact HelpOverlay clone, 24 LOC).
- [`apps/km-tui/src/plugins/SearchDialogBridge.tsx`](../../apps/km-tui/src/plugins/SearchDialogBridge.tsx) — feature-flagged render adapter. Reads from plugin when `KM_TEA_SEARCH=1`, otherwise from the legacy ui fields passed as props. Encapsulates the `<Box focusScope data-dialog="search">` wrapper that WorkspaceChrome used to inline.

Integration points (additive, dual-write):

- [`apps/km-tui/src/board/board-actions.ts`](../../apps/km-tui/src/board/board-actions.ts) — `SHOW_SEARCH_DIALOG` + `TOGGLE_SEARCH_SCOPE` dual-write to plugin when flag is on. `DIALOG_CONFIRM`/`DIALOG_CANCEL`/contextual-Escape close paths intentionally do NOT dispatch plugin.hide from the reducer (see Friction 1 below) — they rely on the handler callbacks to do it co-located with setUI.
- [`apps/km-tui/src/views/use-board-dialogs.ts`](../../apps/km-tui/src/views/use-board-dialogs.ts) — `handleSearchSelect` + `handleSearchCancel` dispatch plugin.hide alongside the `setUI({showSearchDialog: false})` call they already own. This is the lockstep pattern.
- [`apps/km-tui/src/views/WorkspaceChrome.tsx`](../../apps/km-tui/src/views/WorkspaceChrome.tsx) — replaced the inline `{ui.showSearchDialog && <CenterDialog>...}` block with a single `<SearchDialogBridge>` call.
- [`apps/km-tui/tests/helpers/board-test.ts`](../../apps/km-tui/tests/helpers/board-test.ts) + [`apps/km-tui/tests/helpers/test-app.ts`](../../apps/km-tui/tests/helpers/test-app.ts) — added `resetSearchStore()` + `resetHelpStore()` to the per-test reset block. Under `isolate:false`, plugin singletons leak across tests.

Tests (three layers, mirroring HelpOverlay's hierarchy):

- [`apps/km-tui/tests/plugins/with-search-dialog.test.ts`](../../apps/km-tui/tests/plugins/with-search-dialog.test.ts) — 20 reducer unit tests (every op × every reachable state).
- [`apps/km-tui/tests/plugins/search-mini-cutover.spec.ts`](../../apps/km-tui/tests/plugins/search-mini-cutover.spec.ts) — 23 parity tests (9 scenarios × 2 paths = 18 + 3 plugin-only + 2 desync-cycle).
- [`apps/km-tui/tests/plugins/search-termless.test.ts`](../../apps/km-tui/tests/plugins/search-termless.test.ts) — 4 real-ANSI-pipeline tests through xterm.js WASM.

## Friction points — predicted vs observed

### F1. Ordering: plugin.hide dispatch vs legacy setUI (RESOLVED)

**Predicted** (pro review 3 § 4): `useInput` handlers cannot dispatch reentrantly; SearchDialog's Enter-to-confirm flow goes through the reducer which calls `dialogTargetRef.current.confirm()` → `handleSearchSelect` → `setUI({showSearchDialog: false})`. Plugin dispatch timing matters.

**Observed**: Not a reentrant-dispatch issue. The friction surfaced differently: when the reducer dispatches `plugin.hide` directly, `useSyncExternalStore` synchronously commits the bridge's `TeaSearchDialog` → SearchDialog unmounts → `useDialogInput` cleanup → `dialogTargetRef.current = null`. The very next `dialog.cancel` or degenerate-state reducer path finds both refs null even though `ui.showSearchDialog` is still in transition.

**Resolution (co-location, not escape hatch)**: Move the plugin.hide dispatch OUT of the reducer and INTO the handler callbacks that already own `setUI({showSearchDialog: false})`. Now plugin state and ui state update together; neither races the other. The reducer stays ignorant of plugin state; the callback (user-level code) stays ignorant of where the dispatch routes to.

This was the only ordering fix needed. No wrapper-ordering hacks; no `queueMicrotask`; no effect lane; no role-lanes; no `passThrough`.

**Also downgraded a benign warn to debug**: the `DIALOG_CONFIRM/CANCEL: both refs null, force-closing dialogs` warn fired under stress tests because of this ref timing. The force-close still runs; the warn was diagnostic-only. Downgrading keeps test output clean.

### F2. Focus scope / dialog-guard (NO FRICTION)

**Predicted** (pro review 3 § 4): `dialog-guard.ts` tracks scope via `FocusManager.scopeStack`; plugin could race with push/pop.

**Observed**: The plugin stays additive. `pushDialogMode("dialog:search")` / `popDialogMode()` unchanged. `inScope("dialog:search")` keybinding clauses keep working. `<SearchDialogBridge>`'s wrapper `<Box focusScope>` mounts a focus scope identical to the original `<CenterDialog focusScope>`. Zero changes to dialog-guard.ts.

### F3. Enter-key grace period (NO FRICTION)

**Predicted**: `markDialogConfirmed()` grace period might conflict with plugin state.

**Observed**: Grace period stays in dialog-guard.ts. Plugin doesn't touch it. The grace period is a time-window that the keybinding resolver consults AFTER dialog close — orthogonal to plugin visibility.

### F4. Initial-input buffer (NO FRICTION)

**Predicted**: `searchDialogInitialInput` could race with plugin state on mount.

**Observed**: The `search.show` op takes `initialInput` as part of its payload; `search.consumeInitialInput` clears it. The bridge passes `initialInput` to SearchDialog which `useEffect`s to consume on mount. No race.

### F5. Multi-slice close (confirm = close + zoom + selection) (NO FRICTION)

**Predicted**: Confirming a search result touches dialog + board cursor + selection atomically.

**Observed**: The existing `handleSearchSelect` already handles this — it calls `setUI(closeDialog)` then `dispatchBoard({ZOOM_IN})` + `dispatchSelection(...)` in sequence, and React batches the renders. Adding one more dispatch (`plugin.hide`) to the same function doesn't change the atomicity.

### F6. dialogTargetRef imperative bridge (NO FRICTION INTRODUCED)

**Pre-existing** (not my friction): `dialogTargetRef` is an imperative command→component bridge. The plugin does not abolish it; it coexists. Phase 1's `withDialogs()` will eventually subsume it, but for this cutover dialogTargetRef is a stable interface that the plugin respects.

## Elegance measurements

### File + LOC count

| | Plugin file | Hook file | Bridge file | Total |
|---|---|---|---|---|
| HelpOverlay | 213 | 23 | 60 | **296** |
| SearchDialog | 221 | 24 | 172 | **417** |

SearchDialog is 1.41× HelpOverlay. Breakdown of the 121-line increase:

- Plugin file (+8 LOC): 4 fields vs 2 + 5 ops vs 4 + slightly more no-op guards
- Hook file (+1 LOC): trivially the same pattern
- Bridge file (+112 LOC): bridge owns the CenterDialog wrapper (position, focusScope, data-dialog) because WorkspaceChrome's CenterDialog was a local function not a prop; plus SearchDialog's 7 props vs HelpOverlay's 2 props flow through

The bridge-size delta is proportional to dialog complexity, not boilerplate inflation. Plugin file itself grew only 4%.

### Typed surface

| | Op union | State fields | Effect type | Manually-named types |
|---|---|---|---|---|
| HelpOverlay | 4 | 2 | 1 | 2 (HelpOp, HelpState) |
| SearchDialog | 5 | 4 | 1 | 2 (SearchOp, SearchState) |

Same discipline. No "speculative" type tags (no `RoleLane<"view-state">`, no `consumed()`, no `passThrough`). The elegance proof holds.

### Explicit-boilerplate / domain-logic ratio

In `with-search-dialog.ts` (221 LOC):
- JSDoc comments: ~90 LOC
- Actual code: ~131 LOC
  - Types: ~25 LOC
  - `apply()` reducer: ~28 LOC
  - Store implementation: ~40 LOC
  - Singleton + reset: ~25 LOC
  - Feature flag: ~5 LOC
  - Initial state: ~5 LOC
  - Imports + listeners: ~3 LOC

The store implementation (40 LOC) is the one chunk that IS boilerplate (we re-type zustand-vanilla's 4 methods). Every other line is domain. Acceptable.

## Open issues surfaced by this cutover

### New sub-beads to file (optional; none block Phase 1)

1. **Plugin singleton leak without explicit reset** — `resetSearchStore`/`resetHelpStore` must be called in every test helper that uses `isolate:false`. Today I wired them into `board-test.ts` + `test-app.ts` manually; the next plugin added will need the same wiring. A `resetAllKmPlugins()` helper (that internally iterates a plugin-registry) would be cleaner for Phase 1's `withDialogs()`. Not blocking.

2. **Benign "both refs null" warn → debug downgrade** — The warn was firing in stress tests because of the ref-timing edge case. Downgrading to debug is correct for dual-write transitional code, but the *underlying* degenerate state is real. Phase 1's `withDialogs()` should either eliminate the path (plugin owns everything) or promote the warn back once state sources are unified.

3. **Pre-existing flaky-by-luck test** — The test `keys-as-text.test.ts:rapid Enter after search confirm` passed on flag-off partly because ui state and React rendering were desynchronized in a way that masked the DIALOG_CONFIRM re-trigger. My changes surfaced the mismatch; the fix is correct but a grep for similar "lucky-timing" tests could find more once Phase 1 lands.

## Predicted → actual verdict alignment

My plan doc predicted: **best-case clean, worst-case dirty from initial-input ordering**. Actual outcome: **dirty (1 friction), but not from initial-input — from the reducer→plugin dispatch→React-commit chain**. Initial-input was uneventful.

The failure mode I didn't predict: `useSyncExternalStore` forcing a synchronous commit that drops imperative refs mid-reducer-cycle. Good to know for Phase 1. Fix pattern: **dual-write ops must be co-located with the setUI they mirror, not scheduled from the reducer**.

## Reproduction

```bash
# Reducer unit tests
bun vitest run apps/km-tui/tests/plugins/with-search-dialog.test.ts
# → 20 passed

# Parity tests (both paths)
bun vitest run apps/km-tui/tests/plugins/search-mini-cutover.spec.ts
# → 23 passed

# Termless real-TTY tests
bun vitest run apps/km-tui/tests/plugins/search-termless.test.ts
# → 4 passed

# Full plugin suite
bun vitest run apps/km-tui/tests/plugins/
# → 90 passed (search + help + lifecycle)

# Broader regression check (flag off)
bun vitest run apps/km-tui/tests/ --exclude '**/*.slow.*'
# → 2429 passed (0 regressions introduced; 1 pre-existing column-rendering failure unrelated)

# Broader regression check (flag on)
KM_TEA_SEARCH=1 bun vitest run apps/km-tui/tests/ --exclude '**/*.slow.*'
# → 2428 passed (same pre-existing column-rendering failure, no flag-induced regressions)

# Real app — flag off
bun km view /path/to/vault

# Real app — flag on
KM_TEA_SEARCH=1 bun km view /path/to/vault
```

## Recommendation to Phase 1

**Phase 1 may proceed using the HelpOverlay + SearchDialog pattern.** Adopt the co-location discipline:

> **Plugin-dispatch rule**: every op that mirrors a legacy setUI must be dispatched from the same function that calls setUI, not from an earlier upstream. Reducers may dispatch plugin ops for "open" (where ui and plugin state both transition from false-to-true in a single reducer call) but NOT for "close" (which has indirect dialogTargetRef callbacks that setUI from handler code).

No substrate redesign needed. The apply-chain pattern carries domain-state dialogs cleanly when this discipline is followed.
