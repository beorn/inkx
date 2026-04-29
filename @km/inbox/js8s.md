---
id: "@km/_orphan/js8s"
aliases:
  - km-js8s
created_at: 2026-01-16T10:49:25Z
closed_at: 2026-01-16T11:32:43Z
---

# [x] Implement Extend-Select (shift+hjkl) for multi-node selection @km/_orphan #feature #P3

Implement extend-select functionality per @km/board-navigation/md spec.

## Spec Requirements

Extend selection in visual direction (like text selection):

| Key | Action |
|-----|--------|
| ⇧j/⇧↓ | Extend selection down |
| ⇧k/⇧↑ | Extend selection up |
| ⇧h/⇧← | Extend selection left (cross-column) |
| ⇧l/⇧→ | Extend selection right (cross-column) |

## Implementation

### 1. New Action Types (types.ts)
- EXTEND_SELECT_UP
- EXTEND_SELECT_DOWN
- EXTEND_SELECT_LEFT
- EXTEND_SELECT_RIGHT

### 2. Reducer Logic (treeReducer.ts)
Extend selection from current cursor to visually adjacent node:
- Track selection anchor (start of selection)
- Add nodes between anchor and new cursor to selectedNodes
- Follow visual order (same as CURSOR_* actions)

### 3. Key Mappings (shellExecutor.ts)
- shift+h/← → EXTEND_SELECT_LEFT
- shift+j/↓ → EXTEND_SELECT_DOWN
- shift+k/↑ → EXTEND_SELECT_UP
- shift+l/→ → EXTEND_SELECT_RIGHT

### 4. Commands (commandParser.ts)
- extend_select_up, extend_select_down, extend_select_left, extend_select_right

## State Changes
May need to add to TreeState:
- selectionAnchor: CursorPath | null - starting point of range selection

## Acceptance Criteria
- [ ] shift+j extends selection to include next visual node
- [ ] shift+k extends selection to include previous visual node
- [ ] shift+h/l extend selection across columns
- [ ] Selection can be extended in either direction from anchor
- [ ] Clear selection (Escape) resets anchor

## Dependencies
- @km/_orphan/t2q4 (CURSOR_* actions) should be implemented first