---
id: "@km/_orphan/khib"
aliases:
  - km-khib
created_at: 2026-01-20T14:25:49Z
closed_at: 2026-01-20T14:36:55Z
---

# [x] inkx/chalkx: Naming inconsistency displayWidth vs displayLength @km/_orphan #task #P2

Medium: inkx uses displayWidth()/displayWidthAnsi() while chalkx uses displayLength(). API confusion for users who may pick wrong function. Consider standardizing naming across packages.