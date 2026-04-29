---
id: "@km/_orphan/xls7g"
aliases:
  - km-xls7g
created_by: claude:fd695049
created_at: 2026-03-04T14:25:36Z
closed_at: 2026-03-04T15:01:35Z
---

# [x] Enter doesn't exit edit mode; edit content differs from saved content @km/_orphan #bug #P1 @claude:fd695049

Two related bugs when editing:
1. Pressing Enter should exit inline edit mode but doesn't work
2. Edit mode shows different content from what's displayed after exiting (e.g., title shows 'Norway #norway +fam-travel and' in edit but 'Norway #norway +fam-travel' after exit). Likely a caching issue where the edit buffer has stale/wrong initial content.

Screenshots: ~/Desktop/Screenshot 2026-03-04 at 14.18.05.png (edit mode), ~/Desktop/Screenshot 2026-03-04 at 14.17.59.png (after exit)