---
mentions:
  - km
  - claude
id: "@km/all/tests"
aliases:
  - km-all.tests
  - km-all-tests
created_by: claude:8baeb5e0
created_at: 2026-03-01T21:41:01Z
closed_at: 2026-03-04T12:44:43Z
owner: bjorn@stabell.org
assignee: claude:8baeb5e0
---

# [x] Test quality: layered behavior-level testing strategy @km/all #epic #P2 @claude:8baeb5e0

TRACKING: All test quality work across the km monorepo.

## Current State (2026-03-02, post-refactor)

| Metric                | Before | After   | Change              |
| --------------------- | ------ | ------- | ------------------- |
| test:fast files       | 175    | 163     | -12                 |
| test:fast tests       | 4,263  | 4,202   | -61 (moved to slow) |
| @km/tui test files    | ~108   | ~84     | -24                 |
| CLAUDE.md coverage    | 6/20   | 20/20   | +14                 |
| Journey spec files    | 0      | 9       | +9                  |
| Journey spec tests    | 0      | 68      | +68                 |
| Pipeline/fuzz tests   | 0      | 23      | +23                 |
| Files eliminated      | —      | 19      | —                   |
| test.each conversions | —      | 4 files | —                   |

## Completed Work Streams

### ✅ Stream 1: Test Infrastructure Docs

- test-layers.md created (canonical layering philosophy)
- 20/20 test directories have CLAUDE.md
- review-tests.md Phase 1.8 (infrastructure grooming)
- test-first-protocol.md domain mapping updated

### ✅ Stream 2: Journey Specs (9 files, 68 tests)

- board-edit, board-features, board-nav, board-selection, board-view
- breadcrumb, collapse, date, detail-pane, filter, fold, scroll, search
- multiselect-ops, undo-redo, production-entry, text-cursor-bugs, toast

## Open Work Streams

### Stream 3: Termless TTY Regression Tests (NEW)

Tests that feed inkx ANSI output through a real terminal emulator (xterm.js/Ghostty WASM via termless) and assert on resulting terminal state using viterm matchers. ~30-100ms per test. Catches ANSI generation bugs, style leaks, cursor positioning errors, wide character issues.

| Layer         | Tool                        | Speed       | What it catches                   |
| ------------- | --------------------------- | ----------- | --------------------------------- |
| TUI (testEnv) | inkx virtual buffer         | ~50-100ms   | Logic, state, layout              |
| Termless      | xterm.js/Ghostty WASM       | ~30-100ms   | ANSI output, style resets, cursor |
| GUI (MCP)     | Real terminal + screenshots | Interactive | Visual verification by human      |

Infrastructure: termless (vendor/beorn-termless), viterm matchers (toContainText, toHaveFg, toBeBold, toHaveCursorAt). 7 inkx termless tests prove the pattern.

Priority domains: board rendering (borders, colors, overflow), incremental diff (style resets), wide chars (emoji, CJK), cursor positioning, theme colors.

TtyEngine (vendor/beorn-tools tty-engine) is **deprecated** in favor of termless — termless is 10-50x faster (WASM vs real PTY), deterministic, no file I/O.

