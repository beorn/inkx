/**
 * coordinator-mcp — silvercode-owned MCP server exposing cross-agent
 * coordination primitives to the agent inside each session.
 *
 * Per-session: each spawned silvercode session gets its own coordinator-mcp
 * instance, baked with that session's identity. The server delegates all
 * state to the shared `CrossAgentState` store on the controller; the only
 * per-instance thing is `selfSessionId` (so the agent's mutating calls are
 * automatically attributed without the agent having to spell its own
 * identity each time).
 *
 * Tool surface (mirrors OpenClaw's sessions_send / sessions_list pattern,
 * specialized for file claims + handoffs):
 *
 *   coordinator_claim_file        — mutating, dangerous: true
 *   coordinator_release_file      — mutating, dangerous: true
 *   coordinator_handoff           — mutating, dangerous: true
 *   coordinator_status            — read-only
 *   coordinator_active_sessions   — read-only
 *   coordinator_recent_broadcasts — read-only
 *
 * Mutating tools have `dangerous: true` so the host (silvercode via
 * acp-client) gates them through ACP `RequestPermission`. Read-only tools
 * auto-approve.
 *
 * Architecture: silvercode owns the store; agents call coordinator-mcp;
 * tribe-mcp handles cross-instance bus. See `docs/multi-agent.md`.
 */

import type { CrossAgentSessionId, CrossAgentState, SessionInfo, TribeEvent } from "./cross-agent-state.ts"

// ───── Tool definitions ───────────────────────────────────────────────────

export type ToolPropertySchema = {
  type: string
  description?: string
  enum?: readonly string[]
}

export type ToolDefinition = {
  readonly name: string
  readonly description: string
  readonly inputSchema: {
    readonly type: "object"
    readonly properties: Readonly<Record<string, ToolPropertySchema>>
    readonly required?: readonly string[]
  }
  /** Mutating tools must be gated via ACP RequestPermission. */
  readonly dangerous: boolean
}

export const COORDINATOR_TOOL_DEFINITIONS: readonly ToolDefinition[] = [
  {
    name: "coordinator_claim_file",
    description:
      "Claim a file path so other sessions know you intend to edit it. Pass `exclusive: true` (default) for a hard claim — only one session may hold an exclusive claim per path; conflicts return `{ ok: false, conflictWith }`. Mutating — gated by RequestPermission.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Filesystem path to claim. Caller must resolve relative to its cwd." },
        exclusive: {
          type: "boolean",
          description: "Default true. False for advisory claims (multiple sessions may stack advisory claims).",
        },
      },
      required: ["path"],
    },
    dangerous: true,
  },
  {
    name: "coordinator_release_file",
    description:
      "Release a file claim previously made by this session. No-op if no matching claim exists. Mutating — gated by RequestPermission.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Filesystem path to release." },
      },
      required: ["path"],
    },
    dangerous: true,
  },
  {
    name: "coordinator_handoff",
    description:
      "Propose a task handoff to another session. The target session sees the proposal in its prompt-assembly slice and decides whether to accept. Returns the handoff id. Mutating — gated by RequestPermission.",
    inputSchema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Target sessionId." },
        content: { type: "string", description: "Handoff content (instructions / context for the target)." },
      },
      required: ["to", "content"],
    },
    dangerous: true,
  },
  {
    name: "coordinator_status",
    description:
      "Read this session's current cross-agent context: claims it holds, claims by peers on paths it cares about, pending inbound/outbound handoffs. Read-only — auto-approves.",
    inputSchema: { type: "object", properties: {} },
    dangerous: false,
  },
  {
    name: "coordinator_active_sessions",
    description: "List all live sessions (sessionId, name, model, status). Read-only — auto-approves.",
    inputSchema: { type: "object", properties: {} },
    dangerous: false,
  },
  {
    name: "coordinator_recent_broadcasts",
    description:
      "Read the most recent peer broadcasts (newest last). Default limit 50; pass `limit` to bound the result. Read-only — auto-approves.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max broadcasts to return (default 50)." },
      },
    },
    dangerous: false,
  },
] as const

