---
mentions:
  - km
  - claude
id: "@km/tui/pty-testing"
aliases:
  - km-tui.pty-testing
  - km-tui-pty-testing
created_at: 2026-02-08T08:17:29Z
closed_at: 2026-02-09T17:35:14Z
assignee: claude:dffe6eeb
---

# [x] PTY integration tests: close the headless-vs-production testing gap @km/tui #task #P1 @claude:dffe6eeb

## Problem: Headless Tests Pass, Production Breaks

Across 12+ sessions (2026-02-06 through 2026-02-08), headless tests consistently passed while the real TUI had visible bugs (visual bell flashes, cursor freezing on auto-repeat). Root cause: headless tests bypass the real async event pipeline:

- Headless: `board.press("j")` → `parseKey()` → `handleKey()` → synchronous
- Production: stdin → TermProvider → splitRawInput → event queue → processEventBatch → render

The key differences:

1. **No event batching**: headless tests process one key at a time, production batches auto-repeat bursts
2. **No timing**: headless tests are instantaneous, production has real latency between events and renders
3. **No terminal rendering**: headless tests check DOM/virtual buffer, production goes through the full ansi-diff → stdout pipeline

## Current State (partially fixed)

Created `apps/km-tui/tests/pty-integration.slow.spec.ts` using `createTtyEngine` (Bun PTY + @xterm/headless). This runs the REAL app in a REAL terminal pipeline (same stdin→terminal flow as production). 7 tests at 400x150:

- Startup, single j, burst j×10, rapid individual presses, large burst j×30, arrow keys, mixed keys

Also have TTY MCP tools (`mcp__tty__start`, `mcp__tty__screenshot`, etc.) for interactive visual verification.

## What's Still Missing

1. **PTY tests are slow** (~20-30s each due to startup + settle waits). Need faster warm-start or session reuse.
2. **No visual regression testing**: PTY tests check text content but not pixel-level rendering. Can't detect:
- White flash artifacts
- Cursor position rendering bugs
- Color/style regressions
8. **No auto-repeat simulation**: `engine.press("j")` sends one key event. Real auto-repeat sends keys at 30Hz with specific timing. Need `engine.repeatKey("j", { count: 20, rateHz: 30 })`.
9. **No screenshot comparison**: `mcp__tty__screenshot` captures what we'd see, but no automated comparison between expected and actual.
10. **CI integration**: PTY tests need `*.slow.spec.ts` pattern to separate from fast tests.

## Proposed Approach

1. Add `engine.repeatKey()` to `tty-engine` that simulates real auto-repeat timing
2. Add screenshot capture to PTY tests (use `bufferToHTML()` from engine)
3. Create visual regression baseline snapshots
4. Speed up PTY tests: keep engine running across tests, use fresh vault per test
5. Integrate into `bun run test:slow` CI step

