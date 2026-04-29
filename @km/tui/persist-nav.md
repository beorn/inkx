---
id: "@km/tui/persist-nav"
aliases:
  - km-tui.persist-nav
  - km-tui-persist-nav
created_at: 2026-02-04T11:27:23Z
closed_at: 2026-02-04T13:49:17Z
assignee: claude:27f1a547
---

# [x] Persist board navigation state per repo @km/tui #feature #P3 @claude:27f1a547

Persist board navigation state within the same session via navigation history.

## Scope (Clarified)
- In-memory only — no disk persistence needed
- Part of navigation history (back/forward already exists)
- When navigating back, restore: cursor position, zoom level, fold state

## Implementation
The BoardState already tracks cursorNodeId and foldedNodes. Navigation history (navBack/navForward) exists but may not preserve full state. Need to:
1. Snapshot full navigation state on zoom/drill-in
2. Restore on navBack/navForward

## Non-goals
- Cross-session persistence
- Per-repo state files