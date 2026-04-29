---
id: "@km/tui/column-empty-space-deselect"
aliases:
  - km-tui.column-empty-space-deselect
  - km-tui-column-empty-space-deselect
created_by: Bjørn Stabell
created_at: 2026-04-07T21:42:04Z
closed_at: 2026-04-07T22:56:04Z
close_reason: >-
  Fixed (second attempt). Empty-space click now truly deselects (cursor=null,
  sel.kind='idle') instead of setting cursor=rootId which was tinting the whole
  board.


  Changes:

  - board-app.ts: sel.node.select([]) for empty-space path

  - Board.tsx: isBoardSelected = cursorDepth==='board' && cursor===rootId
  (distinguishes 'nav walked up to root' from 'nothing selected'). BoardCore now
  takes cursor prop.

  - CardColumn.tsx: isBoardLevel = selLevel==='board' && cursor!==null (card
  borders no longer fade when deselected)

  - testing.ts, screenshot.ts, storybook.tsx: pass cursor to BoardCore

  - mouse-click.test.ts: updated test + 2 new tests for top-bar and
  view-mode-button clicks


  15/15 mouse-click tests pass. km-tui suite 1596/1605 (only pre-existing
  symlink flake).
---

# [x] Clicking column empty space below last card should deselect, not select column @km/tui #bug #P2 @Bjørn Stabell
