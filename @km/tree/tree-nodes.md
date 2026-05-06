---
mentions:
  - km
  - Bjørn
id: "@km/tree/tree-nodes"
aliases:
  - km-tree.tree-nodes
  - km-tree-tree-nodes
created_by: Bjørn Stabell
created_at: 2026-04-02T20:12:21Z
closed_at: 2026-04-02T20:35:00Z
close_reason: "Shipped by km-work: TreeWalk.nodes() with match+into+reverse, 30
  tests, object match shorthand, type-narrowing predicates. Commits 66566b68,
  580ebd74, 6456dbea."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Tree.nodes(): SlateJS-style pluggable tree traversal @km/tree #task #P2 @Bjørn Stabell

Replace walkTree standalone function with Tree.nodes() method -- SlateJS-inspired pluggable traversal.

## Design (from SlateJS)

Tree.nodes(rootId, opts?) yields nodes in DFS order with pluggable behavior:

- match?: (node) => boolean -- which nodes to yield (always walk children regardless)
- reverse?: boolean -- bottom-up traversal (for ctrl-p)
- mode?: "all" | "highest" | "lowest" -- match mode
- at?: string -- start from specific node (replaces startAfter)

No separate skip/filter -- always walks full tree, match controls what is yielded.
Simpler than current walkTree which conflates filtering (what to yield) with pruning (what subtrees to skip).

## Why

Current nav code (findAdjacentEditNode, findDeepestLast, isAncestorOf) each reimplements tree walking with different ad-hoc approaches. Tree.nodes() is the single composable primitive:

- ctrl-n: Tree.nodes(cardId, { match: isNavigable }) -- next visible node
- ctrl-p: Tree.nodes(cardId, { match: isNavigable, reverse: true }) -- prev visible
- isAncestorOf: just walk and check
- findDeepestLast: Tree.nodes(cardId, { reverse: true }).next() -- first in reverse

## Visibility predicates (compose with match)

- isNavigable(node) -- can cursor land here? not filtered, not collapsed, not hidden
- isEditable(node) -- can edit mode target? Same as navigable for now
- Truncation (maxContentLines) is render context, not tree context -- handled separately

## Key files

- packages/@km/tree/src/walk.ts -- rewrite as Tree.nodes()
- apps/@km/tui/src/board/board-actions.ts -- replace findAdjacentEditNode/findDeepestLast
- apps/@km/tui/src/views/TreeNode.tsx -- replace isAncestorOf
- apps/@km/tui/src/views/Board.tsx -- replace walk-up loop

## Related

- @km/tui/plugin-architecture (TEA state machines vision)
- @km/all/simplification (architecture review)
- SlateJS Editor.nodes() reference

