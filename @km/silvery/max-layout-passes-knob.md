---
aliases:
  - single-pipeline-mode
  - "@km/silvery/maxconvergencepasses-knob"
  - km-silvery.single-pipeline-mode
  - km-silvery-single-pipeline-mode
created_at: 2026-05-06T23:56:42.717Z
id: "@km/silvery/max-layout-passes-knob"
closed_at: 2026-05-07T01:00:01.181Z
closeReason: "Shipped (silvery 65747dc7 + km c20fb5ca1): singlePassLayout:
  boolean → maxLayoutPasses: number. Two structurally-identical loop bodies in
  doRender unified into one bounded layout-pass loop. Default cap =
  MAX_CONVERGENCE_PASSES (2, production-derived structural bound).
  MAX_CLASSIC_LOOP_ITERATIONS deleted; INITIAL_RENDER_MAX_PASSES (5) added for
  first-render hook stabilization. ConvergenceLoopName 4→3 entries.
  assertBoundedConvergence(passCount, loopName, cap) takes cap explicitly. ~30
  call sites migrated. Bounded-convergence tests 16/16 pass. Production km-tui
  driver works correctly."
---

# [x] Silvery: replace singlePassLayout flag with maxLayoutPasses number ^single-pipeline-mode

Replace `singlePassLayout: boolean` with `maxLayoutPasses: number`. One knob, one variable, the actual underlying mechanism. Unify the two structurally different loop bodies in `renderer.ts` (singlePass at 732-848, classic at 856-928) into ONE bounded layout-pass loop with a cap parameter.

Naming: `maxLayoutPasses` preserves existing internal vocabulary (`MAX_CONVERGENCE_PASSES`, `pass-cause.ts`, `pass++` in the loop) and is honest about what the caller is bounding — layout passes, not internal convergence implementation.

## Why

The flag dispatches between two pre-baked configs (`singlePassLayout: true` → 2-pass cap, `: false` → 5-pass cap with different loop structure). That's a boolean wrapping a number wrapping a code-path choice — three abstractions for what should be one knob.

The structural insight from `@km/silvery/renderer-convergence-by-design` (closed 2026-04-27): `MAX_CONVERGENCE_PASSES = 2` (1 initial + 1 settle) is the production-derived bound. Any extra iteration is a feedback-edge bug, not a feature. The classic loop's wider cap (=5) was a heuristic safety margin for virtualizer/scroll envelopes — kept because scaling-down felt risky.

Now that the silvery agent has landed deferred `useBoxRect` (committed-rect-is-batch-invariant per the new CLAUDE.md guidance), reading rects + writing layout-affecting props is structurally safe. Convergence terminates in one pass by construction. The classic loop's extra iterations are dead code.

ONE knob exposes the actual mechanism:

- `maxLayoutPasses: 2` (default) — production-matching: initial + 1 settle, the structural bound.
- `maxLayoutPasses: 5` — legacy stabilization for tests that depend on multi-iteration settling (deprecated path).
- Setting < 2 breaks responsive layout (no settle pass for measurement feedback); clamp to 2 with a warning.

## API

```tsx
// vendor/silvery/packages/ag-term/src/renderer.ts
export interface RenderOptions {
  /** Max layout passes per render. Default: MAX_CONVERGENCE_PASSES (2 — production-derived structural bound). */
  maxLayoutPasses?: number
  // singlePassLayout: REMOVED
}
```

## Approach

1. Delete `singlePassLayout: boolean` from `RenderOptions`, `RenderInstance`, and `isStore` discriminator.
2. Delete `MAX_CLASSIC_LOOP_ITERATIONS` from pass-cause.ts.
3. Unify the two loop bodies in `doRender()` into ONE bounded loop. Loop body: `runPipeline + flushSyncWork`; exit when no React commit happened OR when `pass >= maxLayoutPasses`.
4. Default `maxLayoutPasses = MAX_CONVERGENCE_PASSES` (= 2). Clamp to >= 2 with a warning if caller passes lower.
5. Migrate ~30 call sites:
   - `singlePassLayout: true` → drop entirely (now default behavior)
   - `singlePassLayout: false` (default in some test renderers) → opt into `maxLayoutPasses: 5` if the test was relying on multi-iteration stabilization
