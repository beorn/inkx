---
mentions:
  - km
id: "@km/tui1/8-component-architecture-documentation"
aliases:
  - km-tui1.8
  - km-tui1-8
  - "@km/tui1/8"
created_at: 2026-01-16T23:47:11Z
closed_at: 2026-01-17T00:38:40Z
---

# [x] Component architecture documentation @km/tui1 #task #P2

Document the TUI1 component architecture for maintainability.

## Goal

Create developer documentation explaining:

- Component hierarchy
- Data flow
- State management
- Render pipeline

## Sections

### Component Hierarchy

```
Board (main container)
├── Header (path, mode indicator)
├── Views (one active at a time)
│   ├── ListView
│   ├── ColumnsView
│   ├── CardsView (via ColumnsView)
│   └── TabsView
├── DetailPane (overlay)
├── ProjectPicker (overlay)
├── HelpOverlay (overlay)
└── StatusBar (bottom)
```

### Data Flow

```
BoardState → View → TreeNode → Text rendering
                               ↓
                           Rich text → Layout → Ink components
```

### State Management

- React useState for local component state
- BoardState for navigation and selection
- Storage layer for persistence

## Files

- Should be added to apps/@km/tui/packages/@km/_orphan/ink/README.md or docs/

