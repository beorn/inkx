# TEA Mini-Cutover — HelpOverlay — Phase 1 Readiness Evidence

**Date:** 2026-04-21
**Author:** Claude (automated cutover agent, Opus 4.7 1M ctx)
**Origin:** K2.6 § 6 recommendation in dual-pro review 2 (`/tmp/llm-8b5b9e1c-second-pass-architectural-review-of-4gst.txt`)
**Parallel cutover, not replacement:** complements [`tea-nav-spike/`](../silvery/experiments/tea-nav-spike/) and [`tea-lifecycle-spike/`](../silvery/experiments/tea-lifecycle-spike/) — do not delete either.
**Tracking bead:** `km-tui.tea-phase-0-mini-cutover`
**Parent:** `km-tui.tea` (Phase 1 preflight — NOT part of Phase 1 itself)

## Question this cutover answers

The two prior spikes proved the TEA apply-chain pattern works:

- **Spike 1 (tea-nav-spike)** — signature flip `(msg, state) → [state, effects]` works with string rendering + synthetic events.
- **Spike 2 (tea-lifecycle-spike)** — the pattern survives real React/Ink reconciler + zustand-shape stores + `useSyncExternalStore` cohabitation without double-commits.

What neither spike exercised: **km's real zustand store with its actual shape, km's real command registry, km's real keybindings, and km's actual dialog rendering pipeline.**

This cutover answers: **does the TEA plugin pattern work against km's real infrastructure, not a fabricated minimum, when applied to a single dialog?**

## TL;DR — honest verdict

**Phase 1: GO (with confidence).**

43/43 tests pass across three layers — 24 pure-reducer tests, 16 parity tests covering both legacy and plugin paths under identical assertions, and 3 termless tests that feed full Silvery ANSI through xterm.js WASM. Zero regressions in the broader km-tui fast test suite (2379 passed, 0 failed). Zero new TypeScript errors.

The dual-write feature-flag pattern works cleanly: with `KM_TEA_HELP` unset, the legacy `ui.showHelp` path is untouched; with `KM_TEA_HELP=1`, both paths update in parallel and the React render switches to reading from the plugin store. Behavior is byte-identical from the user's perspective.

The plugin's external store matches zustand/vanilla's API (`getState` / `dispatch` / `subscribe` / `reset`) exactly — the 25-line implementation earns its place by not dragging the full zustand dependency in for one dialog. When Phase 1 lands, the real `withDialogs()` plugin will either use zustand proper or extend this shape uniformly across all dialogs.

## What the cutover built

Production code:

- [`apps/km-tui/src/plugins/with-help-overlay.ts`](../../apps/km-tui/src/plugins/with-help-overlay.ts) — `HelpOp` union, pure `apply(op, state) → [state, effects]` reducer, closure-scoped external store (`createHelpStore`), module-level singleton (`getHelpStore` / `resetHelpStore`), feature-flag reader (`isTeaHelpEnabled`).
- [`apps/km-tui/src/plugins/use-help-overlay.ts`](../../apps/km-tui/src/plugins/use-help-overlay.ts) — React bridge via `useSyncExternalStore` (matches Phase B pattern from tea-lifecycle-spike).
- [`apps/km-tui/src/plugins/HelpOverlayBridge.tsx`](../../apps/km-tui/src/plugins/HelpOverlayBridge.tsx) — feature-flagged render adapter; when `KM_TEA_HELP=1` reads plugin state, otherwise reads legacy props.

Integration points (minimal, surgical):

- [`apps/km-tui/src/board/board-actions.ts`](../../apps/km-tui/src/board/board-actions.ts) — `SHOW_HELP` / `HIDE_HELP` / `HELP_SCROLL_UP` / `HELP_SCROLL_DOWN` branches dual-write to plugin when flag is on. Escape-handler's "close help" branch also dual-writes. **Legacy path is untouched** — the plugin dispatch is an additive `if (flag) …` step before the existing `ctx.setUI()` call.
- [`apps/km-tui/src/views/WorkspaceChrome.tsx`](../../apps/km-tui/src/views/WorkspaceChrome.tsx) — replaced direct `<HelpOverlay>` render with `<HelpOverlayBridge>`; the bridge owns the flag-check and ternary.

Tests (three layers):

- [`apps/km-tui/tests/plugins/with-help-overlay.test.ts`](../../apps/km-tui/tests/plugins/with-help-overlay.test.ts) — 24 tests: reducer semantics for every op × every state, no-op ref stability, store subscribe/unsubscribe/reset, feature flag parsing.
- [`apps/km-tui/tests/plugins/help-mini-cutover.spec.ts`](../../apps/km-tui/tests/plugins/help-mini-cutover.spec.ts) — 16 tests (8 scenarios × 2 paths): open/close, scroll up/down, offset reset on reopen, floor at 0, screen-text presence/absence, plugin subscriber observability, legacy/plugin state equivalence after any action sequence.
- [`apps/km-tui/tests/plugins/help-termless.test.ts`](../../apps/km-tui/tests/plugins/help-termless.test.ts) — 3 tests through the real ANSI pipeline (xterm.js WASM): full open/scroll/close, legacy-only verification, cross-path equivalence check.

