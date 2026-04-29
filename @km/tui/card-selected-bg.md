---
id: "@km/tui/card-selected-bg"
aliases:
  - km-tui.card-selected-bg
  - km-tui-card-selected-bg
created_by: Bjørn Stabell
created_at: 2026-04-01T14:45:00Z
owner: bjorn@stabell.org
---

# [ ] Show faint selected background on entire card when card-level cursor is on it @km/tui #feature #P3

When a card is selected (cursor at card level, not on sub-items), show a very faint selectedbg highlight across the entire card body. This makes it visually clear which card is 'current' without relying solely on the cursor indicator. Should use a semantic theme token like $selected-bg or $surface-selected.