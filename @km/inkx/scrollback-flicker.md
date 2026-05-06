---
mentions:
  - km
id: "@km/inkx/scrollback-flicker"
aliases:
  - km-inkx.scrollback-flicker
  - km-inkx-scrollback-flicker
created_by: claude:fa5431cd
created_at: 2026-03-03T00:34:35Z
closed_at: 2026-03-03T00:40:20Z
owner: bjorn@stabell.org
---

# [x] Scrollback flicker + header-in-scrollback + jump-up on freeze @km/inkx #bug #P1

Three bugs in useScrollback inline mode: (1) flicker on each freeze event (blanks screen with \x1b[J then rewrites), (2) header text appears between frozen entries in scrollback, (3) jump-up after writing output when content hits terminal bottom. Fix: promoteScrollback API routes frozen content through output phase for single target.write(). Jump-up fix: nextLastLine must account for frozenLineCount + maxOutputLines, not just maxOutputLines.

