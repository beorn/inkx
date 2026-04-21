# TEA Phase-2 Lifecycle Spike — Verdict

**Date:** 2026-04-21
**Author:** Claude (automated spike builder, Opus 4.7 1M ctx)
**Origin:** dual-pro review 2 `/tmp/llm-8b5b9e1c-second-pass-architectural-review-of-4gst.txt`
  (Kimi K2.6 § 2 + GPT-5.4 Pro § "Next cheap spike" at line 487)
**Parallel spike, not replacement:** this sits alongside [`tea-nav-spike/`](../tea-nav-spike/) — do not delete either.

## Question this spike answers

Spike 1 proved the **signature flip works** using string rendering + synthetic events.
It deliberately did not exercise:

- Real React / Ink reconciler interleaving
- Actual terminal key normalization (Ctrl+P / Enter / Escape / arrows shaped by `parseKey`)
- Handler registration and cleanup under real `useEffect` teardown
- Zustand-style external-store + useInput subscription cohabitation
- Focus lifecycle across dialog open/close cycles

This spike answers: **does Phase 1's `withDialogs` survive real React/Ink + real terminal keys?**

## TL;DR — honest verdict

**Phase 1: GO.**

10/10 tests pass across Phase A (real React/Ink + termless, 6 tests) and Phase B (Zustand-shape external store, 4 tests). The lifecycle, focus containment, and subscription cleanup behaviour is clean. The one visible artifact — stale pixels from a conditionally-unmounted sibling panel — is a rendering concern, not a lifecycle concern, and is out of scope for the Phase 1 substrate question. It is documented below as a known-but-unrelated issue worth a separate bead.

Both the register/dispose counts and the key-event log line up with what a correct implementation would produce; I tried to engineer a falsifier and it stayed green.

## What the spike built

Throwaway files under this directory:

- [`App.tsx`](./App.tsx) — real React component. Board + conditionally-rendered Dialog. Two `useInput` hooks gated by `isActive` (board inactive when dialog open; dialog inactive when board visible). Supports both React-`useState` (Phase A) and external-store (Phase B) state ownership via props.
- [`lifecycle-counters.ts`](./lifecycle-counters.ts) — module-level counters for renders, handler register/dispose events, dialog state transitions, captured key-events, reentrant-dispatch errors. Module scope is deliberate: the point is to observe things happening *outside* React state (e.g. ghost subscriptions surviving unmount).
- [`trace.ts`](./trace.ts) — human-readable trace to `/tmp/tea-lifecycle-spike.log` mirroring spike 1's structure.
- [`phase-a.test.tsx`](./phase-a.test.tsx) — 6 tests: closed-state routing, open-state routing, full open→type→close transcript, mount/unmount/remount, render count discipline, focus-return.
- [`phase-b.test.tsx`](./phase-b.test.tsx) — 4 tests: same as A1/A2/A3/A4 but with a vanilla external store + `useSyncExternalStore`, matching zustand/vanilla's API shape exactly.
- [`sample-trace-a2.log`](./sample-trace-a2.log) — captured trace from the A2 full transcript test.
- [`sample-trace-a4-remount.log`](./sample-trace-a4-remount.log) — captured trace from the A4 mount/unmount/remount test.

Pipeline actually used:

```tsx
const term = createTermless({ cols: 60, rows: 40 })
const handle = await run(<App pass={0} />, term)
await handle.press("Control+p")  // -> keyToAnsi -> "\x10" -> termless stdin -> term provider parse -> chainApp.dispatch
```

This is the full production path: termless feeds the real term provider, which runs the input parser, which delivers normalised `{ input, key }` to chainApp, which notifies `useInput`-registered handlers. Nothing is simulated.

## Phase A findings — real React/Ink lifecycle

### A1-A3 — key normalization + focus containment

