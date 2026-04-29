---
id: "@km/tui/delete-forward"
aliases:
  - km-tui.delete-forward
  - km-tui-delete-forward
created_by: claude:22727d86
created_at: 2026-02-16T10:50:14Z
closed_at: 2026-02-16T10:55:46Z
---

# [x] Delete key: forward delete with merge-with-next at boundary @km/tui #feature #P2 @claude:22727d86

Implement Delete key (forward delete) as the mirror of Backspace, with smart boundary behavior.

## Text Edit Mode

### Mid-content
Already works: deleteForward() removes char after cursor.

### At end of content (cursor at content.length)
Merge next sibling into current node:
- Current node survives (keeps type, traits, depth)
- Next sibling's text is appended to current content
- Next sibling is deleted

Edge cases (mirror of mergeWithPrevious):
- Next exists, empty, no children → delete next
- Next exists, has content, no children → append next text to current, delete next
- Next exists, has children → append text, reparent children under current
- No next sibling → boundary (bell)

### On empty node
Delete on empty = delete the node (same as backspace-on-empty). Symmetric behavior.

## Node Mode (not editing)
Delete key in node mode = noop. Only D (capital) deletes nodes with confirmation. Delete key is too easy to hit accidentally.

## Implementation

1. Add mergeWithNext() to @km/tree/block-ops.ts (mirror of mergeWithPrevious)
2. Update TEXT_DELETE_FORWARD in board-actions.ts with smart boundary check
3. Tests for mergeWithNext + integration tests for the full flow