---
mentions:
  - km
  - Bjørn
id: "@km/tui/title-as-card"
aliases:
  - km-tui.title-as-card
  - km-tui-title-as-card
created_by: Bjørn Stabell
created_at: 2026-03-31T20:56:39Z
closed_at: 2026-04-01T06:33:11Z
close_reason: Double-click check was after isColumnNode early return. Moved
  before — double-click on column headers enters inline edit. Single-click
  select + Enter edit + k navigation all verified working.
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Column/board titles should act like cards for their container @km/tui #feature #P2 @Bjørn Stabell

Column titles and board titles should behave like cards for the container they represent.

Interactions (matching card behavior):

- Click → select the column/board (partially works)
- Cmd+hover → show outline, clickable to goto/zoom (not implemented)
- Double-click → enter text edit mode (not implemented)
- Enter (selected) → enter edit mode (works)
- Enter (editing, at end) → create child (implemented via editLevel)
- Drag → reorder columns (future)

Concept: every level has a title that IS the card for that level. Board title = card for the board. Column title = card for the column. They share the same interaction model.

