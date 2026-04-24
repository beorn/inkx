/**
 * @km/tribe-mcp — cross-session messaging as MCP tools.
 *
 * Each silvercode session mounts this server so the agent inside can send
 * messages to peer sessions and read history. Channel events are surfaced
 * back into the agent's next user prompt via the harness injector pipeline
 * (see agent-harness/injectors.ts → channelDigestInjector).
 *
 * The transport mirrors the km-mcp-server shape (JSON-RPC over stdio); only
 * the tool surface differs. Sample implementation — users can swap their own.
 */

import type { Readable, Writable } from "node:stream"

export type TribeBackend = {
  /** Send a message from `from` to `to` (session id, or "*" for broadcast). */
  send(opts: { from: string; to: string; text: string }): Promise<void>
  /** Fetch the last N messages visible to `forSession`. */
  history(opts: { forSession: string; limit?: number }): Promise<TribeMessage[]>
  /** List known peers. */
  members(): Promise<TribeMember[]>
}

export type TribeMessage = {
  from: string
  to: string
  text: string
  ts: number
}

export type TribeMember = {
  name: string
  status: "online" | "offline" | "idle"
  lastActive?: number
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

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "tribe_send",
    description: "Send a message to another session (or '*' for broadcast).",
    inputSchema: {
      type: "object",
      properties: {
        to: { type: "string", description: "target session name or '*'" },
        message: { type: "string" },
      },
      required: ["to", "message"],
    },
  },
  {
    name: "tribe_history",
    description: "Read the last N messages for this session.",
    inputSchema: {
      type: "object",
      properties: { limit: { type: "number" } },
    },
  },
  {
    name: "tribe_members",
    description: "List peer sessions known to the tribe.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "tribe_broadcast",
    description: "Shortcut for tribe_send with to='*'.",
    inputSchema: {
      type: "object",
      properties: { message: { type: "string" } },
      required: ["message"],
    },
  },
]

export async function callTool(
  backend: TribeBackend,
  selfSessionName: string,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case "tribe_send":
      await backend.send({
        from: selfSessionName,
        to: String(args.to ?? "*"),
        text: String(args.message ?? ""),
      })
      return { ok: true }
    case "tribe_broadcast":
      await backend.send({
        from: selfSessionName,
        to: "*",
        text: String(args.message ?? ""),
      })
      return { ok: true }
    case "tribe_history":
      return backend.history({
        forSession: selfSessionName,
        limit: typeof args.limit === "number" ? (args.limit as number) : 50,
      })
    case "tribe_members":
      return backend.members()
    default:
      throw new Error(`unknown tribe tool: ${name}`)
  }
}

export type JsonRpcRequest = {
  jsonrpc: "2.0"
  id?: number | string
  method: string
  params?: Record<string, unknown>
}

export type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: number | string; result: unknown }
  | { jsonrpc: "2.0"; id: number | string; error: { code: number; message: string } }

const PROTOCOL_VERSION = "2025-06-18"

export function createTribeMcpServer(backend: TribeBackend, selfSessionName: string): {
  handle(msg: JsonRpcRequest): Promise<JsonRpcResponse | null>
} {
  return {
    async handle(msg: JsonRpcRequest): Promise<JsonRpcResponse | null> {
      if (msg.method === "initialize") {
        return {
          jsonrpc: "2.0",
          id: msg.id ?? 0,
          result: {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: { tools: {} },
            serverInfo: { name: "tribe-mcp", version: "0.1.0" },
          },
        }
      }
      if (msg.method === "initialized") return null
      if (msg.method === "tools/list") {
        return { jsonrpc: "2.0", id: msg.id ?? 0, result: { tools: TOOL_DEFINITIONS } }
      }
      if (msg.method === "tools/call") {
        const name = typeof msg.params?.name === "string" ? (msg.params.name as string) : ""
        const args = (msg.params?.arguments as Record<string, unknown> | undefined) ?? {}
        try {
          const out = await callTool(backend, selfSessionName, name, args)
          return {
            jsonrpc: "2.0",
            id: msg.id ?? 0,
            result: {
              content: [{ type: "text", text: JSON.stringify(out, null, 2) }],
              isError: false,
            },
          }
        } catch (err) {
          return {
            jsonrpc: "2.0",
            id: msg.id ?? 0,
            result: {
              content: [{ type: "text", text: `error: ${(err as Error).message}` }],
              isError: true,
            },
          }
        }
      }
      if (msg.id != null) {
        return {
          jsonrpc: "2.0",
          id: msg.id,
          error: { code: -32601, message: `method not found: ${msg.method}` },
        }
      }
      return null
    },
  }
}

/** In-memory backend for tests and single-process silvercode setups. */
export function createInMemoryTribe(): TribeBackend & {
  /** Drain messages for a session since last call (for channel injector). */
  drain(sessionName: string): TribeMessage[]
} {
  const history: TribeMessage[] = []
  const unseenBySession = new Map<string, TribeMessage[]>()
  const members = new Map<string, TribeMember>()

  return {
    async send(opts) {
      const msg: TribeMessage = { ...opts, ts: Date.now() }
      history.push(msg)
      if (!members.has(opts.from)) {
        members.set(opts.from, { name: opts.from, status: "online", lastActive: Date.now() })
      }
      // Addressed recipients implicitly register as peers so broadcasts and
      // direct messages can find them on subsequent sends.
      if (opts.to !== "*" && !members.has(opts.to)) {
        members.set(opts.to, { name: opts.to, status: "online", lastActive: Date.now() })
      }
      if (opts.to === "*") {
        for (const name of members.keys()) {
          if (name === opts.from) continue
          const list = unseenBySession.get(name) ?? []
          list.push(msg)
          unseenBySession.set(name, list)
        }
      } else {
        const list = unseenBySession.get(opts.to) ?? []
        list.push(msg)
        unseenBySession.set(opts.to, list)
      }
    },
    async history(opts) {
      const limit = opts.limit ?? 50
      return history.slice(-limit)
    },
    async members() {
      return Array.from(members.values())
    },
    drain(sessionName) {
      const pending = unseenBySession.get(sessionName) ?? []
      unseenBySession.delete(sessionName)
      return pending
    },
  }
}
