---
mentions:
  - km
id: "@km/inkx/text-sizing-osc66"
aliases:
  - km-inkx.text-sizing-osc66
  - km-inkx-text-sizing-osc66
created_by: claude:66aeba27
created_at: 2026-02-28T08:46:26Z
closed_at: 2026-02-28T09:38:13Z
owner: bjorn@stabell.org
---

# [x] Fix rendering corruption @km/inkx #bug #P1

After zooming in (reducing terminal columns), text characters are spread out with huge gaps between them. Every other character shows with spaces — e.g. 'e B a 7' instead of full text. Visible in asana vault board view. Strongly suggests a width-doubling bug where all characters are treated as 2 cells wide after resize. Screenshots: 2026-02-28 at 08.43.37 (before) and 08.43.59 (after zoom).

