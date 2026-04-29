---
id: "@km/tui/text-cursor-nav"
aliases:
  - km-tui.text-cursor-nav
  - km-tui-text-cursor-nav
created_by: claude:a5c7f7de
created_at: 2026-02-14T21:46:23Z
closed_at: 2026-02-17T01:26:04Z
---

# [x] Text edit mode: arrow keys move text cursor within/across blocks, preserve stickyX @km/tui #feature #P2 @claude:97217d5d

In text edit mode, cursor movement keys (arrows, hjkl) should move the text cursor within the current block and across blocks rather than exiting text mode. Implement stickyX (like other text editors' column memory) based on visual X position (accounting for line wraps). Navigate up/down across blocks and into other items as needed while staying in text edit mode.