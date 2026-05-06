---
mentions:
  - km
id: "@km/tui/node-header-unify"
aliases:
  - km-tui.node-header-unify
  - km-tui-node-header-unify
created_by: claude:e5580cd5
created_at: 2026-02-12T15:33:18Z
closed_at: 2026-02-12T19:45:41Z
owner: bjorn@stabell.org
---

# [x] Unify node display into shared NodeHeader component @km/tui #task #P3

Board, column, card, and section headers all duplicate rendering logic: bullet icons, title display, color pills, fold counts. After plan A/B visual prototyping is decided and merged, refactor into a unified NodeHeader component that all views share. Current duplication: shared-components.tsx (MemoizedColumnHeader), CardColumn.tsx (column header), ColumnsView.tsx (column header), TreeNode.tsx (card/section rendering).

