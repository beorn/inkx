---
id: "@km/inbox/r0nz"
aliases:
  - km-r0nz
  - "@km/_orphan/r0nz"
created_at: 2026-01-20T08:02:40Z
closed_at: 2026-01-20T10:47:33Z
---

# [x] InkX: Columns view has inconsistent vertical spacing between items @km/_orphan #bug #P2

In ColumnsView, the items in columns sometimes have blank vertical spaces between them and sometimes not. This inconsistency makes the UI look unpolished. The issue is likely related to how TreeNode renders or how the flex layout handles children spacing.