---
id: "@km/_orphan/cwn2"
aliases:
  - km-cwn2
created_at: 2026-01-25T08:27:13Z
closed_at: 2026-01-25T08:47:36Z
---

# [x] TUI: App crashes when scrolling right at edge @km/_orphan #bug #P0 @beorn-claude-78480

When cursoring all the way to the right and the viewport should start scrolling, the app crashes instead.

## Reproduction
```bash
km view /tmp/tst-vault3
# Use 'l' repeatedly to move cursor to rightmost column
# Continue pressing 'l' when at edge
# App crashes
```

## Expected
- At edge: cursor should stay on rightmost column (no crash)
- OR if horizontal scrolling is implemented: viewport should scroll to reveal more columns

## Investigation
Likely causes:
- Array bounds error in column navigation
- Missing bounds check in h/l navigation handler
- Virtual column handling at boundaries

Priority P0 because it's a crash (data loss risk).