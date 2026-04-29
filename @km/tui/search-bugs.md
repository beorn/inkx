---
id: "@km/tui/search-bugs"
aliases:
  - km-tui.search-bugs
  - km-tui-search-bugs
created_at: 2026-02-04T12:48:35Z
closed_at: 2026-02-04T13:01:36Z
---

# [x] Search dialog (/) display issues and Enter-to-select broken @km/tui #bug #P2 @claude:44a381e0

Two issues with the / search dialog in km view:

1. **Display bleed-through**: Board content bleeds through the search overlay, making results hard to read. The dialog uses position=absolute with ModalDialog (double border + black background) but content beneath still shows through gaps between result lines.

2. **Enter-to-select is a no-op**: handleSearchSelect in use-board-dialogs.ts hides the dialog but never navigates to the selected node. There's a TODO comment: 'Implement navigation to selected node'. The fix needs to dispatch a SELECT action to dispatchBoard with the target node's ID, similar to how handleDetailPaneKeyInput does it.

### Files involved
- apps/@km/tui/src/views/SearchDialog.tsx — search UI component
- apps/@km/tui/src/views/Board.tsx:417-431 — dialog positioning
- apps/@km/tui/src/views/use-board-dialogs.ts:102-112 — handleSearchSelect (broken)
- apps/@km/tui/src/views/shared-components.tsx:277-296 — ModalDialog component

### Reproduction
1. Run bun km view on any folder with content
2. Press / to open search dialog
3. Observe board content bleeding through behind the dialog
4. Type a search query, select a result with arrows, press Enter
5. Dialog closes but cursor does not navigate to the selected item

### Screenshot
~/Desktop/Screenshot 2026-02-04 at 12.46.08.png