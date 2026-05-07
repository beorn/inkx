---
mentions:
  - km
id: "@km/tui1/9-mouse-support-improvements"
aliases:
  - km-tui1.9
  - km-tui1-9
  - "@km/tui1/9"
created_at: 2026-01-16T23:46:52Z
closed_at: 2026-01-17T20:49:16Z
---

# [x] Mouse support improvements @km/tui1 #feature #P2

Improve mouse support in TUI1.

## Current State

TUI1 has a mouse handler at apps/@km/tui/packages/@km/_orphan/ink/src/mouse-handler.ts that supports:

- Click to select
- Basic mouse tracking
- Drag-select with SelectionManager

## Implemented

- [x] Scroll wheel support - scrolls through cards in current column

## Remaining Improvements

- [ ] Double-click to drill into (zoom)
- [ ] Right-click context menu
- [ ] Mouse hover highlighting
- [ ] Drag to reorder items
- [ ] Click to select specific card (coordinate mapping)

## Considerations

- Terminal mouse mode compatibility varies
- May conflict with terminal's own mouse handling
- Should be optional/configurable

## Files

- apps/@km/tui/packages/@km/_orphan/ink/src/mouse-handler.ts
- apps/@km/tui/packages/@km/_orphan/ink/src/views/Board.tsx (mouse integration)

