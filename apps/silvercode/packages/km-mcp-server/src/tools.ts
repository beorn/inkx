/**
 * km MCP tool surface — agent-callable capabilities over @km/storage.
 *
 * This package exposes km as MCP tools so any agent harness (Claude Code,
 * silvercode, opencode, etc.) can pull-style query km — search, read nodes,
 * walk paths, and (with permission) mutate cards/selection. The transport
 * layer (transport.ts) wraps these in MCP's JSON-RPC envelope; keeping the
 * business logic separate lets us unit-test without touching stdio.
 *
 * ## Two integration paths (the package owns the FIRST one only)
 *
 * 1. **MCP tools (this package)** — agent calls `km_search`, `km_get_node`,
 *    `km_create_card`, etc. via standard MCP `tools/call`. Pulls capabilities
 *    on demand. Mutating tools carry `dangerous: true` so the host can route
 *    them through ACP's `RequestPermission` flow before invoking.
 *
 * 2. **Virtual filesystem (NOT this package)** — silvercode's
 *    `WorkspaceProvider` (the ACP `fs/read_text_file` handler) routes paths:
 *      - `km://card/<id>`        → live serialized card
 *      - `km://selection`        → current selection state
 *      - `km://column/<id>`      → column with cards
 *      - `km://tree/<root>/<p>`  → tree subtree
 *    Falls through to real disk for ordinary paths. The implementation lives
 *    in `apps/silvercode/packages/acp-client` (or similar host), NOT here.
 *    See `hub/silvercode/future/ai-terminal/10-agent-router-landscape.md` §
 *    "Board selection — client-mediated FS is the perfect fit".
 *
 * ## v1 read-only surface (always available)
 *   - km_search        — FTS5 query
 *   - km_get_node      — fetch by id (optional children/body)
 *   - km_get_board     — top-level nodes
 *   - km_render_path   — breadcrumb root → node
 *   - km_recent        — recently-edited cards (limit, since)
 *   - km_get_selection — current board selection (requires getSelection provider)
 *
 * ## v2 mutation surface (gated behind `dangerous: true`)
 *
 * Every mutating tool below is defined with `dangerous: true`. The transport
 * layer surfaces this to the host (silvercode/acp-client) which is expected
 * to call ACP `RequestPermission` before dispatching. The KmContext methods
 * for these tools are intentionally STUBS that throw "not yet implemented" —
 * activation happens in a follow-up bead once the permission UX exists.
 *
 *   - km_create_card  — create a new card (parent/column placement)
 *   - km_update_card  — edit title/body
 *   - km_move_card    — relocate to a column / position
 *   - km_archive_card — soft-archive
 *   - km_select       — change current selection (runtime UI mutation)
 */

import type { KNode } from "@km/core"

/**
 * km capability surface used by the tool dispatcher.
 *
 * Read methods are always present (search/getNode/getBoard/renderPath/recent).
 * Selection and mutations are optional — the adapter can plug them in when
 * the host (silvercode) wires up a live board + permission gateway.
 */
