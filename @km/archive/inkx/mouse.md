---
mentions:
  - km
id: "@km/inkx/mouse"
aliases:
  - km-inkx.mouse
  - km-inkx-mouse
created_at: 2026-02-04T11:24:01Z
closed_at: 2026-02-15T14:52:03Z
---

# [x] Full mouse integration @km/inkx #epic #P4

## Epic: Full Mouse Integration

Comprehensive mouse support for the TUI.

**Key insight**: inkx provides `useLayout()` hook giving absolute screen positions for every component - this makes hit-testing feasible via centralized hit registry.

## Sub-tasks

| ID                  | Title                                       | Depends on                               |
| ------------------- | ------------------------------------------- | ---------------------------------------- |
| @km/_orphan/mouse-1 | Infrastructure: hit registry + scroll wheel | -                                        |
| @km/_orphan/mouse-2 | Click-to-select + fold toggle               | @km/_orphan/mouse-1                      |
| @km/_orphan/mouse-3 | Double-click drill-in                       | @km/_orphan/mouse-2                      |
| @km/_orphan/mouse-4 | Drag area select (rectangle)                | @km/_orphan/mouse-2                      |
| @km/_orphan/mouse-5 | Drag & drop (move cards/nodes)              | @km/_orphan/mouse-2, @km/_orphan/mouse-4 |
| @km/_orphan/mouse-6 | Click to follow links                       | @km/_orphan/mouse-2                      |

## Features

- Scroll wheel navigation
- Click-to-select
- Click to fold/unfold tree nodes
- Click to follow links
- Double-click drill-in
- Drag area select (rectangle multi-select)
- Drag & drop (move cards, nodes, columns, multi-selections)

## Incremental PRs

1. PR 1: @km/_orphan/mouse-1 (infrastructure + scroll)
2. PR 2: @km/_orphan/mouse-2 (click-to-select + fold)
3. PR 3: @km/_orphan/mouse-3 (double-click)
4. PR 4: @km/_orphan/mouse-4 (drag area select)
5. PR 5: @km/_orphan/mouse-5 (drag & drop)
6. PR 6: @km/_orphan/mouse-6 (click links)

## Risks & Mitigations

- Link click complexity → Start with whole-node links
- Scroll offset edge cases → Test with scrolled content
- Z-index conflicts → Explicit values (dialogs=10, cards=1)
- Terminal compat → Feature-detect, keyboard fallback
- Drag ghost rendering → Use cursor indicator instead
- Drop zone accuracy → Forgiving hit areas

