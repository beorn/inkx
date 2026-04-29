---
id: "@km/tui/task-hierarchy-flat"
aliases:
  - km-tui.task-hierarchy-flat
  - km-tui-task-hierarchy-flat
created_by: Bjørn Stabell
created_at: 2026-04-14T17:36:55Z
closed_at: 2026-04-14T18:01:56Z
close_reason: "Fixed: TreeNode head-row paddingLeft changed from max(0, depth -
  1) to depth. The -1 offset collapsed depth 0 (card title) and depth 1 (first
  nested child) onto the same column; inside structural cards the border hid it,
  but inside body cards (nested markdown list items) the parent and its children
  rendered at the same x with identical □ bullets. Regression exposed by
  efb1db1ff which restored bullets to body list items. Fix applies to both
  TreeNodeImpl and FoldedChildRow main rows. Test:
  apps/km-tui/tests/text/inline-rendering.test.ts 'nested task list items are
  visually indented under their parent'. Commit 202eb2efa."
---

# [x] Nested task list items render flat (lose parent/child hierarchy) @km/tui #bug #P2

blocks:: [[@km/tui]]

Markdown task lists with nested children render as sibling rows instead of a tree.

Repro:
```markdown
- [ ] +taxes: close out 2026-04-15 prepayment
  - [ ] **Set up Mobilbank with Norwegian passport** — unblocks ...
  - [ ] Send @Delei the checklist — SPD statements, ...
```

Expected: parent task with 2 nested children, visible indentation.
Actual: 3 sibling tasks, no hierarchy.

User screenshot 2026-04-14 at 10.23.01: inside the "+taxes — this morning" card, all tasks appear as flat siblings. The parent "+taxes: close out 2026-04-15 prepayment" has a P0 label but its child tasks (Mobilbank, Delei checklist) sit alongside it at the same level instead of beneath it.

Likely causes:
1. @km/markdown ast2nodes flattens nested list items (parent_id not set to the enclosing LI)
2. @km/_orphan/board view-lens computeCardOrSubitemChildren returns them all at depth 0 regardless of repo structure
3. @km/tui TreeNode renders a flat depth for body nodes regardless of actual depth

Related recent fixes:
- efb1db1ff fix(tui): preserve inline formatting + bullets in body blocks
- 27db42fcf fix(board): zoom stack overflow + folder-note column expansion

Investigation should start by inspecting `repo.getChildren(parentTaskId)` for a nested repro — if the DB has the hierarchy but the view flattens it, the bug is in view-lens or TreeNode. If the DB is already flat, the bug is in the markdown parser.