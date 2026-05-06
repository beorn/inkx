---
mentions:
  - km
  - claude
id: "@km/tui/internal-links"
aliases:
  - km-tui.internal-links
  - km-tui-internal-links
created_by: claude:656602a3
created_at: 2026-03-16T20:55:04Z
closed_at: 2026-03-19T17:31:14Z
close_reason: "Fixed: internal-link.ts with parseKmUrl + resolveKmLink
  supporting km://node/, km://wiki/, km://block/ schemes. Board.tsx
  handleInternalLink updated. Test: internal-link.test.ts (20 tests)."
owner: bjorn@stabell.org
assignee: claude:21c57d63
---

# [x] Internal link navigation (km:// wiki/block refs) @km/tui #feature #P2 @claude:21c57d63

Wiki links and block refs now emit OSC 8 hyperlinks with km://wiki/ and km://block/ schemes. Add onClick handlers to navigate to the linked node when clicked. This enables mouse-driven navigation between linked notes/blocks in the TUI.

