# Lesson: Pipeline tests need a theme that makes bugs visible

**Date**: 2026-05-05
**Bug**: `@km/silvery/render-light-blue-bg-strip-residue` — cyan strip on cold-start, took 11 rounds + multiple agents
**Outcome**: ~10 sessions chasing a bug that was invisible to every test we ran, because the test theme collapsed the bug's color to canvas

## What happened

A 14-cell horizontal strip with bg=$mutedbg appeared on every cold-start of `bun km view ~/Bear/Vault` at 82×75. Eleven rounds of investigation:

- STRICT=2, STRICT_ACCUMULATE=1 — empty log, no divergence
- Synthetic regression tests covering popover-unmount, km-shape props, wrap=truncate boundaries — **all passed**
- Cross-backend test (xterm + Ghostty WASM + vt100) — **all matched, no divergence**
- Real-vault `testBoard` driving 280+ presses — **0 hits**
- Bisect attempt — blocked by silvery export drift
- 3 separate /silvery agent runs — could not reproduce

Eventually the user confirmed the strip appears on **cold-start with no interaction**, and a real-session capture (`/tmp/km-strip.bin`) showed the bug existed in Frame 1 byte-for-byte. Programmatic decode of the user's capture localized the strip exactly. The fix was a 5-line clip-parity patch in `applyBgSegmentsToLine`.

**Why every test passed**: `testBoard` hardcoded `ansi16DarkTheme`. In ansi16, `$mutedbg = blend(scheme.background, ...)` collapses to a value indistinguishable from canvas bg. Any "find non-canvas-colored cells" detector returned 0 hits because the strip's color **was** the canvas color in the test theme. User's real session detected Nord, where `$mutedbg = #343a46` ≠ canvas `#2e3440` → strip visible.

The detection asymmetry was structural: **the test theme erased the very signal the bug emitted**.

## What should have happened

Five minutes with a diagnostic theme:

```typescript
import { diagnosticTheme } from "@silvery/test"
const board = await testBoard(VAULT, { columns: 82, rows: 75, theme: diagnosticTheme })
// Every distinct flat token resolves to a distinct visible RGB.
// Phantom bg paints with $mutedbg now stand out against canvas.
```

The diagnostic theme's invariant: **no two tokens collapse to the same color, and no token equals canvas**. Pipeline regression tests targeting cell-level correctness should run under it (or a multi-theme matrix that includes it).

## Anti-patterns observed

### 1. "Determinism" sacrificed bug visibility

`testBoard` defaulted to ansi16DarkTheme to make snapshots deterministic. Cost: theme-dependent bugs invisible. Both goals are reachable: pin a theme for snapshot stability, but **also** run regression tests at a theme that maximizes detectability.

### 2. STRICT proves consistency, not correctness

`SILVERY_STRICT=1/2` compares incremental render to fresh render. If both have the same bug (which both did, because both call `applyBgSegmentsToLine` without clip), STRICT passes. STRICT is necessary but not sufficient.

### 3. Synthetic tests with the wrong shape

Eleven synthetic tests used `<Text wrap="truncate">` shapes. The actual bug needed `<Text>` (no wrap, or wrap=wrap) wider than its visible parent (overflow=hidden, narrow Box). The bug's trigger condition was "Text wider than its visible parent" — none of the synthetics constructed that. Synthetic coverage is only as good as the shapes it constructs.

### 4. Trusting "no synthetic repro" too long

After three /silvery agents and 11 rounds couldn't reproduce, the implicit conclusion drifted toward "the bug must need real interaction" or "must be terminal-specific." It needed neither — it just needed the right theme + the right layout shape.

## Rules for next time

1. **New pipeline regression tests run at `diagnosticTheme` by default.** If the test asserts on cell-level bg/fg/attrs, use the theme where every distinct token is a distinct visible color.
2. **Multi-theme matrix for visible-pixel tests.** Run pipeline regression tests across `[diagnostic, nord, tokyo-night, default-dark]`. ansi16 is intentionally excluded — it's the structural collapse the matrix detects-around-of, not against.
3. **When a test passes but the user sees a bug, suspect the test harness, not the bug report.** Check: does the test theme make the bug's signal visible? Does the test fixture construct the trigger shape? Is the assertion checking the right cell property?
4. **STRICT is a trap when both walkers have the same bug.** If incremental == fresh but the user still sees something wrong, the bug is in shared infrastructure both walkers call. STRICT can't catch it.
5. **Capture user's real ANSI bytes early.** Decoding a real-session `SILVERY_CAPTURE_OUTPUT` through `createTermless` (xterm-headless) localizes the bug to exact (row, col, color, char) within minutes — much faster than synthetic-test-iteration with the wrong shape.

## Cross-references

- `vendor/silvery/packages/test/src/diagnostic-theme.ts` — `diagnosticTheme` + `diagnosticScheme` exports
- `apps/km-tui/tests/render-cyan-strip-cold-start-82.slow.spec.ts` — multi-theme matrix pattern
- `@km/silvery/render-light-blue-bg-strip-residue` — the bead, all 12 rounds
- `@km/silvery/diagnostic-theme-matrix` — extend the pattern to other regression tests
- `@km/silvery/clip-parity-invariant` — STRICT-mode check that catches the bug class structurally
- `docs/lessons/debugging-rendering.md` — sibling lesson about using diagnostic infrastructure (which the cyan-strip didn't have until now)

