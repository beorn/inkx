---
mentions:
  - km
  - claude
id: "@km/inkx/kitty-auto"
aliases:
  - km-inkx.kitty-auto
  - km-inkx-kitty-auto
created_by: claude:d3a7049b
created_at: 2026-02-20T14:04:23Z
closed_at: 2026-02-20T14:18:09Z
owner: bjorn@stabell.org
assignee: claude:d3a7049b
---

# [x] Auto-enable/disable Kitty protocol in runtime @km/inkx #task #P2 @claude:d3a7049b

run() and createApp() should automatically enable Kitty keyboard protocol on startup (with query-based detection) and disable on exit. Currently apps must manually write enableKittyKeyboard() to stdout. Should: (1) query terminal support via queryKittyKeyboard(), (2) parse response, (3) enable with appropriate flags, (4) push/pop mode stack on startup/shutdown, (5) set kittyMode on the App so press() uses Kitty encoding.