6. Tests that genuinely need stabilization use explicit `maxLayoutPasses: N`.

## Files in scope

- vendor/silvery/packages/ag-term/src/renderer.ts (unify loops, replace flag)
- vendor/silvery/packages/ag-term/src/runtime/pass-cause.ts (delete MAX_CLASSIC_LOOP_ITERATIONS)
- vendor/silvery/tests/contracts/render-defaults.contract.test.tsx
- apps/km-tui/src/driver.ts
- apps/km-tui/tests/helpers/{board-test,real-board}.ts
- apps/km-tui/tests/{card-bg-inheritance,windowing-wire,render-cyan-strip-skeleton-transition.slow}
- apps/silvercode/src/test/{render-harness,render-resumed-session}.tsx
- apps/silvercode/tests/lib/stability.ts
- apps/silvercode/tests/{render-resumed-session-helper,welcome-no-layout-jump,visual/markdown}

## Acceptance

- `singlePassLayout` symbol gone
- `MAX_CLASSIC_LOOP_ITERATIONS` gone; only `MAX_CONVERGENCE_PASSES = 2` remains
- One unified layout-pass loop in renderer.ts (delete the duplicate)
- `bun run test:fast` and `bun run test:vendor` green
- Real-TTY: `bun km view` and `bun silvercode` smoke-tested
- Updated docs reference `maxLayoutPasses` not `singlePassLayout`

## Tracks

- @km/silvery/renderer-convergence-by-design (closed 2026-04-27) — established structural bound
- silvery agent deferred-rect work (in flight 2026-05-06) — the structural safety that makes max=2 sufficient

User design calls (2026-05-06):
- "instead of singlePassLayout — why not just pass in the max convergence passes? by default it is MAX_CONVERGENCE_PASSES, but you can set it to 1 or whatever too — not two things, just one variable."
- "perhaps call it maxLayoutIterations / maxLayoutPasses" → settled on maxLayoutPasses (preserves pass-cause.ts vocabulary).

## Why

The flag is an opt-in escape hatch that's been spreading: km-tui driver, ~30 test helpers and apps/silvercode harnesses all pass `singlePassLayout: true` to match production. Production has always done single-pass-per-batch with `MAX_CONVERGENCE_PASSES=2` (1 initial + 1 settle, structurally derived per pass-cause.ts).

The dual mode masks bugs: tonight's 88↔120 oscillation in apps/silvercode/src/components/Content.tsx Row is a multi-frame production flicker. A multi-pass test renderer wraps the loop and emits only the post-stabilization frame — tests stayed green, production flickered.

Closing `@km/silvery/renderer-convergence-by-design` (2026-04-27) made the production loop bound = 2 by structure. Test parity is the next move.

## Approach

1. Delete `singlePassLayout: boolean` from `RenderOptions`, `RenderInstance`, and `isStore` discriminator.
2. Replace `instance.singlePassLayout` branches in `doRender()` with the single-pass body (renderer.ts:732-848).
3. Delete the classic loop body at renderer.ts:856-928 and `MAX_CLASSIC_LOOP_ITERATIONS` constant in pass-cause.ts.
4. Provide `app.settle({ maxTicks: 5 })` for tests that need explicit stabilization. Default behavior: render-as-production; caller awaits more ticks if needed.
5. Migrate ~30 call sites: drop `singlePassLayout: true` (now default and only mode); add explicit `await app.settle()` where tests previously assumed multi-pass stabilization.

## Files in scope

