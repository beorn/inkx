/**
 * @km/mcp-server — stdio MCP exposing km as persistent memory to Claude Code
 * (and any other agent harness) sessions.
 *
 * v1 read-only: search, get_node, get_board, render_path, recent, get_selection.
 * v2 mutations (gated, dangerous: true): create_card, update_card, move_card,
 *   archive_card, select. Stubs unless the host adapter implements them.
 *
 * The virtual filesystem (`km://card/<id>`, `km://selection`, `km://column/<id>`)
 * is a SEPARATE integration handled by silvercode's WorkspaceProvider via
 * ACP `fs/read_text_file` — NOT in this package. See tools.ts header.
 */

export { TOOL_DEFINITIONS, callTool, DANGEROUS_TOOLS } from "./tools.ts"
export type { KmContext, ToolDefinition } from "./tools.ts"
export { createMcpServer, runStdioServer } from "./transport.ts"
export type { JsonRpcRequest, JsonRpcResponse } from "./transport.ts"
export { createKmContextFromStorage } from "./adapter.ts"
export type { KmContextExtensions } from "./adapter.ts"
