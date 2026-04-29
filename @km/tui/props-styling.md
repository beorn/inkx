---
id: "@km/tui/props-styling"
aliases:
  - km-tui.props-styling
  - km-tui-props-styling
created_by: claude:8f007ba9
created_at: 2026-02-19T17:26:14Z
closed_at: 2026-02-19T17:44:24Z
owner: bjorn@stabell.org
---

# [x] Detail pane props: values should always be colored, not grey-on-grey @km/tui #bug #P2

In the detail pane metadata section (ID, Type, Location, Mentions, Depth), some values render grey-on-grey (nearly invisible) while others render in visible colors. User wants: key always grey, value always a visible color. Screenshots: ~/Desktop/Screenshot 2026-02-19 at 13.21.53.png and 13.21.58.png. Currently Location and Mentions values have color but ID, Type, Depth values are dim grey.