- vendor/silvery/packages/ag-term/src/renderer.ts (delete branches + flag)
- vendor/silvery/packages/ag-term/src/runtime/pass-cause.ts (delete MAX_CLASSIC_LOOP_ITERATIONS)
- vendor/silvery/tests/contracts/render-defaults.contract.test.tsx
- apps/km-tui/src/driver.ts
- apps/km-tui/tests/helpers/{board-test,real-board}.ts
- apps/km-tui/tests/{card-bg-inheritance,windowing-wire,render-cyan-strip-skeleton-transition.slow}
- apps/silvercode/src/test/{render-harness,render-resumed-session}.tsx
- apps/silvercode/tests/lib/stability.ts
- apps/silvercode/tests/{render-resumed-session-helper,welcome-no-layout-jump,visual/markdown}

## Acceptance

- `singlePassLayout` removed from public types
- `MAX_CLASSIC_LOOP_ITERATIONS` removed; only `MAX_CONVERGENCE_PASSES=2` remains
- `bun run test:fast` and `bun run test:vendor` green
- `bun km view` and `bun silvercode` smoke-tested in real TTY
- New `app.settle({ maxTicks })` documented in vendor/silvery/docs/guide/testing.md

Tracks: @km/silvery/renderer-convergence-by-design (closed 2026-04-27)

Replace `singlePassLayout: boolean` with `maxLayoutPasses: number`. One knob, one variable, the actual underlying mechanism. Unify the two structurally different loop bodies in `renderer.ts` (singlePass at 732-848, classic at 856-928) into ONE bounded layout-pass loop with a cap parameter.

Naming: `maxLayoutPasses` preserves existing internal vocabulary (`MAX_CONVERGENCE_PASSES`, `pass-cause.ts`, `pass++` in the loop) and is honest about what the caller is bounding — layout passes, not internal convergence implementation.

The flag dispatches between two pre-baked configs (`singlePassLayout: true` → 2-pass cap, `: false` → 5-pass cap with different loop structure). That's a boolean wrapping a number wrapping a code-path choice — three abstractions for what should be one knob.

The structural insight from `@km/silvery/renderer-convergence-by-design` (closed 2026-04-27): `MAX_CONVERGENCE_PASSES = 2` (1 initial + 1 settle) is the production-derived bound. Any extra iteration is a feedback-edge bug, not a feature. The classic loop's wider cap (=5) was a heuristic safety margin for virtualizer/scroll envelopes — kept because scaling-down felt risky.

Now that the silvery agent has landed deferred `useBoxRect` (committed-rect-is-batch-invariant per the new CLAUDE.md guidance), reading rects + writing layout-affecting props is structurally safe. Convergence terminates in one pass by construction. The classic loop's extra iterations are dead code.

ONE knob exposes the actual mechanism:

- `maxLayoutPasses: 2` (default) — production-matching: initial + 1 settle, the structural bound.
- `maxLayoutPasses: 5` — legacy stabilization for tests that depend on multi-iteration settling (deprecated path).
- Setting < 2 breaks responsive layout (no settle pass for measurement feedback); clamp to 2 with a warning.

## API

```tsx
// vendor/silvery/packages/ag-term/src/renderer.ts
export interface RenderOptions {
  /** Max layout passes per render. Default: MAX_CONVERGENCE_PASSES (2 — production-derived structural bound). */
  maxLayoutPasses?: number
  // singlePassLayout: REMOVED
}
```

1. Delete `MAX_CLASSIC_LOOP_ITERATIONS` from pass-cause.ts.
2. Unify the two loop bodies in `doRender()` into ONE bounded loop. Loop body: `runPipeline + flushSyncWork`; exit when no React commit happened OR when `pass >= maxLayoutPasses`.
3. Default `maxLayoutPasses = MAX_CONVERGENCE_PASSES` (= 2). Clamp to >= 2 with a warning if caller passes lower.
4. Migrate ~30 call sites:
- `singlePassLayout: true` → drop entirely (now default behavior)
- `singlePassLayout: false` (default in some test renderers) → opt into `maxLayoutPasses: 5` if the test was relying on multi-iteration stabilization
7. Tests that genuinely need stabilization use explicit `maxLayoutPasses: N`.
- vendor/silvery/packages/ag-term/src/renderer.ts (unify loops, replace flag)
- `singlePassLayout` symbol gone
- `MAX_CLASSIC_LOOP_ITERATIONS` gone; only `MAX_CONVERGENCE_PASSES = 2` remains
- One unified layout-pass loop in renderer.ts (delete the duplicate)
- Real-TTY: `bun km view` and `bun silvercode` smoke-tested
- Updated docs reference `maxLayoutPasses` not `singlePassLayout`

