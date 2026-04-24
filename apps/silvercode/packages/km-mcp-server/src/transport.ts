/**
 * MCP stdio transport — JSON-RPC 2.0 over newline-delimited JSON.
 *
 * Implements the subset of the MCP spec needed for read-only tools:
 *   - initialize / initialized
 *   - tools/list
 *   - tools/call
 *
 * Everything else (prompts, resources, sampling, completion) returns
 * method-not-found. We can grow the surface as tools graduate past read-only.
 *
 * The transport is bi-directional: messages arrive line-by-line on stdin,
 * responses are written line-by-line to stdout. stderr is reserved for logs.
 */

import type { Readable, Writable } from "node:stream"
import { callTool, TOOL_DEFINITIONS, type KmContext } from "./tools.ts"

export type JsonRpcRequest = {
  jsonrpc: "2.0"
  id?: number | string
  method: string
  params?: Record<string, unknown>
}

export type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: number | string; result: unknown }
  | { jsonrpc: "2.0"; id: number | string; error: { code: number; message: string } }

const SERVER_INFO = { name: "km-mcp-server", version: "0.1.0" }
const PROTOCOL_VERSION = "2025-06-18"

export function createMcpServer(ctx: KmContext): {
  handle(message: JsonRpcRequest): Promise<JsonRpcResponse | null>
} {
  return {
    async handle(message: JsonRpcRequest): Promise<JsonRpcResponse | null> {
      if (message.method === "initialize") {
        return {
          jsonrpc: "2.0",
          id: message.id ?? 0,
          result: {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: { tools: {} },
            serverInfo: SERVER_INFO,
          },
        }
      }
      if (message.method === "initialized") {
        // Notification — no response expected.
        return null
      }
      if (message.method === "tools/list") {
        return {
          jsonrpc: "2.0",
          id: message.id ?? 0,
          result: { tools: TOOL_DEFINITIONS },
        }
      }
      if (message.method === "tools/call") {
        const name = typeof message.params?.name === "string" ? (message.params.name as string) : ""
        const args =
          (message.params?.arguments as Record<string, unknown> | undefined) ?? {}
        try {
          const output = await callTool(ctx, name, args)
          return {
            jsonrpc: "2.0",
            id: message.id ?? 0,
            result: {
              content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
              isError: false,
            },
          }
        } catch (err) {
          return {
            jsonrpc: "2.0",
            id: message.id ?? 0,
            result: {
              content: [{ type: "text", text: `error: ${(err as Error).message}` }],
              isError: true,
            },
          }
        }
      }
      if (message.id != null) {
        return {
          jsonrpc: "2.0",
          id: message.id,
          error: { code: -32601, message: `method not found: ${message.method}` },
        }
      }
      return null
    },
  }
}

/** Run the stdio transport loop until stdin closes. */
export async function runStdioServer(ctx: KmContext, input: Readable = process.stdin, output: Writable = process.stdout): Promise<void> {
  const server = createMcpServer(ctx)
  let buffer = ""
  const decoder = new TextDecoder()
  await new Promise<void>((resolve) => {
    input.on("data", async (chunk: Buffer | string) => {
      buffer += typeof chunk === "string" ? chunk : decoder.decode(chunk)
      let idx = buffer.indexOf("\n")
      while (idx !== -1) {
        const line = buffer.slice(0, idx).trim()
        buffer = buffer.slice(idx + 1)
        if (line.length > 0) {
          try {
            const msg = JSON.parse(line) as JsonRpcRequest
            const resp = await server.handle(msg)
            if (resp) output.write(JSON.stringify(resp) + "\n")
          } catch (err) {
            // Malformed JSON — emit a generic parse error if we can infer an id.
            output.write(
              JSON.stringify({
                jsonrpc: "2.0",
                id: null,
                error: { code: -32700, message: `parse error: ${(err as Error).message}` },
              }) + "\n",
            )
          }
        }
        idx = buffer.indexOf("\n")
      }
    })
    input.on("end", () => resolve())
    input.on("close", () => resolve())
  })
}
