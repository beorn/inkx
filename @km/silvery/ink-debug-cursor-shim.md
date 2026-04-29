---
id: "@km/silvery/ink-debug-cursor-shim"
aliases:
  - km-silvery.ink-debug-cursor-shim
  - km-silvery-ink-debug-cursor-shim
created_by: Bjørn Stabell
created_at: 2026-04-09T20:12:24Z
closed_at: 2026-04-09T23:35:17Z
close_reason: |-
  Fixed Ink debug-mode useStdout/useStderr replay in @silvery/ink test renderer.

  Root cause was twofold:
  1. Generated cursor.test.tsx was missing useStdout/useStderr from its
     compat-layer import (already fixed in gen-vitest.ts on a recent commit
     but the generated file was stale).
  2. flushPendingDebugWrites in renderTestMode collapsed stderr-target
     flushes into a single stdout write. Ink emits both a "render frame"
     and a "replay frame" on stdout when writeToStderr is called in debug
     mode, so the test expected stdout.length > 1.

  Fix: distinguish stdout-target flushes (which concatenate data + frame
  into one chunk, so we suppress the baseline frame) from stderr-target
  flushes (which need the baseline frame to also be emitted as a separate
  stdout write). Renamed the return type from boolean to
  { suppressFrame: boolean } to make the contract explicit.

  Impact:
  - Before: cursor.test.tsx had 3 passing, 9 expected-fail, 2 skipped (14)
  - After:  cursor.test.tsx has  8 passing, 4 expected-fail, 2 skipped (14)
  - Net: 5 more passing tests (bead targeted 3, exceeded).

  Files:
    vendor/silvery/packages/ink/src/ink-render.ts (003d4f94)
    vendor/silvery/packages/ink/scripts/gen-vitest.ts (e6aa3706)
---

# [x] Expose Ink-compatible debug cursor API alongside SILVERY_DEV=1 @km/silvery #feature #P2 @Bjørn Stabell

Ink has a debug mode that positions a cursor for inspection. Silvery has SILVERY_DEV=1 inspector that does similar things differently. Add Ink-compatible debug cursor API as a shim in @silvery/ink.

## Impact

Closes 3 Ink 7.0 compat failures.

## Parent

@km/silvery/positioning