---
id: "@km/tui/cursor-context"
aliases:
  - km-tui.cursor-context
  - km-tui-cursor-context
created_by: Bjørn Stabell
created_at: 2026-04-01T18:26:55Z
closed_at: 2026-04-02T02:19:52Z
close_reason: classifyCursorFromViewIndex() replaces deriveCursorAncestors — 15
  lines vs 70. ViewNode parent pointers derive card/column/selectionLevel.
  cursor-store.ts 209→91 lines. Commit 216eadb8.
---

# [x] CursorContext: single computed context replaces 3-field cursor model @km/tui #task #P2 @Bjørn Stabell

Replace cursorNodeId + cursorCardNodeId + cursorColumnNodeId with a single CursorContext computed from cursorNodeId + tree position.

CursorContext contains:
- node, visualRole (board|column|card|subitem)
- parent chain, siblings, isFirstChild, isLastChild, hasChildren, isIndentable
- selection: Set<string> of selected node IDs (cursor is always in the set)
- selectionAnchor: the node where shift-selection started

Every editing operation receives CursorContext. Multi-select operations (indent, delete, move) use selection. Single-node operations (split, merge) use cursor only.

Eliminates: per-handler re-derivation, inlineEditBlock.nodeId vs cursorNodeId ambiguity, cursorCardNodeId/cursorColumnNodeId caches, separate selection queries.