export const COORDINATOR_DANGEROUS_TOOLS: ReadonlySet<string> = new Set(
  COORDINATOR_TOOL_DEFINITIONS.filter((t) => t.dangerous).map((t) => t.name),
)

// ───── Tool dispatch ──────────────────────────────────────────────────────

export type CoordinatorToolName =
  | "coordinator_claim_file"
  | "coordinator_release_file"
  | "coordinator_handoff"
  | "coordinator_status"
  | "coordinator_active_sessions"
  | "coordinator_recent_broadcasts"

export type CoordinatorStatus = {
  readonly sessionId: CrossAgentSessionId
  readonly ownClaims: ReadonlyArray<{ path: string; exclusive: boolean; claimedAt: number }>
  readonly peerClaimsOnSharedPaths: ReadonlyArray<{
    path: string
    sessionId: CrossAgentSessionId
    exclusive: boolean
    claimedAt: number
  }>
  readonly pendingHandoffsIn: ReadonlyArray<{
    id: string
    fromSessionId: CrossAgentSessionId
    content: string
    proposedAt: number
  }>
  readonly pendingHandoffsOut: ReadonlyArray<{
    id: string
    toSessionId: CrossAgentSessionId
    content: string
    proposedAt: number
  }>
}

/**
 * Dispatch a coordinator tool call. `selfSessionId` is bound at server-
 * creation time (per-session), so the agent never has to spell its own
 * identity in tool arguments — coordinator_claim_file({path}) is enough.
 *
 * Returns a Promise even though the body is sync — keeps the JSON-RPC
 * server's `tools/call` handler uniform with tribe-mcp's surface and
 * leaves room for future I/O-touching tools (e.g. lore lookups).
 */
export function callCoordinatorTool(
  state: CrossAgentState,
  selfSessionId: CrossAgentSessionId,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  try {
    return Promise.resolve(callCoordinatorToolSync(state, selfSessionId, name, args))
  } catch (err) {
    return Promise.reject(err instanceof Error ? err : new Error(String(err)))
  }
}

function callCoordinatorToolSync(
  state: CrossAgentState,
  selfSessionId: CrossAgentSessionId,
  name: string,
  args: Record<string, unknown>,
): unknown {
  switch (name) {
    case "coordinator_claim_file": {
      const path = String(args.path ?? "")
      if (!path) throw new Error("coordinator_claim_file: 'path' is required")
      const exclusive = args.exclusive == null ? true : Boolean(args.exclusive)
      return state.claimFile({ sessionId: selfSessionId, path, exclusive })
    }
    case "coordinator_release_file": {
      const path = String(args.path ?? "")
      if (!path) throw new Error("coordinator_release_file: 'path' is required")
      state.releaseFile({ sessionId: selfSessionId, path })
      return { ok: true }
    }
    case "coordinator_handoff": {
      const to = String(args.to ?? "")
      if (!to) throw new Error("coordinator_handoff: 'to' is required")
      const content = String(args.content ?? "")
      const id = state.proposeHandoff({ fromSessionId: selfSessionId, toSessionId: to, content })
      return { ok: true, handoffId: id }
    }
    case "coordinator_status":
      return buildStatus(state, selfSessionId)
    case "coordinator_active_sessions":
      return state.activeSessions().slice()
    case "coordinator_recent_broadcasts": {
      const all = state.recentBroadcasts()
      const limit = typeof args.limit === "number" ? args.limit : 50
      return all.slice(Math.max(0, all.length - limit))
    }
    default:
      throw new Error(`unknown coordinator tool: ${name}`)
  }
}

