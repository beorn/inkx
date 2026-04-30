---
id: "@km/inbox/00jkc"
aliases:
  - km-00jkc
  - "@km/_orphan/00jkc"
created_by: claude:65d845d9
created_at: 2026-03-13T02:27:07Z
closed_at: 2026-03-13T02:36:44Z
close_reason: "Fixed: trace now uses parentRegionCleared || (ancestorCleared &&
  !props.backgroundColor)"
owner: bjorn@stabell.org
---

# [x] Diagnostic trace childAncestorCleared formula mismatch @km/_orphan #bug #P3

Trace computes parentRegionCleared || ancestorCleared but runtime uses parentRegionCleared || (ancestorCleared && !props.backgroundColor). Misleads debugging.