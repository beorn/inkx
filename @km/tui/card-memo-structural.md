---
id: "@km/tui/card-memo-structural"
aliases:
  - km-tui.card-memo-structural
  - km-tui-card-memo-structural
created_by: claude:499eee95
created_at: 2026-02-14T00:14:35Z
closed_at: 2026-02-14T08:59:40Z
owner: bjorn@stabell.org
assignee: claude:124bfbe5
---

# [x] Card memo: use reference equality with structural sharing instead of field-by-field comparison @km/tui #task #P3 @claude:124bfbe5

Currently CardColumn.tsx has a growing field-by-field React.memo comparison (id, content, task_status, due_date, priority, recurrence, etc.) that must be updated every time a new KNode display field is added. Two misaligned memo comparisons exist: Card memo in CardColumn.tsx and TreeNode memo in TreeNode.tsx.

Better approach: align object reference changes with caching/memoization. Options:
1. Single 'card' reference that changes when any display-relevant field changes (structural sharing in useColumns/deriveColumnsFromRepo)
2. Split card into sub-objects (card.body, card.title, card.meta) where each reference changes independently — more granular re-renders
3. Just compare card.node by reference, with node interning in the repo layer

The key insight: instead of duplicating field lists in memo comparisons, make the object references themselves be the memoization signal. This eliminates the class of bugs where a new field (like due_date) is added to KNode but forgotten in the memo comparison.