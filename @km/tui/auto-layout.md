---
id: "@km/tui/auto-layout"
aliases:
  - km-tui.auto-layout
  - km-tui-auto-layout
created_at: 2026-02-04T13:01:27Z
closed_at: 2026-02-04T13:56:35Z
assignee: claude:27f1a547
---

# [x] Audit TUI for manual width/height calculations — migrate to flex layout @km/tui #task #P3 @claude:27f1a547

Review entire @km/tui codebase for places we manually calculate heights, widths, dimensions, padding instead of relying on flexx/inkx auto-layout.

### Known patterns to address
- `innerWidth = Math.max(10, width - 8)` calculations in dialog components
- `contentHeight = termHeight - TOP_BAR_HEIGHT - BOTTOM_BAR_HEIGHT` in Board.tsx
- Manual `maxVisible = height - N` calculations for virtual scrolling
- `Math.floor(termWidth / N)` for dialog positioning
- Manual column width distribution in BoardCore

### Approach
Use flexGrow, flexShrink, overflow=hidden, width='100%', and let inkx handle sizing. Manual calculations should only remain where virtual scrolling requires knowing item count.

### Files to audit
- apps/@km/tui/src/views/Board.tsx (dialog positioning, layout constants)
- apps/@km/tui/src/views/board-layout.ts (TOP_BAR_HEIGHT, BOTTOM_BAR_HEIGHT)
- apps/@km/tui/src/views/HelpOverlay.tsx (boxWidth, contentWidth manual calc)
- apps/@km/tui/src/views/ConsoleModal.tsx (contentHeight manual calc)
- apps/@km/tui/src/views/ProjectPicker.tsx (maxVisible, scroll)
- apps/@km/tui/src/views/SearchDialog.tsx (maxVisible, scroll)
- apps/@km/tui/src/views/CardColumn.tsx
- apps/@km/tui/src/views/ListView.tsx, ColumnsView.tsx, TabsView.tsx