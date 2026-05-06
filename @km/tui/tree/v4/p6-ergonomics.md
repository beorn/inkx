---
mentions:
  - km
id: "@km/tui/tree/v4/p6-ergonomics"
aliases:
  - km-tui.tree.v4.p6-ergonomics
  - km-tui-tree-v4-p6-ergonomics
created_by: Bjørn Stabell
created_at: 2026-04-09T04:11:03Z
closed_at: 2026-04-09T04:25:59Z
close_reason: All view components migrated to useTreeNode().
  ReactiveNodeStoreContext/Provider compat re-exports already gone. Commit
  9795cfaf0.
owner: bjorn@stabell.org
---

# [x] Phase 6: useTreeNode adoption + compat re-export cleanup @km/tui #task #P2

## What

Migrate all \`nodeStore.reduced.get(id)\` calls in view components to \`useTreeNode(id)\` hook. Delete ReactiveNodeStoreContext/Provider compat re-exports.

## Changes

- \`TreeNode.tsx\` — replace \`nodeStore.reduced.get(node.id)\` with \`useTreeNode(node.id)\` (3 call sites)
- \`CardColumn.tsx\` — replace \`nodeStore.reduced.get(nodeId)\` with \`useTreeNode(nodeId)\` (1 call site)
- \`NodeView.tsx\` — replace raw \`store?.reduced.get(nodeId)\` with useTreeNode or direct NodeStoreContext usage (1 call site)
- \`use-card-interaction.tsx\` — replace \`nodeStore.reduced.get(nodeId)\` with \`useTreeNode(nodeId)\` (1 call site)
- \`reactive.ts\` — delete ReactiveNodeStoreContext + ReactiveNodeStoreProvider re-exports (lines 283-287)

## Delete

- \`ReactiveNodeStoreContext\` alias
- \`ReactiveNodeStoreProvider\` alias
- All \`reduced.get()\` calls in view components (replaced by useTreeNode)

## /complete

\`\`\`bash
rg 'ReactiveNodeStoreContext|ReactiveNodeStoreProvider' --glob '!.beads' --glob '!docs' -t ts -c | wc -l  # 0
rg 'reduced\.get' apps/km-tui/src/views/ apps/km-tui/src/hooks/ --glob '!*.test.*' -t ts -c | wc -l  # 0
bun tsc --noEmit  # 0 new errors
\`\`\`

