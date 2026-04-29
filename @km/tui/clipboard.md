---
id: "@km/tui/clipboard"
aliases:
  - km-tui.clipboard
  - km-tui-clipboard
created_by: claude:a5c7f7de
created_at: 2026-02-15T09:21:46Z
closed_at: 2026-02-15T21:07:29Z
---

# [x] Copy/cut/paste: Ctrl-C/X/V (or Cmd-C/X/V) for node-level clipboard operations @km/tui #feature #P2 @claude:34ba82b6

Implement node-level clipboard operations:
- Ctrl-C (or Cmd-C): copy selected node(s)
- Ctrl-X (or Cmd-X): cut selected node(s)  
- Ctrl-V (or Cmd-V): paste at cursor position
- Works at node level (copy/move nodes in tree)
- Investigate if Cmd-C/X/V (meta key) can be intercepted in terminal
- For text-level editing, rely on Cmd-versions if possible, or implement there too if easy
- Ctrl-C no longer quits — only 'q' quits the app