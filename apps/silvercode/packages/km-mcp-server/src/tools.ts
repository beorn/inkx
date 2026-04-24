/**
 * km MCP tool surface (v1, read-only).
 *
 * Exposes km_search / km_get_node / km_get_board / km_render_path as typed
 * functions over @km/storage. The transport layer (transport.ts) wraps these
 * in MCP's JSON-RPC envelope. Keeping the business logic separate lets us
 * unit-test without touching stdio.
 *
 * v2 (gated behind permission inbox): km_create_node / km_move_card /
 * km_link / km_archive. Intentionally NOT included here — landing them
 * requires the approval UX to exist so edits can't bypass review.
 */

import type { KNode } from "@km/core"

export type KmContext = {
  /** Search FTS5 index — returns matching KNodes. */
  search(query: string, limit?: number): Promise<KNode[]>
  /** Load a node by id, optionally with children and/or body. */
  getNode(id: string, opts?: { includeChildren?: boolean; includeBody?: boolean }): Promise<KNode | null>
  /** Get all top-level nodes (a "board" view). */
  getBoard(): Promise<KNode[]>
  /** Render the breadcrumb trail for a node. */
  renderPath(id: string): Promise<string[]>
}

export type ToolDefinition = {
  name: string
  description: string
  inputSchema: {
    type: "object"
    properties: Record<string, { type: string; description?: string }>
    required?: string[]
  }
}

/** MCP protocol `tools/list` response shape for the km tool set. */
export const TOOL_DEFINITIONS: ToolDefinition[] = [
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
  },
  {
    name: "km_get_board",
    description: "Return the current km board (top-level nodes).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "km_render_path",
    description: "Return a breadcrumb path for a km node (root → … → node).",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
]

/** Dispatch a tools/call payload to the right KmContext method. */
export async function callTool(ctx: KmContext, name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
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
    default:
      throw new Error(`unknown km tool: ${name}`)
  }
}
