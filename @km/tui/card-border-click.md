---
mentions:
  - km
id: "@km/tui/card-border-click"
aliases:
  - km-tui.card-border-click
  - km-tui-card-border-click
created_by: Bjørn Stabell
created_at: 2026-04-14T05:05:10Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tui.card-border-click
    depends_on_id: km-tui
    type: parent-child
    created_at: 2026-04-13T22:05:31Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-tui
---

# [ ] Clicking card border selects card then column @km/tui #bug #P3

blocks:: [[@km/tui]]

When clicking on a card's border (the round corners or vertical edges), the click first selects the card, then selects the parent column. Should only select the card. Pre-existing behavior, not caused by outline migration. Likely a hit-test bubbling or duplicate handler issue.

