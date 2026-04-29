---
id: "@km/termless/switch-mcp"
aliases:
  - km-termless.switch-mcp
  - km-termless-switch-mcp
created_by: claude:8fc35754
created_at: 2026-03-03T00:34:49Z
closed_at: 2026-03-03T06:57:41Z
---

# [x] Switch km to termless MCP server @km/termless #task #P1 @claude:8fc35754

Replace the playwright-tty MCP server with the new termless MCP server in km's .mcp.json. Both are currently listed — dogfood the termless one in real workflow, and if it works well, remove the old playwright-tty entry. This kills the Chromium dependency for terminal screenshots.