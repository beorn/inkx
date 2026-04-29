---
id: "@km/tui/hr-render"
aliases:
  - km-tui.hr-render
  - km-tui-hr-render
created_by: claude:a5c7f7de
created_at: 2026-02-15T13:48:36Z
closed_at: 2026-02-15T14:17:19Z
---

# [x] HR node rendering: show as borderless horizontal line aligned with card borders @km/tui #bug #P2 @claude:a5c7f7de

HR nodes should render as a simple horizontal line (aligned with and as long as card borders) when not being edited. Currently they render with a border/card frame like other nodes. When editing, HR should convert to an editable '---' text.