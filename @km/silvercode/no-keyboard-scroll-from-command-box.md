---
id: "@km/silvercode/no-keyboard-scroll-from-command-box"
aliases:
  - km-silvercode.no-keyboard-scroll-from-command-box
  - km-silvercode-no-keyboard-scroll-from-command-box
created_by: claude:2405c72e
created_at: 2026-04-26T08:59:53Z
closed_at: 2026-04-26T09:34:16Z
close_reason: Fixed via silvery imperative scroll API + app-level Shift+nav
  bindings. See bead notes for commit refs (silvery 703cc7d9, silvercode
  4fa47ef94, km root 00042ee20). 6 silvery tests + 1 silvercode smoke test pass.
---

# [x] No keyboard way to scroll MessageList from CommandBox focus @km/silvercode #bug #P1 @claude:2405c72e

blocks:: [[@km/silvercode]]

silvercode user can't reliably scroll the MessageList. Investigation via TTY MCP confirmed: ArrowUp/ArrowDown/PageUp/PageDown all have no effect on MessageList scrolling when focus is in CommandBox (the default state). Root cause: (1) silvercode's index.tsx passes handleTabCycling:false to silvery so Tab can't move focus from CommandBox to MessageList; (2) App.tsx has no app-level scroll keybindings (grepped — no Arrow/PageUp/PageDown handlers anywhere); (3) ListView.nav is set but only fires when ListView itself has focus — which it never does. Mouse wheel can scroll IF the user is actually using mouse, but keyboard-only users have no way. User report: 'scrolling doesn't work, not reliably'. Fix options: (a) app-level Shift+Up/Down or Ctrl+Up/Down handlers that call listViewRef.scrollToItem; (b) Tab handoff from CommandBox to MessageList via onEdge or new chord; (c) automatic forwarding of keys to MessageList when CommandBox is empty. Recommend (a) — simplest and matches Claude Code convention.