---
mentions:
  - km
id: "@km/tui/palette-sweep-fixup"
aliases:
  - km-tui.palette-sweep-fixup
  - km-tui-palette-sweep-fixup
created_by: claude:d697f216
created_at: 2026-02-25T14:21:14Z
closed_at: 2026-02-25T17:18:58Z
owner: bjorn@stabell.org
---

# [x] Fix remaining test failures from palette-sweep  migration @km/tui #task #P1

The palette-sweep agent converted ~50 color literals to $token strings but broke many tests:

- Tests without ThemeProvider can't resolve $tokens
- Unit tests comparing color strings need updated expectations
- Alignment/layout tests need width adjustments for indicator reservation

Status: board-test.ts, icons.test, detail-pane.test, help-slash-color.test, inline-edit.spec, windowing-wire.test already fixed. Alignment/layout agent running.

Remaining failures (~12 files, ~30 tests): mostly INKX_STRICT incremental render mismatches (pre-existing) plus commandbox-elapsed (F20 key), omnibox (text format), toast/clipboard (pre-existing INKX_STRICT).