export type KmContext = {
  // ───── Read-only (v1) ─────
  /** Search FTS5 index — returns matching KNodes. */
  search(query: string, limit?: number): Promise<KNode[]>
  /** Load a node by id, optionally with children and/or body. */
  getNode(id: string, opts?: { includeChildren?: boolean; includeBody?: boolean }): Promise<KNode | null>
  /** Get all top-level nodes (a "board" view). */
  getBoard(): Promise<KNode[]>
  /** Render the breadcrumb trail for a node. */
  renderPath(id: string): Promise<string[]>
  /** Recently-edited cards (sorted updated_at desc). Optional `since` (unix ms) and `limit`. */
  recent(opts?: { limit?: number; since?: number }): Promise<KNode[]>

  // ───── Selection provider (optional, v1) ─────
  /**
   * Return the current board selection. Selection is a runtime concern owned
   * by the host (silvercode); this package just calls through. When no
   * provider is wired in (e.g. headless harness), `km_get_selection` returns
   * an empty array.
   */
  getSelection?: () => Promise<{ ids: string[] }>

  // ───── Mutations (v2, dangerous, stubs) ─────
  /** Create a new card. Mutating — gated by ACP RequestPermission. */
  createCard?: (args: { title: string; body?: string; parentId?: string; columnId?: string }) => Promise<KNode>
  /** Update an existing card's title/body. Mutating — gated. */
  updateCard?: (args: { id: string; title?: string; body?: string }) => Promise<KNode>
  /** Move a card to a column / position. Mutating — gated. */
  moveCard?: (args: { id: string; toColumnId: string; position?: number }) => Promise<KNode>
  /** Soft-archive a card. Mutating — gated. */
  archiveCard?: (args: { id: string }) => Promise<{ id: string; archived: true }>
  /** Replace current selection. Mutating (UI state) — gated. */
  setSelection?: (args: { ids: string[] }) => Promise<{ ids: string[] }>
}

/**
 * MCP tool definition shape.
 *
 * `dangerous: true` marks tools that mutate state (or change the user's view
 * of state) and therefore require permission via ACP RequestPermission. The
 * host inspects this flag from `tools/list` and routes accordingly. Read-only
 * tools omit the flag (or set `false`).
 *
 * NOTE: `tribe-mcp` ships a sibling `ToolDefinition` with the same `dangerous`
 * field — the two types are kept independent (different packages) but the
 * convention is shared. See bead km-silvercode.acp-tribe-mcp.
 */
export type ToolDefinition = {
  name: string
  description: string
  inputSchema: {
    type: "object"
    properties: Record<string, { type: string; description?: string }>
    required?: string[]
  }
  /** When true, host MUST route via ACP RequestPermission before dispatching. */
  dangerous?: boolean
}

const DANGEROUS_NOT_IMPLEMENTED =
  "not yet implemented — see km-silvercode.acp-km-mcp for activation (mutation surface gated on permission UX)"

/** MCP protocol `tools/list` response shape for the km tool set. */
export const TOOL_DEFINITIONS: ToolDefinition[] = [
  // ───── Read-only ─────
  {
    name: "km_search",
    description: "Full-text search over km nodes. Returns an array of matching nodes.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "FTS5 query (supports quoted phrases)" },
        limit: { type: "number", description: "Max number of results (default 20)" },
      },
      required: ["query"],
    },
    dangerous: false,
  },
  {
    name: "km_get_node",
    description: "Fetch a single km node by id with optional children and body.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        includeChildren: { type: "boolean" },
        includeBody: { type: "boolean" },
      },
      required: ["id"],
    },
    dangerous: false,
  },
  {
    name: "km_get_board",
    description: "Return the current km board (top-level nodes).",
    inputSchema: { type: "object", properties: {} },
    dangerous: false,
  },
  {
    name: "km_render_path",
    description: "Return a breadcrumb path for a km node (root → … → node).",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    dangerous: false,
  },
  {
    name: "km_recent",
    description:
      "Return recently-edited km cards, sorted by updated_at descending. " +
      "Optional `limit` (default 20) and `since` (unix ms — only return nodes updated after this).",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max number of results (default 20)" },
        since: { type: "number", description: "Unix ms — only return nodes updated_at > since" },
      },
    },
    dangerous: false,
  },
  {
    name: "km_get_selection",
    description:
      "Return the current board selection as an array of node ids. " +
      "Returns an empty array when no selection provider is wired in (headless harness).",
    inputSchema: { type: "object", properties: {} },
    dangerous: false,
  },

  // ───── Mutations (dangerous — gated via ACP RequestPermission) ─────
  {
    name: "km_create_card",
    description:
      "Create a new card under a parent or in a column. Mutating — requires permission via ACP RequestPermission flow.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Card title" },
        body: { type: "string", description: "Optional card body (markdown)" },
        parentId: { type: "string", description: "Optional parent node id" },
        columnId: { type: "string", description: "Optional target column id" },
      },
      required: ["title"],
    },
    dangerous: true,
  },
  {
    name: "km_update_card",
    description:
      "Update an existing card's title and/or body. Mutating — requires permission via ACP RequestPermission flow.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        body: { type: "string" },
      },
      required: ["id"],
    },
    dangerous: true,
  },
  {
    name: "km_move_card",
    description:
      "Move a card to a column at an optional position. Mutating — requires permission via ACP RequestPermission flow.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        toColumnId: { type: "string" },
        position: { type: "number", description: "0-based index inside the target column" },
      },
      required: ["id", "toColumnId"],
    },
    dangerous: true,
  },
  {
    name: "km_archive_card",
    description: "Soft-archive a card. Mutating — requires permission via ACP RequestPermission flow.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    dangerous: true,
  },
  {
    name: "km_select",
    description:
      "Replace the current board selection with the given node ids. " +
      "Mutating (changes UI state) — requires permission via ACP RequestPermission flow.",
    inputSchema: {
      type: "object",
      properties: {
        ids: { type: "array", description: "Node ids to select" },
      },
      required: ["ids"],
    },
    dangerous: true,
  },
]

