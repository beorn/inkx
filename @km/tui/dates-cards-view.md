---
mentions:
  - km
id: "@km/tui/dates-cards-view"
aliases:
  - km-tui.dates-cards-view
  - km-tui-dates-cards-view
created_by: claude:124bfbe5
created_at: 2026-02-14T08:46:40Z
closed_at: 2026-02-14T15:40:49Z
owner: bjorn@stabell.org
---

# [x] Due date and priority not showing in cards view @km/tui #bug #P2

Due dates, priority, and other date properties (set via 'td' command) are not visible in the cards view. These properties should be displayed as right-aligned badges on the card, similar to how they appear in TreeNode. May be a rendering issue where the date badges are not being passed through to the card display in cards view mode.