## Parity tests — what they verify

Every scenario runs twice under identical assertions, once with `KM_TEA_HELP` unset and once with it set to `1`:

- `?` opens the overlay → `app.state.overlay === "help"` on both paths.
- `Escape` closes it → `app.state.overlay === null` on both paths.
- Opening resets scroll offset (even after a prior close-reopen cycle with scrolling between).
- `j`/`k` update scroll offset — increment/decrement.
- `k` at offset 0 stays at 0 (no negative offsets).
- Help section headers (`NAVIGATION`, etc.) appear in the rendered screen.
- Plugin store's `visible` / `scrollOffset` exactly match `ui.showHelp` / `ui.helpScrollOffset` after any action sequence.

Plugin-only tests (only sensible on the plugin path):

- A subscriber on the plugin store sees every state transition in order: `V@0 → V@1 → V@2 → H@0` for `show → j → j → Escape`.

## What this cutover does NOT prove

Still separate risks for Phase 1:

- **Generic dialog composition** — help has no focus scope, no text input, no dialog-guard interaction, no grace period. The real Phase 1 `withDialogs` plugin will need to own all of those; this cutover doesn't exercise any of them because help doesn't use them.
- **Plugin stacking / ordering** — this is a single plugin living beside the store, not composed via `pipe()`. The lifecycle spike verified the composition shape; this cutover did not re-prove it.
- **HMR / long-run leak paths** — K2.6 § 5 flagged closure-owned plugin state during HMR reloads. Not relevant for Phase 1 go/no-go but worth a future spike before long-run production rollout.
- **Multi-app process contexts** — the singleton pattern is fine today (km-tui runs one app instance per process). When km embeds as a library or hosts multiple workspaces, per-app lifetimes will matter.

## Evidence summary

### Reducer unit tests

```
$ bun vitest run apps/km-tui/tests/plugins/with-help-overlay.test.ts
 Test Files  1 passed (1)
      Tests  24 passed (24)
   Duration  176ms
```

### Parity / integration tests

```
$ bun vitest run apps/km-tui/tests/plugins/help-mini-cutover.spec.ts
 Test Files  1 passed (1)
      Tests  16 passed (16)
   Duration  3.76s
```

### Termless (real ANSI pipeline)

```
$ bun vitest run apps/km-tui/tests/plugins/help-termless.test.ts
 Test Files  1 passed (1)
      Tests  3 passed (3)
   Duration  2.42s
```

### Broader km-tui fast suite (regression check)

```
$ bun vitest run apps/km-tui/tests/ --exclude '**/*.slow.*'
 Test Files  109 passed | 1 skipped (110)
      Tests  2379 passed | 38 skipped (2417)
   Duration  16.13s
```

### TypeScript

```
$ npx tsc --noEmit 2>&1 | grep "error TS" | grep -v vendor/ | wc -l
0
```

### Flag-on suite spot check (dual-write integrity)

```
$ KM_TEA_HELP=1 bun vitest run apps/km-tui/tests/escape-layering.test.ts apps/km-tui/tests/board-selection.spec.ts
 Test Files  2 passed (2)
      Tests  53 passed (53)
```

## Recommendation

**Phase 1 is ready to start.**

The plugin pattern works against km's real store, commands, and render pipeline. The dual-write feature flag strategy is a clean migration tool — Phase 1 can adopt it uniformly for every dialog before committing to the plugin as the sole source of truth. The reducer shape `(op, state) → [state, effects]` slots naturally into the apply-chain substrate that `@silvery/create` already ships.

When Phase 1 begins, three things carry over from this cutover:

1. **The pattern itself** — plugin file with `Op` union + `apply()` + `createStore()`, React bridge via `useSyncExternalStore`, feature-flagged render adapter.
2. **The testing hierarchy** — pure reducer tests (fast, no React), parity tests (both paths under identical assertions), termless tests (real ANSI pipeline).
3. **The dual-write migration strategy** — legacy path always updated, plugin path additively dispatched under flag, render switches via bridge. Zero behavior drift during the migration window.

What Phase 1 must add that help didn't exercise:

- `FocusScope` push/pop (integrating with `dialog-guard.ts`'s scope stack).
- Dialog grace period for Enter key propagation.
- Dialog-target ref wiring (for overlays with text input).
- `pipe()` composition alongside other plugins — ordering matters.

## How to reproduce

```bash
bun vitest run apps/km-tui/tests/plugins/             # all 43 tests, ~10s
KM_TEA_HELP=1 bun km view /some/vault                 # real app with plugin path
bun km view /some/vault                                # real app with legacy path
```

## Do not delete

This evidence doc is intentionally preserved alongside the tea-nav-spike / tea-lifecycle-spike READMEs as Phase 1 preflight material. When Phase 1 completes and `withDialogs()` ships, this doc demotes to `archive/` but stays available as "why we had confidence before Phase 1 started".
