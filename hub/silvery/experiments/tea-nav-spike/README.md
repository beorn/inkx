# TEA Board-Nav Confidence Spike — Verdict

**Date:** 2026-04-21
**Author:** Claude (automated spike builder)
**Origin:** dual-pro review `/tmp/llm-8b5b9e1c-architectural-review-of-kms-3zlv.txt` ($3.83, GPT-5.4 Pro + Kimi K2.6)
**Bead context:** user reported "I'm not yet confident in the TEA shape and flows" before committing the 7-phase `km-tui.tea` migration.

## Question this spike answers

> Can the silvery apply-chain substrate (`@silvery/create/runtime/`) carry km's existing pure reducer code cleanly, or does the `apply(op) -> false | Effect[]` signature fight the native `(state, op) -> [state, effects]` shape?

If the spike feels clean, **proceed to km-tui.tea Phase 1**. If it fights the framework, **abort and re-design** before committing 7 phases.

## TL;DR — honest verdict

**Feels clean and ready for Phase 1**, with two friction points Bjørn should see before starting the real migration.

11 tests pass across two files. Zero spike TypeScript errors. Silvery tsc baseline unchanged (111 → 111). Render-count discipline held — each logical operation produced exactly one `render` effect; no accidental double-renders. Trace log is readable end-to-end and directly shows precedence playing out.

Both friction points are **small API fit-and-finish issues, not architectural flaws**. They are captured below and worth addressing before or during Phase 1.

## What the spike built

Throwaway plugins under this directory:

- [`with-board-spike.ts`](./with-board-spike.ts) — wraps km's production `applyNavigation` from `apps/km-tui/src/board/board-reducer.ts` in the silvery apply-chain shape. **Important:** it imports the real reducer, not a copy, so the test exercises the actual code path a km migration would reuse.
- [`with-dialog-spike.ts`](./with-dialog-spike.ts) — focus-scope dialog plugin with closure-owned `{ open, query, caret }` state. Consumes printables/arrows/backspace/escape when open; passes Enter through so commands can translate it.
- [`with-commands-spike.ts`](./with-commands-spike.ts) — minimal keybinding plugin. Binds `Ctrl+P` → `dialog:open`, `j` → `cursor_down` (closed), `Enter` → `cursor_down` (open).
- [`trace.ts`](./trace.ts) — per-plugin instrumentation that logs `op type / decision (handled|passed) / effects` to `/tmp/tea-spike-trace.log`.
- [`phase1.test.ts`](./phase1.test.ts) — 7 tests: signature flip works, effects flow through drain queue, runEventBatch delivers keys, trace is readable.
- [`phase2.test.ts`](./phase2.test.ts) — 4 tests: dialog-precedence transcript, closed-state fallthrough, open-state swallow, precedence visible in trace.
- [`sample-trace-transcript.log`](./sample-trace-transcript.log) — captured trace from the Phase 2 transcript test, for inspection.

Pipeline composed in the test harness:

```ts
pipe(
  createBaseApp(),
  withTerminalChain(),      // modifier observer, resize, focus lifecycle
  withInputChain,           // fallback useInput store
  withBoardSpike(),         // cursor_down/cursor_up -> applyNavigation
  withDialogSpike,          // focus scope: consumes keys when open
  withCommandsSpike({ dialog }),  // key -> dispatch effect
)
```

## Phase 1 findings — signature flip

**Does `apply(op) -> false | Effect[]` fit km's `(state, op) -> [state, effects]` cleanly?**

Yes, and the translation is mechanical:

```ts
// Inside withBoardSpike's apply:
if (isSpikeOp(op)) {
  const { state: next, effects } = applyNavigation(state, navOp)
  state = next
  return [...effects.map(toRunnerEffect), { type: "render" }]
}
return prev(op)
```

Three observations:

1. **Closure state is easy to inspect.** The plugin exposes `app.board.state` via a getter — tests and view code get direct read access with zero ceremony. Pro's concern that "plugin state is hard to inspect (closures make debugging impossible)" did not materialize.
2. **Effect translation is trivial.** km's `BoardEffect` discriminated union maps one-to-one to tagged runtime `Effect` objects. The spike prefixes them with `board:` for traceability. No information is lost.
3. **`noChange` is honest.** When `applyNavigation` returns `{ effects: [] }`, the spike appends a single `render` effect so the view redraws — but no stale `board:SELECT` leaks. The reducer's own no-change discipline carries through the signature flip intact.

## Phase 2 findings — dialog precedence

**Does focus-scope dialog precedence work without ordering hacks?**

Yes, and the ordering turned out to be **derivable from intent, not folklore** — contradicting Pro's concern #2 about "effective precedence is not derivable from pipe order alone."

Composition order that worked:

```
dialog OUTER of commands OUTER of board
```

Read this as: the dialog (installed last in `pipe()`, so outermost wrapper) sees ops first. When open, it consumes printables and returns `[]` — downstream plugins (`withCommandsSpike`, `withBoardSpike`) never see the key. When closed, it returns `false` for every input:key — the chain short-circuits through to `commands`, which translates `j` into a `dispatch` effect.

The trace log ([`sample-trace-transcript.log`](./sample-trace-transcript.log)) makes this visible line-by-line. Excerpt from the `'a'` keystroke while dialog is open:

```
[withCommandsSpike] op=input:key decision=passed downstream=handled-downstream(1 fx)
[withDialogSpike]   op=input:key decision=handled effects=render
```

