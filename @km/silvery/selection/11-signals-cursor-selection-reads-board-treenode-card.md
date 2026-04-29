---
id: "@km/silvery/selection/11-signals-cursor-selection-reads-board-treenode-card"
aliases:
  - km-silvery.selection.11
  - km-silvery-selection-11
  - "@km/silvery/selection/11"
created_by: Bjørn Stabell
created_at: 2026-04-05T07:41:51Z
closed_at: 2026-04-05T07:52:25Z
owner: bjorn@stabell.org
---

# [x] Signals: cursor + selection reads (Board, TreeNode, CardColumn, WorkspaceChrome) @km/silvery #task #P2

Migrate cursor/selection useAppStore reads to useSignal.

~15 selectors across 5 view files read sel.node.cursor(), sel.node.ids(), sel.text(), sel.kind() through the Zustand bridge. Replace with direct signal reads.

Files: Board.tsx (cursor, selIds, textEditState, sel), TreeNode.tsx (editNodeId), CardColumn.tsx (isInlineEditing, isDirectlyEditing), WorkspaceChrome.tsx (cursorId, moveMode), CheckboxIcon.tsx

Depends on: selection.9 (useSignal hook)