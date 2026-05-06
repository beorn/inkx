---
mentions:
  - km
---

# [x] Phase 5: Selection model — Point/Range types with auto-adjustment @km/storage/tree #task #P3

SlateJS: editor.selection = Range { anchor: Point, focus: Point }
km: cursorNodeId: string (in board store, separate from tree)

Add:

- Point type: { nodeId: string, offset: number } (ID-based, not path-based)
- Range type: { anchor: Point, focus: Point }
- Selection lives on the editor/board state (not on Repo)
- Operations auto-adjust selection (structural guarantee — no stale cursors)

This is what the atomic cursor (Phase 2) points toward. Phase 2 wrapped ops
to dispatch cursor. Phase 5 makes selection PART of the state that ops transform.

Multi-node selection enables: select-all, shift+click range, copy/paste blocks.

