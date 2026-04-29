---
id: "@km/flexily/min-max-precedence"
aliases:
  - km-flexily.min-max-precedence
  - km-flexily-min-max-precedence
created_by: claude:c9beade3
created_at: 2026-03-13T05:26:10Z
closed_at: 2026-03-13T05:42:49Z
close_reason: "Fixed: Reordered applyMinMax() to apply max before min (CSS spec:
  when min > max, min wins). Verified matches Yoga behavior. Test added."
owner: bjorn@stabell.org
---

# [x] Bug: applyMinMax() makes max win over min when min > max — CSS says min dominates @km/flexily #bug #P1
