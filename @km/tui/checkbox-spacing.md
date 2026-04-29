---
id: "@km/tui/checkbox-spacing"
aliases:
  - km-tui.checkbox-spacing
  - km-tui-checkbox-spacing
created_by: Bjørn Stabell
created_at: 2026-04-13T21:37:19Z
closed_at: 2026-04-14T06:29:45Z
close_reason: "Root cause fixed in 89b694ad5 (PREFIX_WIDTH=2 + BODY_PREFIX
  export — body fallback was length:1, broke alignment). Regression test added
  in 0fb432d18: apps/km-tui/tests/checkbox-click.test.ts asserts
  [marker][space][title] for all 5 statuses + with cursor on done, at both
  string and cell level. 9/9 checkbox tests pass."
owner: bjorn@stabell.org
---

# [x] No space between checkbox icon and text @km/tui #bug #P2

The checkbox done icon (✓ U+2713) renders with no space before the title text. E.g., '✓Build' instead of '✓ Build'. The prefix box is 2 cells (marker + space) but the space appears to be missing. Likely a character width calculation issue — ✓ may be counted as wide (2 cells) in some code path, filling the entire prefix box.