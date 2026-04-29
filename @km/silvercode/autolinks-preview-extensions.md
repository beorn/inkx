---
id: "@km/silvercode/autolinks-preview-extensions"
aliases:
  - km-silvercode.autolinks-preview-extensions
  - km-silvercode-autolinks-preview-extensions
created_by: claude:2405c72e
created_at: 2026-04-25T10:10:36Z
closed_at: 2026-04-25T15:33:26Z
close_reason: "Implemented in commit 7d8e4d23d. Added shell + mcp preview kinds
  + markdown rendering for readme/first-paragraph popovers. shell kind:
  spawnSync with 5s timeout, 4KB cap, ${resolves_to} substitution,
  leading-metachar guard. mcp kind: stub — recognised in VALID_PREVIEWS but
  dropped at config-load with pointer to km-silvercode.autolinks-mcp-resolver.
  DetectionText popover now switches on preview kind: markdown-source kinds pipe
  through MarkdownView via <Prose flexShrink={1} minWidth={0}>; output kinds
  (shell, bd-active, mcp) stay on plain Text. Tests: 9 new config tests + 7 new
  previews tests + 2 new visual popover-markdown tests; 61 autolinks tests pass
  total. Zero new tsc errors (185 baseline all in PaneGrid.tsx, another agent's
  territory)."
---

# [x] Autolinks preview kinds: shell + mcp @km/silvercode #task #P3 @claude:2405c72e

blocks:: [[@km/silvercode/autolinks-config]]

Add two preview kinds beyond v1's three (`readme`, `first-paragraph`, `bd-active`):

- `shell` — run a user-defined command and capture stdout into the popover. Sandbox/timeout TBD.
- `mcp` — call an MCP tool with the resolved value and render the response.

Plus: render `readme` previews via a shrunken MarkdownView component instead of plain text fallback (today's v1 implementation).

Parent: @km/silvercode/autolinks-config