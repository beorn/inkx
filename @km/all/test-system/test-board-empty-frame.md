---
aliases:
  - km-all.test-system.test-board-empty-frame
  - km-all-test-system-test-board-empty-frame
created_at: 2026-05-05T21:21:18.009Z
---

# [x] testBoard helper renders degenerate 1-row frame (visual regression tests silently no-op) #bug #P1

## Resolution 2026-05-05 (silvery agent)

Fixed in km commit landing alongside silvery `04680d54`. `apps/km-tui/tests/helpers/real-board.ts` now mirrors `createDriverTest`:

- Renders `<BoardApp>` (which pins root width/height via `<Box width={cols} height={rows}>` at Board.tsx:287/305) instead of bare `<Board>` (which left the root unpinned and collapsed every fixture to a 1-row title-bar frame).
- Threads the full provider stack (`ThemeProvider → ServicesProvider → StoreContext → FocusManagerContext → StoreProvider → RepoProvider`) — matches `tui.tsx` production setup.
- Default geometry tiered to **360 × 120** (`FULL_APP_DEFAULT_COLS / ROWS`) per `feedback-km-view-test-dimensions.md` — full-app helpers use modern dev-workstation defaults; narrow component fixtures keep their 80×24.
- Adds an in-helper degenerate-frame canary that throws if < 5% of cells are painted at the configured geometry, with a `skipFrameCanary: true` opt-out.
- Belt-and-braces with the silvery-side `render()` canary shipped in @km/silvery/render-degenerate-frame-canary — the silvery one catches at the framework boundary; this one produces a more specific error tied to `testBoard`.

Verified: `apps/km-tui/tests/render-light-blue-strip-residue.slow.spec.ts` now renders a real frame at 352×117 (canary passes; the strip-detector successfully exempts legitimate cursor highlights and reports zero stale residue strips). The test still fails on a separate STRICT_OUTPUT divergence around regional-indicator flag emoji width — filed as @km/silvery/strict-output-flag-emoji-width-divergence.

apps/km-tui/tests/helpers/real-board.ts calls render() without a <Screen> wrapper or proper width/height pin (silvery CLAUDE.md 'Pin root width/height when testing full-app layouts' gotcha). Result: at any cols×rows, the headless renderer produces a frame with content only on row 0 (title bar) — 352 of 41184 cells with bg at 352×117, all on row 0.

Consequence: every existing .slow.spec.ts using testBoard silently passes — STRICT, cell scans, cursor-walk drivers, snapshot diffs, all green by default because nothing meaningful is being painted. We have a wall of green visual regression tests that catch nothing.

Discovered while investigating @km/silvery/render-light-blue-bg-strip-residue — round-1 and round-2 'cannot reproduce' results were both false negatives from this harness floor. The bg-strip bug is real and visible in the user's actual terminal at 352×117, but no headless test path can see it.

Acceptance:
- helpers/real-board.ts wraps render with <Screen> or equivalent term-context pin
- a guard assertion (likely in the helper itself or a contract test) fails if the rendered frame has < N% of cells painted (catches future degenerate-frame regressions)
- existing .slow.spec.ts files re-run and ACTUALLY catch known visual bugs
- @km/silvery/render-light-blue-bg-strip-residue can be reproduced once this is fixed
