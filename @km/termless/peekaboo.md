---
id: "@km/termless/peekaboo"
aliases:
  - km-termless.peekaboo
  - km-termless-peekaboo
created_by: claude:8fc35754
created_at: 2026-03-03T11:10:15Z
closed_at: 2026-03-03T11:29:45Z
owner: bjorn@stabell.org
---

# [x] MCP/peekaboo backend: OS-level terminal control (very slow) @km/termless #feature #P3

Backend that uses MCP peekaboo tools to control a real terminal app (Ghostty, iTerm, etc.) at the OS level. Launches the app, sends keystrokes via OS events, takes screenshots for text extraction. VERY slow but tests real terminal rendering. Pure TypeScript, no native code needed.