function buildStatus(state: CrossAgentState, selfSessionId: CrossAgentSessionId): CoordinatorStatus {
  const claims = state.claims()
  const ownClaims = claims
    .filter((c) => c.sessionId === selfSessionId)
    .map(({ path, exclusive, claimedAt }) => ({ path, exclusive, claimedAt }))
  const ownPaths = new Set(ownClaims.map((c) => c.path))
  const peerClaimsOnSharedPaths = claims
    .filter((c) => c.sessionId !== selfSessionId && ownPaths.has(c.path))
    .map(({ path, sessionId, exclusive, claimedAt }) => ({ path, sessionId, exclusive, claimedAt }))

  const handoffs = state.handoffs()
  const pendingHandoffsIn = handoffs
    .filter((h) => h.status === "pending" && h.toSessionId === selfSessionId)
    .map(({ id, fromSessionId, content, proposedAt }) => ({ id, fromSessionId, content, proposedAt }))
  const pendingHandoffsOut = handoffs
    .filter((h) => h.status === "pending" && h.fromSessionId === selfSessionId)
    .map(({ id, toSessionId, content, proposedAt }) => ({ id, toSessionId, content, proposedAt }))

  return { sessionId: selfSessionId, ownClaims, peerClaimsOnSharedPaths, pendingHandoffsIn, pendingHandoffsOut }
}

// ───── JSON-RPC server (mirrors createTribeMcpServer shape) ───────────────

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

export type CoordinatorMcpServer = {
  /** Process one JSON-RPC request. Returns null for notifications (no `id`). */
  handle(msg: JsonRpcRequest): Promise<JsonRpcResponse | null>
  /** Tool definitions (also accessible via tools/list). */
  readonly tools: readonly ToolDefinition[]
  /** Identity of the session this server belongs to. */
  readonly selfSessionId: CrossAgentSessionId
}

/**
 * Build a per-session coordinator-mcp server. The server delegates every
 * tool call to the shared `state`, attributing mutations to `selfSessionId`.
 *
 * In-process by construction: the server is a JS object holding a reference
 * to `state`. The transport layer (stdio bin / SDK in-process / future UDS)
 * is a separate concern — this factory returns the request handler that
 * any of those transports can pump bytes through.
 */
export function createCoordinatorMcpServer(
  state: CrossAgentState,
  selfSessionId: CrossAgentSessionId,
): CoordinatorMcpServer {
  return {
    tools: COORDINATOR_TOOL_DEFINITIONS,
    selfSessionId,
    async handle(msg: JsonRpcRequest): Promise<JsonRpcResponse | null> {
      if (msg.method === "initialize") {
        return {
          jsonrpc: "2.0",
          id: msg.id ?? 0,
          result: {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: { tools: {} },
            serverInfo: { name: "coordinator-mcp", version: "0.1.0" },
          },
        }
      }
      if (msg.method === "initialized") return null
      if (msg.method === "tools/list") {
        return { jsonrpc: "2.0", id: msg.id ?? 0, result: { tools: COORDINATOR_TOOL_DEFINITIONS } }
      }
      if (msg.method === "tools/call") {
        const name = typeof msg.params?.name === "string" ? msg.params.name : ""
        const args = (msg.params?.arguments as Record<string, unknown> | undefined) ?? {}
        try {
          const out = await callCoordinatorTool(state, selfSessionId, name, args)
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

// ───── McpServerSpec helper ──────────────────────────────────────────────

/**
 * Lightweight spec-style description for the controller's `mcpServers`
 * config. Coordinator-mcp is in-process — there is no stdio bin to spawn —
 * so this spec carries `type: "in-process"` to signal that the harness
 * should mount the JS handler directly rather than fork a subprocess.
 *
 * Until silvercode grows a transport for in-process MCP (Track 2 SDK has
 * `createSdkMcpServer`; Track 1 stdio is blocked on Anthropic's transport
 * surface), the controller mounts this spec into an internal registry —
 * the agent-side wiring is a follow-up bead. See
 * `apps/silvercode/docs/in-process-mcp.md` for the transport landscape.
 */
export type CoordinatorMcpServerSpec = {
  readonly name: "coordinator"
  readonly type: "in-process"
  readonly server: CoordinatorMcpServer
}

export function createCoordinatorMcpServerSpec(
  state: CrossAgentState,
  selfSessionId: CrossAgentSessionId,
): CoordinatorMcpServerSpec {
  return {
    name: "coordinator",
    type: "in-process",
    server: createCoordinatorMcpServer(state, selfSessionId),
  }
}

// ───── Re-exports for ergonomics ──────────────────────────────────────────

export type { CrossAgentSessionId, SessionInfo, TribeEvent }
