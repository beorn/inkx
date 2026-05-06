---
mentions:
  - km
id: "@km/silvery/withfocus-press-crash"
aliases:
  - km-silvery.withfocus-press-crash
  - km-silvery-withfocus-press-crash
created_by: Bjørn Stabell
created_at: 2026-04-06T09:40:33Z
closed_at: 2026-04-06T10:05:11Z
close_reason: "Fixed: deferred press() binding — uses target.press at call time,
  not app.press.bind() at composition time."
owner: bjorn@stabell.org
---

# [x] withFocus crashes in pipe() — app.press accessed at composition time @km/silvery #bug #P1

withFocus() accesses app.press during pipe() composition, but press() only exists on the handle after run(). Crashes when withFocus is in the pipe chain. Introduced by Phase 3c (copy-mode key handling). Fix: defer press wrapping to run() time. Reported by @km/_orphan/2-oqv.

