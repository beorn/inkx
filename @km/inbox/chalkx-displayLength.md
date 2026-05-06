---
mentions:
  - km
id: "@km/inbox/chalkx-displayLength"
aliases:
  - km-chalkx-displayLength
  - "@km/_orphan/chalkx-displayLength"
created_at: 2026-01-20T14:25:24Z
closed_at: 2026-01-20T14:36:54Z
---

# [x] chalkx: displayLength() counts UTF-16 units not visual cells @km/_orphan #bug #P0

Critical: vendor/beorn-chalkx/src/utils.ts:58 uses .length which counts UTF-16 code units, not visual cell width. CJK characters (2 cells wide) return wrong value. Should use string-width or similar library for accurate width calculation.

