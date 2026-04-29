---
id: "@km/silvery/trace-mismatch"
aliases:
  - km-silvery.trace-mismatch
  - km-silvery-trace-mismatch
created_by: claude:c9beade3
created_at: 2026-03-13T04:30:20Z
closed_at: 2026-03-13T04:57:58Z
close_reason: "False positive: trace diagnostic and runtime both compute
  childAncestorCleared identically (parentRegionCleared || (ancestorCleared &&
  \\!props.backgroundColor))."
owner: bjorn@stabell.org
---

# [x] Trace diagnostics compute childAncestorCleared differently than runtime @km/silvery #bug #P3

Instrumentation trace uses parentRegionCleared || ancestorCleared but runtime uses parentRegionCleared || (ancestorCleared && \!props.backgroundColor). Misleading debug output for bg-bearing boxes. Found by GPT pipeline review.