## Tracks

- @km/silvery/renderer-convergence-by-design (closed 2026-04-27) — established structural bound
- silvery agent deferred-rect work (in flight 2026-05-06) — the structural safety that makes max=2 sufficient

User design calls (2026-05-06):

- "instead of singlePassLayout — why not just pass in the max convergence passes? by default it is MAX_CONVERGENCE_PASSES, but you can set it to 1 or whatever too — not two things, just one variable."
- "perhaps call it maxLayoutIterations / maxLayoutPasses" → settled on maxLayoutPasses (preserves pass-cause.ts vocabulary).

Replace `singlePassLayout: boolean` with `maxConvergencePasses: number`. One knob, one variable, the actual underlying mechanism. Unify the two structurally different loop bodies in `renderer.ts` (singlePass at 732-848, classic at 856-928) into ONE bounded convergence loop with a cap parameter.

The flag dispatches between two pre-baked configs (`singlePassLayout: true` → 2-pass cap, `: false` → 5-pass cap with different loop structure). That's a boolean wrapping a number wrapping a code-path choice — three abstractions for what should be one knob.

The structural insight from `@km/silvery/renderer-convergence-by-design` (closed 2026-04-27): `MAX_CONVERGENCE_PASSES = 2` (1 initial + 1 settle) is the production-derived bound. Any extra iteration is a feedback-edge bug, not a feature. The classic loop's wider cap (=5) was a heuristic safety margin for virtualizer/scroll envelopes — kept because scaling-down felt risky.

Now that the silvery agent has landed deferred `useBoxRect` (committed-rect-is-batch-invariant per the new CLAUDE.md guidance), reading rects + writing layout-affecting props is structurally safe. Convergence terminates in one pass by construction. The classic loop's extra iterations are dead code.

ONE knob exposes the actual mechanism:

- `maxConvergencePasses: 2` (default) — production-matching: initial + 1 settle, the structural bound.
- `maxConvergencePasses: 5` — legacy stabilization for tests that depend on multi-iteration settling (deprecated path).
- Setting < 2 breaks responsive layout (no settle pass for measurement feedback); clamp to 2 with a warning.

## API

```tsx
// vendor/silvery/packages/ag-term/src/renderer.ts
export interface RenderOptions {
  /** Max convergence passes per render. Default: MAX_CONVERGENCE_PASSES (2 — production-derived structural bound). */
  maxConvergencePasses?: number
  // singlePassLayout: REMOVED
}
```

1. Delete `MAX_CLASSIC_LOOP_ITERATIONS` from pass-cause.ts.
2. Unify the two loop bodies in `doRender()` into ONE bounded loop. Loop body: `runPipeline + flushSyncWork`; exit when no React commit happened OR when `pass >= maxConvergencePasses`.
3. Default `maxConvergencePasses = MAX_CONVERGENCE_PASSES` (= 2). Clamp to >= 2 with a warning if caller passes lower.
4. Migrate ~30 call sites:
- `singlePassLayout: true` → drop entirely (now default behavior)
- `singlePassLayout: false` (default in some test renderers) → opt into `maxConvergencePasses: 5` if the test was relying on multi-iteration stabilization
13. Tests that genuinely need stabilization use explicit `maxConvergencePasses: N`.
- vendor/silvery/packages/ag-term/src/renderer.ts (unify loops, replace flag)
- `singlePassLayout` symbol gone
- `MAX_CLASSIC_LOOP_ITERATIONS` gone; only `MAX_CONVERGENCE_PASSES = 2` remains
- One unified convergence loop in renderer.ts (delete the duplicate)
- Real-TTY: `bun km view` and `bun silvercode` smoke-tested
- Updated docs reference `maxConvergencePasses` not `singlePassLayout`