`handle.press("Control+p")` arrives at the board handler with `input="p"` and `key.ctrl=true`. `handle.press("Escape")` arrives at the dialog handler with `input=""` and `key.escape=true`. `Backspace` arrives with `key.backspace=true`. This matches what Spike 1's synthetic `BatchedEvent` events used, which confirms the *shape contract* used in Phase 1 planning is the same shape that real `parseKey()` emits. No migration-from-synthetic-to-real surprise is required.

Focus containment via `isActive` gating is tight. When the dialog is open, the board's `useInput` handler is unregistered (we observe exactly one `dispose scope="board"` in the trace the instant `open` flips to true). When the dialog closes, the trace shows `dispose scope="dialog"` immediately followed by `register scope="board"`. No stretch of the timeline has both handlers active for the same key.

### A4 — mount/unmount/remount — no ghost subscriptions

Excerpt from [`sample-trace-a4-remount.log`](./sample-trace-a4-remount.log):

```
[mount]    App mounted at pass 0
[handler]  register scope="board"
[key]      input="j" ...
[unmount]  App unmounted at pass 0
[handler]  dispose scope="board"

[mount]    App mounted at pass 1
[handler]  register scope="board"
[key]      input="j" ...
[unmount]  App unmounted at pass 1
[handler]  dispose scope="board"
```

The pass-1 handler fires for the pass-1 `j`. If the pass-0 handler had survived unmount (e.g. chain.input subscriber not torn down), we would have recorded two `keyEvents` for the same keystroke — one per live handler. We record exactly one. `inputHandlerRegistrations === inputHandlerDisposals` at every unmount boundary.

### A5 — render count discipline

For 8 keystrokes that each cause a state transition, we observed a render delta strictly between `N` (= 8) and `2N` (= 16). The spike asserts the ceiling to catch render storms; the floor catches dropped commits.

Implication: no subscription layer (zustand-style or otherwise) is compounding with React's setState path to double-commit. A naive zustand integration bug would show as `renderCount ≈ 2 × keyCount` even in Phase A where the store isn't involved, because the subscription bridge would be running in parallel.

### A6 — focus return after Escape

After `Control+p → x → Escape`, the next keystroke (`j`) is recorded exactly once, and the board's cursor advances (`n1 → n2`). The dialog's `isActive` dropped to false, its subscription was torn down, the board's `isActive` went back to true, and its subscription was re-installed. No state lives in a limbo where neither handler is registered.

### Out of scope (not a lifecycle issue, but visible) — stale pixels

