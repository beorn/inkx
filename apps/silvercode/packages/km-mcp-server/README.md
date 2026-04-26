# @km/mcp-server

Stdio MCP server that exposes km as agent-callable capabilities — search, read,
and (with permission) mutate cards. Used by silvercode and any other ACP host
that wants to mount km as a pull-style memory / capability surface.

## What it is

A minimal MCP (`tools/list` + `tools/call`) server speaking JSON-RPC over
stdio. Backed by `@km/storage` queries against a km vault's `state.db`. No
prompts/resources/sampling — just tools. The host registers it via
`session/new` `mcpServers` and the agent can then call its tools as it works.

## Two integration paths (use both)

This package owns **path 1**. Path 2 lives in the silvercode host
(`acp-client`).

| Path                             | Owner                 | What                                                                    | Trigger                               |
| -------------------------------- | --------------------- | ----------------------------------------------------------------------- | ------------------------------------- |
| **MCP tools** (this package)     | `@km/mcp-server`      | Agent calls `km_search`, `km_get_node`, `km_create_card`, …             | Agent decides — pull-style capability |
| **Virtual filesystem** (`km://`) | silvercode acp-client | `km://card/<id>`, `km://selection`, `km://column/<id>`, `km://tree/...` | Agent calls ACP `fs/read_text_file`   |

Path 2 is implemented in silvercode's `WorkspaceProvider` — see
[`hub/silvery/future/ai-terminal/10-agent-router-landscape.md`](../../../../hub/silvery/future/ai-terminal/10-agent-router-landscape.md)
§ "Board selection — client-mediated FS is the perfect fit". The two are
complementary: tools for capabilities the agent wants to invoke, virtual files
for data the agent wants to _read_.

## Tool surface

### Read-only (v1, always available)

| Tool               | Description                                                              |
| ------------------ | ------------------------------------------------------------------------ |
| `km_search`        | FTS5 full-text search over km nodes                                      |
| `km_get_node`      | Fetch a single node by id (optional children/body)                       |
| `km_get_board`     | Top-level nodes (a "board" view)                                         |
| `km_render_path`   | Breadcrumb path (root → … → node)                                        |
| `km_recent`        | Recently-edited nodes (`limit`, optional `since` unix-ms)                |
| `km_get_selection` | Current board selection ids; empty when no `getSelection` provider wired |

### Mutations (v2, gated, `dangerous: true`)

These tool definitions ship with `dangerous: true` so the host knows to route
them through ACP's `RequestPermission` flow before invocation. The
KmContext methods are STUBS — until silvercode's permission UX is wired up,
calls fail with `not yet implemented`.

| Tool              | Description                                     |
| ----------------- | ----------------------------------------------- |
| `km_create_card`  | Create a new card (parent / column / position)  |
| `km_update_card`  | Edit title and/or body                          |
| `km_move_card`    | Move a card to a column at an optional position |
| `km_archive_card` | Soft-archive a card                             |
| `km_select`       | Replace current selection (UI state mutation)   |

## The `dangerous` flag → ACP RequestPermission convention

`ToolDefinition` carries an optional `dangerous: boolean`. Hosts inspect it
on `tools/list`:

```ts
import { TOOL_DEFINITIONS, DANGEROUS_TOOLS } from "@km/mcp-server"

if (DANGEROUS_TOOLS.has(toolName)) {
  await acp.requestPermission({ toolName, args })
}
await acp.callTool(toolName, args)
```

The flag is the convention shared with `tribe-mcp` (different package, same
field). Read-only tools omit the flag (or set `false`); mutating tools — and
selection mutation, which changes UI state — are flagged.

## How silvercode mounts it

```ts
await agent.newSession({
  cwd,
  mcpServers: [
    {
      type: "stdio",
      command: "km-mcp-server",
      args: [],
      env: [{ name: "KM_DB_PATH", value: `${cwd}/.km/state.db` }],
    },
    // … tribe-mcp, lore-mcp, recall-mcp, gbrain-mcp …
  ],
})
```

DB path resolves from `$KM_DB_PATH` first, then `<cwd>/.km/state.db`. The
controller is expected to probe before mounting — when no db exists,
silvercode should _omit_ km from `mcpServers` entirely rather than letting
the bin throw at startup.

## Wiring optional hooks (selection + mutations)

`createKmContextFromStorage(db, queries, extensions?)` accepts optional
`extensions` for the host to plug in selection + mutation handlers once the
permission UX is ready:

```ts
const ctx = createKmContextFromStorage(
  db,
  { search, getNode, getTopLevelNodes, renderPath, recent },
  {
    getSelection: async () => ({ ids: board.selection.peek() }),
    createCard: async ({ title, body, parentId, columnId }) => {
      // … board ops gated by RequestPermission upstream …
    },
    // updateCard, moveCard, archiveCard, setSelection …
  },
)
```

When extensions are omitted (default — what `bin.ts` does), `km_get_selection`
returns `{ ids: [] }` and mutation tools throw `not yet implemented`.

## Layout

```
src/
  tools.ts      — KmContext type, ToolDefinition, TOOL_DEFINITIONS, callTool, DANGEROUS_TOOLS
  transport.ts  — JSON-RPC envelope, createMcpServer, runStdioServer
  adapter.ts    — createKmContextFromStorage (DB → KmContext)
  bin.ts        — stdio binary; resolves KM_DB_PATH, opens db read-only
  index.ts      — public re-exports
tests/
  dispatch.test.ts — transport / dispatch / dangerous-flag / selection / recent
  adapter.test.ts  — in-memory SQLite fixture exercising real @km/storage
```

## Running tests

```bash
bun vitest run apps/silvercode/packages/km-mcp-server/tests/
```

## Related beads

- `km-silvercode.acp-km-mcp` — this package
- `km-silvercode.acp-tribe-mcp` — sibling MCP for tribe coordination (shares the `dangerous` convention)
- `km-silvercode.acp` — parent ACP-adoption tracking bead