## Tracks

- @km/silvery/renderer-convergence-by-design (closed 2026-04-27) — established structural bound
- silvery agent deferred-rect work (in flight 2026-05-06) — the structural safety that makes max=2 sufficient

User design call (2026-05-06): "instead of singlePassLayout — why not just pass in the max convergence passes? by default it is MAX_CONVERGENCE_PASSES, but you can set it to 1 or whatever too — not two things, just one variable."

Replace `singlePassLayout: boolean` with `maxConvergencePasses: number`. One knob, one variable, the actual underlying mechanism. Unify the two structurally different loop bodies in `renderer.ts` (singlePass at 732-848, classic at 856-928) into ONE bounded convergence loop with a cap parameter.

The flag dispatches between two pre-baked configs (`singlePassLayout: true` → 2-pass cap, `: false` → 5-pass cap with different loop structure). That's a boolean wrapping a number wrapping a code-path choice — three abstractions for what should be one knob.

The structural insight from `@km/silvery/renderer-convergence-by-design` (closed 2026-04-27): `MAX_CONVERGENCE_PASSES = 2` (1 initial + 1 settle) is the production-derived bound. Any extra iteration is a feedback-edge bug, not a feature. The classic loop's wider cap (=5) was a heuristic safety margin for virtualizer/scroll envelopes — kept because scaling-down felt risky.

Now that the silvery agent has landed deferred `useBoxRect` (committed-rect-is-batch-invariant per the new CLAUDE.md guidance), reading rects + writing layout-affecting props is structurally safe. Convergence terminates in one pass by construction. The classic loop's extra iterations are dead code.

ONE knob exposes the actual mechanism:

- `maxConvergencePasses: 2` (default) — production-matching: initial + 1 settle, the structural bound.
- `maxConvergencePasses: 5` — legacy stabilization for tests that depend on multi-iteration settling (deprecated path).
- Setting < 2 breaks responsive layout (no settle pass for measurement feedback); clamp to 2 with a warning.

## API

```tsx
// vendor/silvery/packages/ag-term/src/renderer.ts
export interface RenderOptions {
  /** Max convergence passes per render. Default: MAX_CONVERGENCE_PASSES (2 — production-derived structural bound). */
  maxConvergencePasses?: number
  // singlePassLayout: REMOVED
}
```

1. Delete `MAX_CLASSIC_LOOP_ITERATIONS` from pass-cause.ts.
2. Unify the two loop bodies in `doRender()` into ONE bounded loop. Loop body: `runPipeline + flushSyncWork`; exit when no React commit happened OR when `pass >= maxConvergencePasses`.
3. Default `maxConvergencePasses = MAX_CONVERGENCE_PASSES` (= 2). Clamp to >= 2 with a warning if caller passes lower.
4. Migrate ~30 call sites:
- `singlePassLayout: true` → drop entirely (now default behavior)
- `singlePassLayout: false` (default in some test renderers) → opt into `maxConvergencePasses: 5` if the test was relying on multi-iteration stabilization
19. Tests that genuinely need stabilization use explicit `maxConvergencePasses: N`.
- vendor/silvery/packages/ag-term/src/renderer.ts (unify loops, replace flag)
- `singlePassLayout` symbol gone
- `MAX_CLASSIC_LOOP_ITERATIONS` gone; only `MAX_CONVERGENCE_PASSES = 2` remains
- One unified convergence loop in renderer.ts (delete the duplicate)
- Real-TTY: `bun km view` and `bun silvercode` smoke-tested
- Updated docs reference `maxConvergencePasses` not `singlePassLayout`

## Tracks

- @km/silvery/renderer-convergence-by-design (closed 2026-04-27) — established structural bound
- silvery agent deferred-rect work (in flight 2026-05-06) — the structural safety that makes max=2 sufficient

