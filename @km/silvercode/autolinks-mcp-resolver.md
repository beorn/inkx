---
id: "@km/silvercode/autolinks-mcp-resolver"
aliases:
  - km-silvercode.autolinks-mcp-resolver
  - km-silvercode-autolinks-mcp-resolver
created_by: claude:2405c72e
created_at: 2026-04-25T10:10:38Z
---

# [ ] Autolinks: MCP-tool-backed pattern resolution @km/silvercode #task #P3

blocks:: [[@km/silvercode/autolinks-config]]

Allow autolinks to be resolved via an MCP tool call instead of a static `resolves_to` value. Useful when the resolution is dynamic (e.g. a knowledge-graph lookup, a project registry). Prereq: `mcp` preview kind from @km/silvercode/autolinks-preview-extensions.

Parent: @km/silvercode/autolinks-config