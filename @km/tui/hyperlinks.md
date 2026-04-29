---
id: "@km/tui/hyperlinks"
aliases:
  - km-tui.hyperlinks
  - km-tui-hyperlinks
created_by: claude:d3a7049b
created_at: 2026-02-20T15:18:08Z
closed_at: 2026-02-23T01:20:37Z
owner: bjorn@stabell.org
assignee: claude:97b8de73
---

# [x] Click on hyperlinks/URLs to open in browser @km/tui #feature #P3 @claude:97b8de73

When user clicks a URL in card content or detail pane, open it in default browser. Approach: 1) OSC 8 hyperlinks (Ghostty supports), 2) URL detection in rendered text, 3) Mouse click → URL position mapping, 4) open command to launch browser.