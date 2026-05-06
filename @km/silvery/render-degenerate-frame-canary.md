---
aliases:
  - km-silvery.render-degenerate-frame-canary
  - km-silvery-render-degenerate-frame-canary
created_at: 2026-05-05T21:28:06.509Z
---

# [x] Runtime canary in render() — warn/throw on degenerate-frame output #feature #P2

## Resolution 2026-05-05 (consolidated under SILVERY_STRICT)

Shipped in silvery `2c5bb672` (initial canary) and consolidated under the canonical `SILVERY_STRICT` contract in the same release wave. **No new SILVERY_* enable env vars** — the canary fires through the single `SILVERY_STRICT` knob like every other strict check.

### What landed

- `TerminalBuffer.countPaintedCells()` in `packages/ag-term/src/buffer.ts` — single-pass scan of the packed Uint32 array. A cell counts as "painted" iff `char !== " "` OR any cell-style flag is set (fg/bg/attr/wide/cont/truecolor).
- Canary in `packages/ag-term/src/renderer.ts`'s `render()` after the first frame settles. Gated by buffer size (≥ 4000 cells) so unit-test fixtures with small buffers don't trip the gate.
- New helper `packages/ag-term/src/strict-mode.ts` — `isStrictEnabled(slug, minTier)` parses the `SILVERY_STRICT` env var.
- Docs: `vendor/silvery/docs/guide/debugging.md` and `vendor/silvery/docs/guide/testing.md` describe the contract; `vendor/silvery/CLAUDE.md` codifies the "no new SILVERY_* enable env vars" rule.

### How it fires

```bash
SILVERY_STRICT=1                # debug-log only (canary is tier 2)
SILVERY_STRICT=2                # throws on degenerate frame
SILVERY_STRICT=canary           # explicit slug — throws (debugging isolate)
SILVERY_STRICT=2,!canary        # tier 2 minus canary (per-test escape hatch)
SILVERY_STRICT=residue,canary   # combine specific checks without going full-tier
```

The throw decision is `isStrictEnabled("canary", 2)` — fires when tier ≥ 2 OR the explicit `canary` slug is set. Tier 1 stays back-compat (existing tests don't break); tier 2 surfaces the punch-list of harness defects during `test:strictest` cadence runs.

Default behavior (`SILVERY_STRICT` unset / "0"): emit a `silvery:render` debug-log line. We deliberately do NOT use `console.warn` because km's vitest setup treats any console.warn as a hard test failure, and many silvery unit tests intentionally render small components inside large buffers.

Diagnostic message includes the painted/total ratio, dimensions, and points at the canonical fix (`<Box width={cols} height={rows}>` or `<Screen>`). Per-test opt-out documented in the message: `SILVERY_STRICT=1,!canary`.

### Why "canary" lives at tier 2 (not tier 1)

Some legacy harnesses render at large geometries without the `<Screen>` wrapper. The canary correctly catches them, but rolling them up requires per-test fixes that should land separately. Filing at tier 2 surfaces the punch-list during `test:strictest` cadence runs without breaking `test:fast` on the existing suite. Promote to tier 1 once the suite is clean.

### Original brief / why this is better than a lint rule

User direction 2026-05-05: "I prefer not to put this in the lint rule — anywhere else?" → moved to runtime canary in silvery itself.

- **Catches every consumer, not just files matching a regex.** Any helper, contributor PR, or downstream user gets the same guard.
- **Runs automatically in tests.** No "did you remember to register the lint rule" step.
- **Self-explanatory.** The error message points the consumer at the exact CLAUDE.md section that describes the fix.
- **Travels with the framework.** Anyone using silvery as a library benefits without configuring lint.
- **Bug-class invariant** (per `feedback-silent-fail-canaries.md`) — guards the entire silent-empty-frame class, not one symptom.

## Bead context

Filed after the @km/silvery/render-light-blue-bg-strip-residue + @km/all/test-system/test-board-empty-frame incident chain — would have prevented the entire silent-fail cascade. Consolidated under the `SILVERY_STRICT` umbrella per user direction "no more env vars - at MOST we can have SILVERY_STRICT perhaps take a slug as well as 1/2/3 to run only one particular test" (2026-05-05).