User design call (2026-05-06): "instead of singlePassLayout — why not just pass in the max convergence passes? by default it is MAX_CONVERGENCE_PASSES, but you can set it to 1 or whatever too — not two things, just one variable."

Kill `singlePassLayout` flag entirely. Make single-pass-per-batch the only rendering mode in `createRenderer()` — matching production's `create-app.tsx` behavior. Delete the classic stabilization loop (`MAX_CLASSIC_LOOP_ITERATIONS=5`) in `vendor/silvery/packages/ag-term/src/renderer.ts`.

Silvery's promise is **responsive layout that just works** — `useBoxRect` measurement-aware components, container queries, theme-driven breakpoints. Measurement IS a feedback edge, but production bounds it structurally: `MAX_CONVERGENCE_PASSES=2` (1 initial + 1 settle, derived in pass-cause.ts, not a heuristic). One settle pass per batch is enough because the framework knows the dependency edges.

The test renderer ALSO offers a "classic" mode that wraps `runPipeline + flushSyncWork` in a 5-iteration loop. This isn't production behavior — it's a stabilization wrapper that emits only the post-settle frame. Apps have been opting INTO `singlePassLayout: true` (km-tui driver, ~30 test helpers, apps/silvercode harnesses) to get production parity.

The dual mode masks bugs: tonight's 88↔120 oscillation in `apps/silvercode/src/components/Content.tsx` Row is a multi-frame production flicker that a multi-pass test renderer hides — caller asserts on the final frame, intermediate frames are invisible. We've been bitten by this exactly because production doesn't stabilize across 5 iterations and tests do.

Closing `@km/silvery/renderer-convergence-by-design` (2026-04-27) made production's loop bound structural at 2 passes. Test parity is the next move.

1. Provide `app.settle({ maxTicks: 5 })` for tests that genuinely need stabilization — caller-driven, not framework-hidden. Default behavior: render-as-production; caller awaits more ticks if their assertion needs them.

Kill `singlePassLayout` flag entirely. Make single-pass-per-batch the only rendering mode in `createRenderer()` — matching production's `create-app.tsx` behavior. Delete the classic stabilization loop (`MAX_CLASSIC_LOOP_ITERATIONS=5`) in `vendor/silvery/packages/ag-term/src/renderer.ts`.

Silvery's promise is **responsive layout that just works** — `useBoxRect` measurement-aware components, container queries, theme-driven breakpoints. Measurement IS a feedback edge, but production bounds it structurally: `MAX_CONVERGENCE_PASSES=2` (1 initial + 1 settle, derived in pass-cause.ts, not a heuristic). One settle pass per batch is enough because the framework knows the dependency edges.

The test renderer ALSO offers a "classic" mode that wraps `runPipeline + flushSyncWork` in a 5-iteration loop. This isn't production behavior — it's a stabilization wrapper that emits only the post-settle frame. Apps have been opting INTO `singlePassLayout: true` (km-tui driver, ~30 test helpers, apps/silvercode harnesses) to get production parity.

The dual mode masks bugs: tonight's 88↔120 oscillation in `apps/silvercode/src/components/Content.tsx` Row is a multi-frame production flicker that a multi-pass test renderer hides — caller asserts on the final frame, intermediate frames are invisible. We've been bitten by this exactly because production doesn't stabilize across 5 iterations and tests do.

Closing `@km/silvery/renderer-convergence-by-design` (2026-04-27) made production's loop bound structural at 2 passes. Test parity is the next move.

1. Provide `app.settle({ maxTicks: 5 })` for tests that genuinely need stabilization — caller-driven, not framework-hidden. Default behavior: render-as-production; caller awaits more ticks if their assertion needs them.

Kill `singlePassLayout` flag entirely. Make single-pass-per-batch the only rendering mode in `createRenderer()` — matching production's `create-app.tsx` behavior. Delete the classic stabilization loop (`MAX_CLASSIC_LOOP_ITERATIONS=5`) in `vendor/silvery/packages/ag-term/src/renderer.ts`.

