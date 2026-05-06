---
mentions:
  - km
id: "@km/silvery/blink-hidden-style"
aliases:
  - km-silvery.blink-hidden-style
  - km-silvery-blink-hidden-style
created_by: claude:c9beade3
created_at: 2026-03-13T05:03:15Z
closed_at: 2026-03-13T05:26:37Z
close_reason: "Fixed: Added SGR 5 (blink) and SGR 8 (hidden) to styleToAnsi() in
  output-phase.ts"
owner: bjorn@stabell.org
---

# [x] Bug: styleToAnsi() omits blink and hidden while styleTransition() handles them @km/silvery #bug #P3

In output-phase.ts, styleTransition() handles blink and hidden attrs but styleToAnsi() does not emit them on full generation/reset baseline. Inconsistent.

