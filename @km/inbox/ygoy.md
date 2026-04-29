---
id: "@km/_orphan/ygoy"
aliases:
  - km-ygoy
created_at: 2026-01-16T10:49:50Z
closed_at: 2026-01-16T11:43:05Z
---

# [x] Implement Moving (m + destination) for arbitrary node relocation @km/_orphan #feature #P4

Implement moving functionality per @km/board-navigation/md spec.

## Spec Requirements

| Term | Meaning | Keys |
|------|---------|------|
| Moving | Moving node(s) from anywhere to anywhere | m + destination |

## Design Questions
This feature needs design work:
- What is 'destination' syntax? Options:
  - Vim-like marks (ma to mark, 'm to jump, then move)
  - Path-based (m /column2/card3)
  - Interactive picker (m opens modal to select destination)
  - Cursor-based (m, then navigate to destination, then confirm)

## Implementation Approach (TBD)
Likely: 'm' enters 'move mode', user navigates to destination, Enter confirms, Escape cancels.

### Possible Flow
1. Select node(s) to move
2. Press 'm' to enter move mode
3. Navigate with hjkl to destination
4. Press Enter to move node(s) there
5. Or press Escape to cancel

## Acceptance Criteria
- [ ] Can move single node to arbitrary location
- [ ] Can move multi-selected nodes together
- [ ] Clear visual feedback during move mode
- [ ] Changes persist to filesystem
- [ ] Undo support (future)

## Dependencies
- @km/_orphan/t2q4 (CURSOR_* actions)
- @km/_orphan/uwdy (SHIFT_* actions) - may share implementation
- @km/_orphan/store tree mutation API

## Priority
P4 (backlog) - This is lower priority than basic navigation and shifting.