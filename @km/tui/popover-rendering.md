---
mentions:
  - km
projects:
  - hover
id: "@km/tui/popover-rendering"
aliases:
  - km-tui.popover-rendering
  - km-tui-popover-rendering
created_by: claude:db326126
created_at: 2026-03-30T18:29:36Z
closed_at: 2026-03-30T19:47:01Z
close_reason: "Fixed 6/7 items: raw wikilinks (context merge), text overflow
  (OVERFLOW_HIDDEN layout), Cmd+hover (useModifierKeys), coalescing (swap
  delay), click passthrough (stopPropagation), popover bg (-bg). Remaining:
  popover scroll (needs scrollTo/ListView approach — separate bead)."
owner: bjorn@stabell.org
---

# [x] [bug] Popover: raw wikilinks, text overflow, scroll broken, Cmd+hover unreliable @km/tui #bug #P1

Session fixes applied:

1. Raw wikilinks — FIXED (commit 2869a27b: InlineText context merge)
2. Text overflow — FIXED (commit 9bed1e0: scroll containers use OVERFLOW_HIDDEN for layout)
3. Scroll — REVERTED to overflow=hidden (raw scrollOffset was broken, needs scrollTo approach)
4. Cmd+hover — FIXED (commit ef1486f2: restored useModifierKeys)
5. Coalescing — FIXED (commit e309a85b: 100ms swap delay)
6. Click passthrough — FIXED (commit 3a70a829: stopPropagation on popover)

Remaining: popover scroll (needs ListView/scrollTo integration)

