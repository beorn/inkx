---
mentions:
  - km
  - claude
id: "@km/5us8s"
aliases:
  - km-5us8s
  - "@km/_orphan/5us8s"
created_by: claude:66356066
created_at: 2026-02-24T22:38:07Z
closed_at: 2026-03-04T12:55:25Z
owner: bjorn@stabell.org
assignee: claude:0b75d39f
---

# [x] Workspace chrome, shared PaneBar, detail as view type @km/5us8s #epic #P2 @claude:0b75d39f

Three-part refactor for workspace architecture:

## Phase 1: Lift Workspace Chrome (TODO)

Lift command box, find bar, status bar, dialogs, toasts from Board to Workspace level. Currently these are board-owned but should be workspace-owned so they persist across pane switches.

## Phase 2: Shared PaneBar (TODO)

Shared PaneBar component for all pane types (board, detail, future panes). Currently each pane type has its own header logic.

## Phase 3: Detail Pane as View Type (PARTIAL)

Detail pane reuses column infrastructure instead of ad-hoc rendering.

- [x] 3A: ViewNavigation interface — columns, navigation, cursor classification are view-mode-owned
- [x] 3D: classifyCursor on ViewNavigation — removed isDetail hack from SELECT fast path
- [ ] Detail pane renders like a column (top bar = item, props as focusable rows)
- [ ] j/k navigation within detail pane
- [ ] Focus dimming: unfocused pane has dimmed $selected/$selectedbg

