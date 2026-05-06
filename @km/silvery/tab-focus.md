---
mentions:
  - km
projects:
  - Tab
id: "@km/silvery/tab-focus"
aliases:
  - km-silvery.tab-focus
  - km-silvery-tab-focus
created_by: claude:474834b0
created_at: 2026-03-10T03:44:01Z
closed_at: 2026-03-10T04:20:18Z
close_reason: "Tab/Shift+Tab global focus cycling already works —
  focusManager.focusNext/focusPrev handle null activeElement (focus first/last).
  Test renderer and production runtime both dispatch Tab without guards. Added
  12 tests confirming: Tab cycles forward, Shift+Tab backward, wrapping, Escape
  blur, skip non-focusable. All pass."
owner: bjorn@stabell.org
---

# [x] Tab/Shift+Tab global focus cycling @km/silvery #feature #P2

Make Tab and Shift+Tab cycle focus between focusable components by default. Ink does this internally in the reconciler. Silvery focus is component-driven (no global Tab handler). This is a reasonable default — most TUI apps want Tab to move focus. Should be opt-out, not opt-in. Also fixes 21 Ink compat focus tests.

