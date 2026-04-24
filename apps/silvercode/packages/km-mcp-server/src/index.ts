/**
 * @km/mcp-server — stdio MCP exposing km as persistent memory to Claude Code
 * (and any other agent harness) sessions.
 *
 * v1: read-only (search, get_node, get_board, render_path).
 * v2 (gated): mutation tools behind the permission inbox.
 */

export { TOOL_DEFINITIONS, callTool } from "./tools.ts"
export type { KmContext, ToolDefinition } from "./tools.ts"
export { createMcpServer, runStdioServer } from "./transport.ts"
export type { JsonRpcRequest, JsonRpcResponse } from "./transport.ts"
export { createKmContextFromStorage } from "./adapter.ts"
