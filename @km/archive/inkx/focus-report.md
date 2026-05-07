---
mentions:
  - km
id: "@km/inkx/focus-report"
aliases:
  - km-inkx.focus-report
  - km-inkx-focus-report
created_by: claude:d1f60fb4
created_at: 2026-02-25T23:27:37Z
closed_at: 2026-02-25T23:37:06Z
owner: bjorn@stabell.org
---

# [x] Focus reporting (CSI ?1004h) — detect terminal focus/blur @km/inkx #feature #P3

Enable focus reporting mode so the terminal sends CSI I (focus in) and CSI O (focus out) events. Already listed in terminal-lifecycle state but not queryable or parseable as events. Add: enableFocusReporting(), disableFocusReporting(), parseFocusEvent(), and hook into the input pipeline.