Commands sees the `a` (because commands is outer-of-dialog in my build) and passes through; dialog consumes it and emits `render`. Board is never called. That's one-line visibility into precedence.

The transcript test (`open → 'ab' → Left → 'X' → Enter → Escape → 'j'`) produces the expected outcome:

- `query === "aXb"` ✓
- board moved exactly twice total (Enter inside + `j` after close) ✓
- Escape closed the dialog ✓
- `j` works again after close ✓
- render count === 8 (one per logical op — no doubles) ✓

## Friction points worth capturing

### Friction 1 — `useInput` handlers cannot emit effects

`with-input-chain.ts` defines the handler signature as `(input, key) => void | "exit"`. If a km hook tries to call `app.dispatch(...)` from inside its handler, the substrate throws `Reentrant dispatch`. The spike discovered this on first run — the console.error gate even promoted it to a test failure.

**The idiomatic substrate shape** is a keybinding **plugin** that returns `[{ type: "dispatch", op }]` as an effect, letting the drain queue handle the re-entry. That's what `withCommandsSpike` does and it works cleanly.

**Implication for km migration:** any direct `app.dispatch()` call from inside a React `useInput` handler will fail at runtime. The command migration needs to route keys through a plugin lane, not via handlers calling `dispatch`. This is what `km-tui.tea` Phase 2 (`withCommandsMinimal`) already proposes — but the discovery here is that it is a **hard constraint**, not a style preference.

### Friction 2 — Effect spread overwrites `type` discriminator

First draft of `withBoardSpike` did:

```ts
return { type: `board:${eff.type}`, ...eff }  // eff.type clobbers!
```

The spread reinstates `eff.type` (e.g. `"SELECT"`) on top of `"board:SELECT"`. The trace log showed `effects=SELECT, render` instead of `board:SELECT, render`. Fixed by destructuring:

```ts
const { type: innerType, ...payload } = eff
return { type: `board:${innerType}`, payload }
```

**Implication for km migration:** km's `BoardEffect` types carry `type` as the discriminator. Any translation layer that wraps these effects as runtime `Effect`s MUST destructure the inner `type` rather than spread. A lint rule or a small helper `wrapEffect(namespace, eff)` would prevent the footgun.

## Evidence summary

### Test run (before final commit)

```
$ bun vitest run --project=prototype hub/silvery/experiments/tea-nav-spike/
 Test Files  2 passed (2)
      Tests  11 passed (11)
   Duration  212ms
```

### Typecheck

- Spike-specific: `bunx tsc --noEmit` → zero errors under `hub/silvery/experiments/tea-nav-spike/`.
- Silvery baseline: `cd vendor/silvery && npx tsc --noEmit | grep "error TS" | wc -l` → 111 (unchanged from HEAD).

### Trace log (`sample-trace-transcript.log`) — 22 lines of precedence evidence

The transcript test (`open → 'ab' → Left → 'X' → Enter → Escape → 'j'`) produces an end-to-end trace where you can read every plugin's decision for every op. Two examples:

- **Enter while dialog open:** commands sees first → `decision=handled effects=dispatch` → nested `cursor_down` op re-enters → board handles → `effects=board:SELECT, render` → dialog & commands both see `cursor_down` as passed-through.
- **Escape:** commands passes → dialog handles → `effects=render`.

There is no plugin-ordering surprise. Precedence is exactly what `pipe()` order predicts.

## Recommendation

**Proceed with km-tui.tea Phase 1.** The substrate wrapping behaviour of silvery's apply-chain fits km's pure-reducer shape, plugin-owned state is inspectable, effect drain works, trace is readable, and precedence is derivable from `pipe()` order in the scenarios the spike exercised.

The two friction points (`useInput` can't dispatch; effect-type spread footgun) should be addressed in Phase 1:

1. Document (in silvery) that keybinding -> dispatch must go through a plugin lane, not a `useInput` handler.
2. Ship a small `wrapEffect(namespace, eff)` helper in `@silvery/create` so km domain plugins don't reinvent the destructure pattern.

## Out of scope — what this spike does NOT prove

Per GPT-5.4 Pro's warnings, production cutover risk lives in:

- Hook registration / cleanup under real React mount/unmount
- Modifier tracking and focus lifecycle vs the legacy `RuntimeContext.on` bus
- 226-call-site selection migration (Phase 4)
- Undo observability across plugins (Phase 6)

None of those were exercised. The spike deliberately used a raw string render (not React), zustand was bypassed, and the board state was closure-owned for inspection simplicity. These are separate risks — the spike only proves that the **substrate shape** can carry km logic, not that the **full migration** is low-risk.

## How to reproduce

```bash
bun vitest run --project=prototype hub/silvery/experiments/tea-nav-spike/
cat /tmp/tea-spike-trace.log | tail -40   # latest test's trace
cat hub/silvery/experiments/tea-nav-spike/sample-trace-transcript.log  # frozen transcript trace
```

## Do not delete

Bjørn asked in the prompt: keep this spike as reference so he can inspect Monday. This directory is intentionally preserved under `hub/silvery/experiments/` (not `hub/silvery/prototype/` where typed-pipe etc. live, to keep the "throwaway validator" status visible). `vitest.config.ts` and `tsconfig.json` untouched aside from one include pattern extension — removing this spike is a clean revert of that one change plus `rm -rf hub/silvery/experiments/tea-nav-spike/`.