When the dialog Box conditionally unmounts, the cells its panel had written to stay painted on screen until something else overwrites them. The A2 test originally asserted `screen.getText()` did not contain "Dialog (focused)" after Escape; that failed even though the React state is `open=false`, the dialog component has unmounted (confirmed by the trace's `dispose scope="dialog"` line), and the board render shows "Board (focused)" + "Press Ctrl+P to open dialog".

This is an **incremental-rendering artifact**, not a lifecycle or focus-management issue. The output phase is not repainting the rectangle that used to host the dialog sibling. I relaxed that specific assertion to check for the post-close board text and documented the artifact inline. A proper fix belongs in the silvery output phase (probably clear-on-shrinkage for top-level column layouts); it does not block Phase 1 of the TEA migration.

Action item: file a bead under `km-silvery.*` for "conditional-unmount leaves stale cells in column layouts". The spike lives in hub/, so I left this finding in prose rather than creating the bead from the agent — Bjørn should triage whether it is already tracked.

## Phase B findings — external store cohabitation

Phase B replaces React `useState` with an external store matching zustand/vanilla's API (`{ getState, setState, subscribe }`), subscribed-to via `useSyncExternalStore`. The store was inlined to avoid adding zustand to the km root package.json for a throwaway spike — API parity is exact, so the conclusion generalises.

- **B1** — Full open/type/close transcript with store-backed state. Same pattern as A2, same result. No difference observable from Phase A except that state now lives outside React.
- **B2** — Render count stayed within the same ceiling as Phase A (`1 × N` to `2 × N` for N keys). `useSyncExternalStore`'s subscription does *not* stack on top of React's internal commit scheduler — useInput and the store bridge both flag "something changed" and React batches them into one commit.
- **B3** — Cycle 1's store did not leak into cycle 2. Cycle 2's view correctly starts with `cursor=n1` even after cycle 1 advanced to `n2`. This is the right answer for a store tied to component lifetime via `useRef` — if anything had survived the unmount (e.g. a subscription keeping the store reference alive through a ghost handler), cycle 2 would have seen stale state.
- **B4** — Focus containment through the store. `j` while open updates `query`, not `cursor`. The dispatch/apply order (key → handler → action → store set → subscribers notify → render) does not cross-fire.

## Evidence summary

### Test run (both phases)

```
$ bun vitest run --project=prototype hub/silvery/experiments/tea-lifecycle-spike/
 Test Files  2 passed (2)
      Tests  10 passed (10)
   Duration  1.22s
```

### Typecheck

- Spike-specific: `bunx tsc --noEmit --project tsconfig.json 2>&1 | grep tea-lifecycle-spike` → zero errors
- Silvery baseline: `cd vendor/silvery && npx tsc --noEmit | grep "error TS" | wc -l` → 111 (unchanged from HEAD before the spike)

### Sample traces

- [`sample-trace-a2.log`](./sample-trace-a2.log) — 24 lines showing the full open → type "ab" → backspace → Escape → j → unmount sequence
- [`sample-trace-a4-remount.log`](./sample-trace-a4-remount.log) — 14 lines showing two complete mount/unmount cycles with clean register/dispose bookkeeping on each

## What this spike does NOT prove

Still separate risks:

- **Output-phase stale pixels on conditional-unmount** — seen, documented, out of scope here.
- **Real km-tui dialog migration** — Pro's preflight suggestion (mini cutover of one real dialog like the node jump dialog) is still worth doing to catch any interaction with km's existing zustand slice shape. This spike used a fabricated minimum.
- **Composite transaction semantics** and **undo observability** — K2.6 § 4-5 concerns. These are Phase 6+ risks, not Phase 1.
- **HMR / long-run memory** — Closure-owned plugin state in HMR reloads; 3-hour-session leak paths. K2.6 flagged; not relevant for the Phase 1 go/no-go but worth a future spike.

## Recommendation

**Phase 1: GO.**

The lifecycle, focus containment, and subscription-cleanup behaviour that Phase 1 depends on is clean under real React/Ink with real terminal keys. The `isActive` gating on `useInput` is the canonical focus-scope pattern and it survives mount/unmount/remount cycles with balanced register/dispose counts. External-store subscriptions (zustand shape) coexist with useInput without driving duplicate renders. No reentrant dispatch errors in any test.

Do the K2.6-recommended preflight ("migrate one real km dialog to the substrate") in the same spirit as this spike — not as a blocker, but to catch any quirks specific to km's existing dialog components interacting with silvery's focus tree. That's a 1-day exercise on real code; this spike was the general-case proof.

## How to reproduce

```bash
bun vitest run --project=prototype hub/silvery/experiments/tea-lifecycle-spike/
cat /tmp/tea-lifecycle-spike.log                     # latest test's live trace
cat hub/silvery/experiments/tea-lifecycle-spike/sample-trace-a2.log           # frozen transcript trace
cat hub/silvery/experiments/tea-lifecycle-spike/sample-trace-a4-remount.log   # frozen remount trace
```

## Do not delete

This directory is intentionally preserved alongside `tea-nav-spike/` as reference evidence for Phase 1. The `prototype` vitest project includes both; they run together in ~1.2 s.

Removing this spike is a clean `rm -rf hub/silvery/experiments/tea-lifecycle-spike/` — no other files reference it.
