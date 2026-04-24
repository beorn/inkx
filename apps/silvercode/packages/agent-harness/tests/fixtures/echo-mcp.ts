#!/usr/bin/env bun
/**
 * Minimal stdio MCP fixture used by mcp-live.test.ts.
 *
 * Advertises a single tool — `echo_mcp` — that returns whatever arguments it
 * was called with. The live test asserts that `claude --mcp-config` actually
 * loads this server and that a spawned session can reach the tool. Keep the
 * surface tiny: if this grows beyond a minimal JSON-RPC responder, move to a
 * real package.
 *
 * Protocol subset implemented:
 *   - initialize   (returns protocolVersion + serverInfo)
 *   - initialized  (notification, no reply)
 *   - tools/list   (returns the echo_mcp definition)
 *   - tools/call   (echoes its arguments)
 *   - ping         (returns {} for liveness)
 *
 * Everything else → method-not-found (-32601).
 */

import type { Readable, Writable } from "node:stream"

type JsonRpcRequest = {
  jsonrpc: "2.0"
  id?: number | string
  method: string
  params?: Record<string, unknown>
}

type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: number | string; result: unknown }
  | { jsonrpc: "2.0"; id: number | string; error: { code: number; message: string } }

const PROTOCOL_VERSION = "2025-06-18"
const SERVER_INFO = { name: "echo-mcp-fixture", version: "0.0.1" }

const TOOLS = [
  {
    name: "echo_mcp",
    description: "Echoes the arguments back so integration tests can verify the MCP call path.",
    inputSchema: {
      type: "object",
      properties: {
        foo: { type: "string", description: "Arbitrary payload to echo." },
      },
      additionalProperties: true,
    },
  },
]

function handle(message: JsonRpcRequest): JsonRpcResponse | null {
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
  if (message.method === "notifications/initialized" || message.method === "initialized") {
    return null
  }
  if (message.method === "ping") {
    return { jsonrpc: "2.0", id: message.id ?? 0, result: {} }
  }
  if (message.method === "tools/list") {
    return {
      jsonrpc: "2.0",
      id: message.id ?? 0,
      result: { tools: TOOLS },
    }
  }
  if (message.method === "tools/call") {
    const name = typeof message.params?.name === "string" ? (message.params.name as string) : ""
    const args = (message.params?.arguments as Record<string, unknown> | undefined) ?? {}
    if (name !== "echo_mcp") {
      return {
        jsonrpc: "2.0",
        id: message.id ?? 0,
        result: {
          content: [{ type: "text", text: `unknown tool: ${name}` }],
          isError: true,
        },
      }
    }
    return {
      jsonrpc: "2.0",
      id: message.id ?? 0,
      result: {
        content: [{ type: "text", text: JSON.stringify({ echoed: args }) }],
        isError: false,
      },
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
}

async function run(input: Readable, output: Writable): Promise<void> {
  let buffer = ""
  const decoder = new TextDecoder()
  await new Promise<void>((resolve) => {
    input.on("data", (chunk: Buffer | string) => {
      buffer += typeof chunk === "string" ? chunk : decoder.decode(chunk)
      let idx = buffer.indexOf("\n")
      while (idx !== -1) {
        const line = buffer.slice(0, idx).trim()
        buffer = buffer.slice(idx + 1)
        if (line.length > 0) {
          try {
            const msg = JSON.parse(line) as JsonRpcRequest
            const resp = handle(msg)
            if (resp) output.write(JSON.stringify(resp) + "\n")
          } catch (err) {
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

await run(process.stdin, process.stdout)
