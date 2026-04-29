---
id: "@km/tui/hide-parent-sigil"
aliases:
  - km-tui.hide-parent-sigil
  - km-tui-hide-parent-sigil
created_by: claude:586bad48
created_at: 2026-02-12T14:15:09Z
closed_at: 2026-02-15T09:07:10Z
owner: bjorn@stabell.org
assignee: claude:586bad48
---

# [x] Hide redundant sigil backlink on embedded links (e.g. @next inside @next column) @km/tui #bug #P3 @claude:586bad48

When viewing a column like @next that shows embedded links (tasks linked to @next), each card displays the node's title which includes the @next sigil backlink. This is redundant — you're already inside @next, so seeing '@next' on every card is noise. Fix: when rendering a card that is an embedded link, suppress/hide the sigil tag that matches the current column's query context. E.g., inside @next column, don't render the '@next' portion of embedded card titles.