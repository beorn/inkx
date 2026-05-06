---
mentions:
  - km
projects:
  - hjkl
id: "@km/inbox/uwdy"
aliases:
  - km-uwdy
  - "@km/_orphan/uwdy"
created_at: 2026-01-16T10:49:38Z
closed_at: 2026-01-16T11:34:11Z
---

# [x] Implement Shifting (opt+hjkl) for moving nodes visually @km/_orphan #feature #P3

Implement shifting functionality per @km/board-navigation/md spec.

## Spec Requirements

Move selected node(s) in visual direction:

| Key   | Action                               |
| ----- | ------------------------------------ |
| ⌥j/⌥↓ | Move down (swap with next sibling)   |
| ⌥k/⌥↑ | Move up (swap with previous sibling) |
| ⌥h/⌥← | Move to previous column (or outdent) |
| ⌥l/⌥→ | Move to next column (or indent)      |

## Implementation

### 1. New Action Types (types.ts)

- SHIFT_UP
- SHIFT_DOWN
- SHIFT_LEFT
- SHIFT_RIGHT

### 2. Reducer Logic (treeReducer.ts)

Unlike cursoring (which just moves cursor), shifting actually modifies the tree:

- SHIFT_UP/DOWN: Swap node with sibling (reorder within parent)
- SHIFT_LEFT: Move to previous column / outdent (reparent)
- SHIFT_RIGHT: Move to next column / indent (reparent)

This requires coordination with @km/_orphan/store since it modifies actual data, not just view state.

### 3. Key Mappings (shellExecutor.ts)

- opt+h/← → SHIFT_LEFT
- opt+j/↓ → SHIFT_DOWN
- opt+k/↑ → SHIFT_UP
- opt+l/→ → SHIFT_RIGHT

### 4. Commands (commandParser.ts)

- shift_up, shift_down, shift_left, shift_right

## Complexity

This is more complex than cursor/selection because it modifies data:

- Need to update @km/_orphan/store (move node in tree)
- Need to sync to filesystem (markdown file changes)
- Need to preserve cursor on moved node
- Multi-select: move all selected nodes together

## Acceptance Criteria

- [ ] opt+j moves node down (swaps with next sibling)
- [ ] opt+k moves node up (swaps with previous sibling)
- [ ] opt+l moves node to next column / indents
- [ ] opt+h moves node to previous column / outdents
- [ ] Cursor follows the moved node
- [ ] Changes persist to filesystem
- [ ] Multi-select moves all selected nodes

## Dependencies

- @km/_orphan/t2q4 (CURSOR_* actions) for visual order understanding
- May need @km/_orphan/store changes for tree mutation API

