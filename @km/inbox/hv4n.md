---
id: "@km/_orphan/hv4n"
aliases:
  - km-hv4n
created_at: 2026-01-15T22:32:08Z
closed_at: 2026-01-16T07:40:32Z
---

# [x] Epic: Three-Layer TUI Architecture Refactoring @km/_orphan #epic #P1

Refactor the TUI packages to implement the three-layer architecture:

```
Entry Point (apps/km-cli/view)  → Imports @km/tui
TUI Layer (@km/tui)             → App state, views, components, rendering
Model Layer (@km/core)          → Node state, board state, navigation
Storage Layer (@km/storage)     → Persistence, file sync (exists)
```

**@km/core internal structure:**
- node/ - NodeState, queries, nodeReducer (structural)
- board/ - BoardState, boardReducer, spatialNav (visual navigation)

**Three reducers:**
- appReducer (@km/tui) - modal state, view config
- boardReducer (@km/core) - cursor, selection, navigation
- nodeReducer (@km/core) - node mutations

**Benefits:**
- Reusable model logic across different UIs (TUI, web, etc.)
- Testable navigation without rendering
- Clean separation between rendering and state
- Clear node (structural) vs board (visual) separation

See specs/@km/tui-state/md for full architecture documentation.