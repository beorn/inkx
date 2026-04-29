---
id: "@km/tui/pane-state"
aliases:
  - km-tui.pane-state
  - km-tui-pane-state
created_by: claude:53ab8041
created_at: 2026-02-28T21:02:36Z
closed_at: 2026-03-04T12:53:40Z
owner: bjorn@stabell.org
assignee: claude:53ab8041
---

# [x] Pane-as-view: per-pane state model replacing flat BoardAppState fields @km/tui #feature #P1 @claude:53ab8041

## Vision

Each pane is a self-contained view into the repo. The workspace manages N panes, each with its own state. No hardcoded one-or-two pane assumption.

## Completed

### Phase 1: Detail pane root into PaneState ✅
### Phase 2: Per-pane UIState fields into BoardPaneState ✅ (21 fields moved)
### Phase 3: Eliminate flat board fields from BoardAppState ✅ (13 fields)

## Remaining

### Phase 4: Lift Workspace Chrome
Move command box, find bar, status bar, dialogs, toasts from Board to Workspace level. These are board-owned but should be workspace-owned so they persist across pane switches.

### Phase 5: Shared PaneBar
Single PaneBar component for all pane types (board, detail, future panes). Currently each pane type has its own header logic.

### Phase 6: Discriminated union pane types
PaneState = BoardPaneState | DetailPaneState | ... on viewType. Future: console, sync, search results.

## Design (unchanged)

workspace: { panes: Map<string, PaneState>, focusedPaneId, layout }
AppState: { workspace, ui (global only), repo, repoPath }
Actions read/write through panes.get(focusedPaneId). Detail pane slavedTo board pane.