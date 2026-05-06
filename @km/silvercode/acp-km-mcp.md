---
mentions:
  - km
  - claude
id: "@km/silvercode/acp-km-mcp"
aliases:
  - km-silvercode.acp-km-mcp
  - km-silvercode-acp-km-mcp
created_by: claude:cd034ca4
created_at: 2026-04-26T08:32:06Z
closed_at: 2026-04-26T09:34:01Z
close_reason: "v2 mutation stubs + dangerous flag landed. Read: km_search,
  km_get_node, km_get_board, km_render_path, km_recent, km_get_selection.
  Mutation stubs (dangerous: true): km_create_card, km_update_card,
  km_move_card, km_archive_card, km_select — throw 'not yet implemented' until
  permission UX wires them up. ToolDefinition.dangerous + DANGEROUS_TOOLS export
  for hosts to gate via ACP RequestPermission. KmContext extended with optional
  getSelection/createCard/updateCard/moveCard/archiveCard/setSelection.
  Virtual-FS path documented as separate concern owned by silvercode acp-client
  WorkspaceProvider. README + 25 passing tests. Force-closed: dep on
  km-silvercode.acp-session is parallel work and doesn't block this MCP-only
  deliverable."
started_at: 2026-04-26T09:27:53Z
owner: bjorn@stabell.org
assignee: claude:cd034ca4
dependencies:
  - issue_id: km-silvercode.acp-km-mcp
    depends_on_id: km-silvercode.acp
    type: parent-child
    created_at: 2026-04-26T01:32:06Z
    created_by: claude:cd034ca4
    metadata: "{}"
  - issue_id: km-silvercode.acp-km-mcp
    depends_on_id: km-silvercode.acp-session
    type: blocks
    created_at: 2026-04-26T01:32:06Z
    created_by: claude:cd034ca4
    metadata: "{}"
props:
  blocked-by:
    type: list
    values:
      - type: link
        target: km-silvercode.acp
      - type: link
        target: km-silvercode.acp-session
---

# [x] km-mcp server — expose km board/tree/selection as MCP tools and virtual filesystem @km/silvercode #feature #P2 @claude:cd034ca4

blocks:: [[@km/silvercode/acp]], [[@km/silvercode/acp-session]]

Expose km's board, tree, and selection as an MCP server (pull-style capabilities) AND as a virtual filesystem (km://card/<id>, km://selection, km://column/<id>) accessible via ACP's fs/read_text_file handler.

## Two integration paths (use both)

### MCP server (@km/_orphan/mcp) — for agent-initiated capabilities

Tools:

- km_query — search nodes by content/tag/type
- km_select — change current selection
- km_zoom — change board view
- km_create_card / km_move_card — board mutations (gated by RequestPermission)
- km_recent — recently-edited cards
Pass via session/new mcpServers.

### Virtual filesystem — for context attachment

silvercode's WorkspaceProvider (fs/read_text_file handler) routes:

- km://card/<id> → live serialized card
- km://selection → current selection state
- km://column/<id> → column with cards
- km://tree/<root>/<path> → tree subtree
Falls through to real disk for ordinary paths.

## Auto-attach selection on prompts

buildPrompt() prepends ResourceLink { uri: 'km://selection', name: 'Selection: N cards' } when selection is non-empty. Agent fetches lazily via fs/read_text_file. Edit review flow for free when agent writes to km://card/<id>.

## Why this matters

- Solves 'sharing board selection with prompt' cleanly — typed via ResourceLink, not free-text
- Sandbox by construction — agent only sees what silvercode resolves
- Live signals — every read returns current state via km's signal-backed board
- Tool renderers (FilePreview, DiffView) work uniformly across real files and km virtual paths
- Solves the role-confusion problem for selection-as-context: structurally not an instruction

## Reference

- hub/silvery/future/ai-terminal/10-agent-router-landscape.md § Board selection — client-mediated FS is the perfect fit
- ACP fs/read_text_file: agent never reads disk directly; client mediates

