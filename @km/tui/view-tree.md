---
id: "@km/tui/view-tree"
aliases:
  - km-tui.view-tree
  - km-tui-view-tree
created_by: Bjørn Stabell
created_at: 2026-04-01T23:59:51Z
closed_at: 2026-04-02T23:16:18Z
---

# [x] ViewNode tree: explicit visual tree for board state derivation @km/tui #task #P2 @Bjørn Stabell

Replace implicit visual role derivation with an explicit ViewNode tree built once per state change.

PROBLEM: Cursor position is a bare nodeId. Every consumer (3 cursor systems, 2 layout paths, 300-line navigation, 16 action handler files) independently re-derives what that nodeId means in the visual tree — each differently, with different edge-case handling for body content (56 occurrences across 9 files) and embeds (139 cursorCardNodeId/cursorColumnNodeId refs across 20 files).

DESIGN:
ViewNode {
  id: string, role: "board"|"body-column"|"column"|"card"|"subitem",
  dataNodeId: string, parent: ViewNode|null, children: ViewNode[],
  node: KNode, isBody: boolean
}

buildViewTree(repo, rootId, foldDepths) → ViewNode — pure function, computed once per state change.
cursorPath: string[] — visual hierarchy from root to leaf.
Classification = viewNode.role (O(1), never derivation).

WHAT IT ELIMINATES:
- 3 independent cursor classification systems → viewNode.role
- 56 extractBody/isBodyContent occurrences → role:"body-column" at construction
- cursorCardNodeId hint system for embeds → visual parent always correct
- Two layout derivation paths → both consume same ViewNode tree
- 300-line navigation branching → DFS traversal (~30 lines)
- __body__ virtual nodes (40 special cases) → first-class ViewNode
- buildActionCtx 80-line re-derivation → viewTree.lookup(cursorId)

5-PHASE MIGRATION:
1. Build buildViewTree() alongside existing code, assert equivalence
2. Migrate navigation to ViewNode tree
3. Migrate React components (ViewNode replaces ColumnView/CardView)
4. Migrate action handlers (ViewNode cursor context replaces ActionCtx derivation)
5. Delete old code

SUBSUMES: @km/tui/cursor-path, @km/tui/cursor-context
ALIGNS WITH: @km/tui/board-apply (Board.apply operates on ViewNode tree)

External review (Gemini 2.5 Pro) confirmed: body problem and embed problem are the same problem — data tree and visual tree have different shapes. ViewNode makes the visual tree explicit.