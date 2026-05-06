---
mentions:
  - km
  - claude
id: "@km/tui/favorites-dialog"
aliases:
  - km-tui.favorites-dialog
  - km-tui-favorites-dialog
created_by: claude:56a1fd6b
created_at: 2026-03-04T07:21:27Z
closed_at: 2026-03-04T07:43:29Z
owner: bjorn@stabell.org
assignee: claude:56a1fd6b
---

# [x] FavoritesDialog: show all locations organized by type, empty slots for 0-9 @km/tui #feature #P2 @claude:56a1fd6b

Redesign FavoritesDialog list view to show ALL locations organized by type:

**System locations** (h=home, i=inbox, j=journal, a=archive, p=parent, g=first, G=last)
**Picker locations** (#=tag, @=assignee, +=project, [=item)
**Digit favorites** (0-9) — show all 10 slots, unassigned ones show '(empty)'
**Custom favorites** (any other assigned keys)

Currently only shows assigned favorites. Should show all locations in a columnar layout organized by type, making the full vocabulary visible at a glance. Digit slots 0-9 should always appear even when empty.

