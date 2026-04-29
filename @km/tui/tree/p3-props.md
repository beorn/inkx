---
id: "@km/tui/tree/p3-props"
aliases:
  - km-tui.tree.p3-props
  - km-tui-tree-p3-props
created_by: Bjørn Stabell
created_at: 2026-04-08T23:59:00Z
closed_at: 2026-04-09T00:29:26Z
close_reason: ancestorDone prop deleted from NodeView.tsx, replaced with
  doneAncestor signal via useDoneAncestor hook. shouldStripColor comment updated
  (4→2 implementations). Commit 699f6f4f3.
---

# [x] Phase 3: Eliminate prop drilling — ancestorDone + shouldStripColor via signals @km/tui #task #P1

## What

Replace ancestorDone prop drilling in NodeView.tsx with doneAncestor signal reads. Unify shouldStripColor computation (currently 4 different implementations across 4 files) into a single derivation from signals.

## Changes

- \`NodeView.tsx\` — delete ancestorDone prop (7 refs). Read doneAncestor from useTreeNode(nodeId) instead. shouldDim = isDoneOrDropped || doneAncestor().
- \`TreeNode.tsx\` — unify shouldStripColor: derive from cursor || selectedAncestor || doneAncestor signals (currently inline, verify unified)
- \`selection-style.ts\` — update comment documenting the 4 implementations (now 1)

## Delete

- ancestorDone prop from NodeView and NodeLineView interfaces
- Duplicate shouldStripColor logic (consolidate to one derivation)

## /complete

\`\`\`bash
rg 'ancestorDone' --glob '!.beads' --glob '!docs' -t ts -c | wc -l  # 0
rg 'shouldStripColor.*4 different\|computed 4' --glob '!.beads' -t ts  # 0 (stale comment gone)
bun run test:fast  # all pass
\`\`\`