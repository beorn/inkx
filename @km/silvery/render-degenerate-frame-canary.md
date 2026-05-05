---
aliases:
  - km-silvery.render-degenerate-frame-canary
  - km-silvery-render-degenerate-frame-canary
created_at: 2026-05-05T21:28:06.509Z
---

# [x] Runtime canary in render() — warn/throw on degenerate-frame output #feature #P2

## Resolution 2026-05-05 (silvery agent)

Shipped in silvery `04680d54` on branch `fix/render-bg-strip-and-test-harness`. Implementation:

- `TerminalBuffer.countPaintedCells()` in `packages/ag-term/src/buffer.ts` — single-pass scan of the packed Uint32 array; a cell counts as painted iff `char !== " "` OR any cell-style flag is set (fg/bg/attr/wide/cont/truecolor).
- Canary in `packages/ag-term/src/renderer.ts`'s `render()` after the first frame settles. Gated by buffer size (>= 4000 cells) so unit-test fixtures with small buffers don't trip the gate.
- Default behavior: emit a `silvery:render` debug log line (visible via `DEBUG=silvery:render`). km's vitest setup treats `console.warn` as a hard test failure, so debug-log avoids breaking the existing test suite.
- Opt-in throw: `SILVERY_STRICT_FRAME_CANARY=1`.
- Bypass: `SILVERY_FRAME_CANARY_OFF=1`.

Diagnostic message includes the painted/total ratio, dimensions, and points at the canonical fix (`<Box width={cols} height={rows}>` or `<Screen>`).

The testBoard harness defect (apps/km-tui/tests/helpers/real-board.ts called silvery's `render()` without a `<Screen>` wrapper, producing 1-row degenerate frames) was the original sin in the cyan-strip incident. **The fix should live in silvery itself**, not in a per-helper assertion or a lint rule — that way every test helper, every consumer, every future framework user is automatically protected.

## Proposal

Add a runtime canary inside `silvery/runtime`'s `render()` (and the lower-level `Ag.render`). After the first paint settles:

1. Measure the buffer's painted-cell ratio = `cellsWithNonNullBg + cellsWithNonNullFg + cellsWithText` / total cells.
2. If the renderer is **headless** (no live TTY — e.g. `createTermless`, `createRenderer`, off-screen Term backends) AND ratio < 5% of the configured rows × cols (or < 1 row of meaningful content):
   - **STRICT mode (`SILVERY_STRICT=1`)**: throw with diagnostic `"render() produced a degenerate frame (only N of M cells painted). Likely cause: root has no width/height pin and no <Screen> wrapper. See vendor/silvery/CLAUDE.md 'Pin root width/height when testing full-app layouts'."`
   - **Default**: warn once via `console.warn` (or the silvery debug log if `DEBUG=silvery:*`).

For live-TTY backends, suppress the canary — it's legitimate to render an empty frame on a real terminal (e.g. waiting for first input). The canary is only meaningful for testing / off-screen rendering where a working frame is the deliverable.

## Why this is better than a lint rule (per user direction 2026-05-05)

- **Catches every consumer, not just files matching a regex.** Any helper, contributor PR, or downstream user gets the same guard.
- **Runs automatically in tests.** No "did you remember to register the lint rule" step.
- **Self-explanatory.** The error message points the consumer at the exact CLAUDE.md section that describes the fix.
- **Travels with the framework.** Anyone using silvery as a library benefits without configuring lint.
- **Bug-class invariant** (per `feedback-silent-fail-canaries.md`) — guards the entire silent-empty-frame class, not one symptom.

## Implementation sketch

```ts
// vendor/silvery/packages/ag-term/src/runtime/render.tsx (or wherever the render entry point is)
function checkFrameCanary(buffer: TerminalBuffer, term: Term): void {
  if (term.isLive) return  // skip for real TTYs
  const total = buffer.width * buffer.height
  const painted = buffer.countPaintedCells()  // may need a helper if not exposed
  const ratio = painted / total
  if (ratio < 0.05) {
    const msg = `[silvery] render() produced a degenerate frame: ${painted} of ${total} cells painted (${(ratio * 100).toFixed(1)}%). Likely cause: root has no width/height pin and no <Screen> wrapper. See https://silvery.dev/guide/testing#pin-root-width-height`
    if (process.env.SILVERY_STRICT === "1") throw new Error(msg)
    console.warn(msg)
  }
}
```

## Acceptance

- New canary fires on a regression test that calls `render(<Box />, headlessTerm)` without dimensions
- Existing tests with proper `<Screen>` or `<Box width height>` wrappers pass silently
- Documented in vendor/silvery/CLAUDE.md Testing section
- A bypass env var (`SILVERY_FRAME_CANARY_OFF=1`) for the rare case someone *intentionally* wants an empty render (e.g. testing the empty-state path itself)
- Caught in `tests/contracts/render-defaults.contract.test.tsx` (lives there since it's about the default contract of `render`)

## Bead context

Filed after the @km/silvery/render-light-blue-bg-strip-residue + @km/all/test-system/test-board-empty-frame incident chain — would have prevented the entire silent-fail cascade. User's direction 2026-05-05: "I prefer not to put this in the lint rule — anywhere else?" → moved to runtime canary in silvery itself.