/** Lookup map for hosts that need to check `dangerous` per tool name. */
export const DANGEROUS_TOOLS: ReadonlySet<string> = new Set(
  TOOL_DEFINITIONS.filter((t) => t.dangerous === true).map((t) => t.name),
)

/** Dispatch a tools/call payload to the right KmContext method. */
export async function callTool(ctx: KmContext, name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    // ───── Read-only ─────
    case "km_search":
      return ctx.search(String(args.query ?? ""), typeof args.limit === "number" ? args.limit : 20)
    case "km_get_node":
      return ctx.getNode(String(args.id ?? ""), {
        includeChildren: Boolean(args.includeChildren),
        includeBody: Boolean(args.includeBody),
      })
    case "km_get_board":
      return ctx.getBoard()
    case "km_render_path":
      return ctx.renderPath(String(args.id ?? ""))
    case "km_recent":
      return ctx.recent({
        limit: typeof args.limit === "number" ? args.limit : 20,
        since: typeof args.since === "number" ? args.since : undefined,
      })
    case "km_get_selection":
      if (!ctx.getSelection) return { ids: [] }
      return ctx.getSelection()

    // ───── Mutations (stubs unless adapter implements them) ─────
    case "km_create_card":
      if (!ctx.createCard) throw new Error(DANGEROUS_NOT_IMPLEMENTED)
      return ctx.createCard({
        title: String(args.title ?? ""),
        body: typeof args.body === "string" ? args.body : undefined,
        parentId: typeof args.parentId === "string" ? args.parentId : undefined,
        columnId: typeof args.columnId === "string" ? args.columnId : undefined,
      })
    case "km_update_card":
      if (!ctx.updateCard) throw new Error(DANGEROUS_NOT_IMPLEMENTED)
      return ctx.updateCard({
        id: String(args.id ?? ""),
        title: typeof args.title === "string" ? args.title : undefined,
        body: typeof args.body === "string" ? args.body : undefined,
      })
    case "km_move_card":
      if (!ctx.moveCard) throw new Error(DANGEROUS_NOT_IMPLEMENTED)
      return ctx.moveCard({
        id: String(args.id ?? ""),
        toColumnId: String(args.toColumnId ?? ""),
        position: typeof args.position === "number" ? args.position : undefined,
      })
    case "km_archive_card":
      if (!ctx.archiveCard) throw new Error(DANGEROUS_NOT_IMPLEMENTED)
      return ctx.archiveCard({ id: String(args.id ?? "") })
    case "km_select":
      if (!ctx.setSelection) throw new Error(DANGEROUS_NOT_IMPLEMENTED)
      return ctx.setSelection({ ids: Array.isArray(args.ids) ? (args.ids as unknown[]).map(String) : [] })

    default:
      throw new Error(`unknown km tool: ${name}`)
  }
}
