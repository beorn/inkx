/**
 * @km/tribe-mcp — cross-session messaging as MCP tools.
 *
 * Each silvercode session mounts this server so the agent inside can send
 * messages to peer sessions, claim leadership, and read history. Channel
 * events are surfaced back into the agent's next user prompt via the harness
 * injector pipeline (see agent-harness/injectors.ts → channelDigestInjector).
 *
 * The transport mirrors the km-mcp-server shape (JSON-RPC over stdio); only
 * the tool surface differs. The pattern follows OpenClaw's
 * `sessions_send` / `sessions_list` / `sessions_history` — agent-callable
 * cross-session messaging with mutating tools gated by ACP RequestPermission.
 *
 * The `dangerous` flag on each tool definition signals to the host (silvercode
 * via acp-client) that the tool MUST trigger ACP `RequestPermission` before
 * the call is dispatched. Read-only tools auto-approve.
 *
 * Scope policy mirrors OpenClaw's per-tool scoping. Each call carries an
 * optional `scope` argument constraining which peers the call may reach:
 *
 *   - "self"  — only the calling session (echo / introspection)
 *   - "tree"  — calling session + descendants spawned from it (default)
 *   - "agent" — any session belonging to the same agent id (e.g. all Claude)
 *   - "all"   — any tribe peer
 *
 * Backends decide how to enforce; the JSONL backend in bin.ts uses the
 * recorded `agentId` / `parent` fields per message + a known-peers index to
 * filter sends and history. A `TRIBE_SCOPE` env var sets the default for
 * cases where the agent doesn't pass `scope` explicitly.
 *
 * The tribe daemon (bearly tribe via UDS) is a separate backend that can
 * replace the JSONL bus by setting `TRIBE_BACKEND=daemon`. Not implemented
 * yet — the hook exists in bin.ts.
 */

export type TribeScope = "self" | "tree" | "agent" | "all"

export const TRIBE_SCOPES: readonly TribeScope[] = ["self", "tree", "agent", "all"] as const

export type TribeBackend = {
  /** Send a message from `from` to `to` (session id, or "*" for broadcast). */
  send(opts: { from: string; to: string; text: string; scope?: TribeScope }): Promise<void>
  /** Fetch the last N messages visible to `forSession`. */
  history(opts: {
    forSession: string
    limit?: number
    scope?: TribeScope
    filter?: HistoryFilter
  }): Promise<TribeMessage[]>
  /** List known peers visible at the given scope. */
  members(opts: { forSession: string; scope?: TribeScope }): Promise<TribeMember[]>
  /** Register the calling session as joined (idempotent). */
  join(opts: { name: string; agentId?: string; parent?: string }): Promise<void>
  /** Claim the chief role. Returns whether the claim succeeded. */
  claimChief(opts: { name: string }): Promise<{ ok: boolean; chief: string | null }>
  /** Release the chief role if currently held by `name`. */
  releaseChief(opts: { name: string }): Promise<{ ok: boolean; chief: string | null }>
  /** Identity of the current chief (or null). */
  chief(): Promise<string | null>
}

export type HistoryFilter = {
  /** Only messages from this peer. */
  from?: string
  /** Only messages addressed to this peer (or "*"). */
  to?: string
  /** Only messages whose text contains this substring. */
  contains?: string
  /** Only messages newer than this timestamp (ms since epoch). */
  since?: number
}

export type TribeMessage = {
  from: string
  to: string
  text: string
  ts: number
  /** Agent-id label of sender (e.g. "claude", "codex"). Optional. */
  agentId?: string
  /** Parent session of sender, used by "tree" scope filtering. */
  parent?: string
}

export type TribeMember = {
  name: string
  status: "online" | "offline" | "idle"
  lastActive?: number
  agentId?: string
  parent?: string
  isChief?: boolean
}

export type ToolDefinition = {
  name: string
  description: string
  inputSchema: {
    type: "object"
    properties: Record<string, ToolPropertySchema>
    required?: string[]
  }
  /**
   * Mutating / side-effectful tools set this to true. The host MUST gate
   * such tools through ACP `RequestPermission`. Read-only tools are safe to
   * auto-approve.
   */
  dangerous: boolean
}

export type ToolPropertySchema = {
  type: string
  description?: string
  enum?: readonly string[]
}

const SCOPE_PROP: ToolPropertySchema = {
  type: "string",
  enum: TRIBE_SCOPES,
  description:
    "Reach constraint: 'self' (this session), 'tree' (this session + descendants, default), 'agent' (same agent id), 'all' (any peer).",
}

export const TOOL_DEFINITIONS: readonly ToolDefinition[] = [
  {
    name: "tribe_send",
    description:
      "Send a direct message to another tribe peer. The target must be a known session name (use tribe_members to discover). Mutating — gated by RequestPermission.",
    inputSchema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Target session name." },
        message: { type: "string", description: "Message text." },
        scope: SCOPE_PROP,
      },
      required: ["to", "message"],
    },
    dangerous: true,
  },
  {
    name: "tribe_broadcast",
    description:
      "Broadcast a message to all tribe peers visible at the chosen scope. Mutating — gated by RequestPermission.",
    inputSchema: {
      type: "object",
      properties: {
        message: { type: "string", description: "Message text." },
        scope: SCOPE_PROP,
      },
      required: ["message"],
    },
    dangerous: true,
  },
  {
    name: "tribe_members",
    description: "List tribe peers visible at the chosen scope, with status and chief flag. Read-only — auto-approves.",
    inputSchema: {
      type: "object",
      properties: { scope: SCOPE_PROP },
    },
    dangerous: false,
  },
  {
    name: "tribe_history",
    description:
      "Read recent tribe messages visible to this session at the chosen scope, optionally filtered by from/to/contains/since. Read-only — auto-approves.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max messages to return (default 50)." },
        scope: SCOPE_PROP,
        from: { type: "string", description: "Filter: only messages from this peer." },
        to: { type: "string", description: "Filter: only messages addressed here (or '*')." },
        contains: { type: "string", description: "Filter: substring match on text." },
        since: { type: "number", description: "Filter: only messages newer than this ms timestamp." },
      },
    },
    dangerous: false,
  },
  {
    name: "tribe_join",
    description:
      "Register the current session as a tribe peer (idempotent). Other peers can then discover it via tribe_members. Mutating — gated by RequestPermission.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Session name to join as. Defaults to the configured TRIBE_SESSION_NAME.",
        },
      },
    },
    dangerous: true,
  },
  {
    name: "tribe_claim_chief",
    description:
      "Attempt to become the tribe chief. Used for leader-election workflows (e.g. coordinating which session runs CI). Returns ok=true if the claim succeeded. Mutating — gated by RequestPermission.",
    inputSchema: {
      type: "object",
      properties: {},
    },
    dangerous: true,
  },
  {
    name: "tribe_release_chief",
    description: "Release the chief role if currently held by this session. Mutating — gated by RequestPermission.",
    inputSchema: {
      type: "object",
      properties: {},
    },
    dangerous: true,
  },
] as const

export const DANGEROUS_TOOLS: ReadonlySet<string> = new Set(
  TOOL_DEFINITIONS.filter((t) => t.dangerous).map((t) => t.name),
)

/**
 * Tools whose `arguments` carry a meaningful `scope` field. Used by the host
 * to inject the default scope (TRIBE_SCOPE) when the agent didn't supply one.
 */
export const SCOPED_TOOLS: ReadonlySet<string> = new Set([
  "tribe_send",
  "tribe_broadcast",
  "tribe_members",
  "tribe_history",
])

export type CallToolOpts = {
  /** Default scope if the call doesn't carry one. */
  defaultScope?: TribeScope
  /** Self-session metadata used by `tribe_join` defaults. */
  selfAgentId?: string
  selfParent?: string
}

export async function callTool(
  backend: TribeBackend,
  selfSessionName: string,
  name: string,
  args: Record<string, unknown>,
  opts: CallToolOpts = {},
): Promise<unknown> {
  const scope = pickScope(args.scope, opts.defaultScope)
  switch (name) {
    case "tribe_send": {
      const to = String(args.to ?? "")
      if (!to) throw new Error("tribe_send: 'to' is required")
      if (to === "*") {
        throw new Error("tribe_send: use tribe_broadcast for '*' targets")
      }
      await backend.send({
        from: selfSessionName,
        to,
        text: String(args.message ?? ""),
        scope,
      })
      return { ok: true, scope }
    }
    case "tribe_broadcast": {
      await backend.send({
        from: selfSessionName,
        to: "*",
        text: String(args.message ?? ""),
        scope,
      })
      return { ok: true, scope }
    }
    case "tribe_history": {
      const filter: HistoryFilter = {}
      if (typeof args.from === "string") filter.from = args.from
      if (typeof args.to === "string") filter.to = args.to
      if (typeof args.contains === "string") filter.contains = args.contains
      if (typeof args.since === "number") filter.since = args.since
      return backend.history({
        forSession: selfSessionName,
        limit: typeof args.limit === "number" ? (args.limit as number) : 50,
        scope,
        filter,
      })
    }
    case "tribe_members":
      return backend.members({ forSession: selfSessionName, scope })
    case "tribe_join": {
      const target = typeof args.name === "string" && args.name.length > 0 ? args.name : selfSessionName
      await backend.join({
        name: target,
        agentId: opts.selfAgentId,
        parent: opts.selfParent,
      })
      return { ok: true, name: target }
    }
    case "tribe_claim_chief":
      return backend.claimChief({ name: selfSessionName })
    case "tribe_release_chief":
      return backend.releaseChief({ name: selfSessionName })
    default:
      throw new Error(`unknown tribe tool: ${name}`)
  }
}

function pickScope(raw: unknown, fallback?: TribeScope): TribeScope {
  if (typeof raw === "string" && (TRIBE_SCOPES as readonly string[]).includes(raw)) {
    return raw as TribeScope
  }
  return fallback ?? "tree"
}

/**
 * Apply scope filtering to a recipient list given the sender's identity.
 * Used by backends that maintain a peer registry. Returns the names that
 * a send-with-scope is permitted to reach.
 */
export function filterRecipientsByScope(
  scope: TribeScope,
  sender: TribeMember,
  candidates: readonly TribeMember[],
): TribeMember[] {
  switch (scope) {
    case "self":
      return candidates.filter((c) => c.name === sender.name)
    case "tree":
      return candidates.filter(
        (c) =>
          c.name === sender.name ||
          c.parent === sender.name ||
          (sender.parent && c.name === sender.parent) ||
          (sender.parent && c.parent === sender.parent),
      )
    case "agent":
      return candidates.filter((c) => c.agentId === sender.agentId)
    case "all":
      return [...candidates]
  }
}

/** Filter a message stream by `HistoryFilter`. Pure helper, exported for backends. */
export function applyHistoryFilter(messages: readonly TribeMessage[], filter?: HistoryFilter): TribeMessage[] {
  if (!filter) return [...messages]
  return messages.filter((m) => {
    if (filter.from && m.from !== filter.from) return false
    if (filter.to && m.to !== filter.to) return false
    if (filter.contains && !m.text.includes(filter.contains)) return false
    if (filter.since != null && m.ts < filter.since) return false
    return true
  })
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

export type CreateServerOpts = {
  /** Default scope if a tools/call doesn't include one. */
  defaultScope?: TribeScope
  /** Self metadata, used by tribe_join defaults. */
  selfAgentId?: string
  selfParent?: string
}

export function createTribeMcpServer(
  backend: TribeBackend,
  selfSessionName: string,
  opts: CreateServerOpts = {},
): {
  handle(msg: JsonRpcRequest): Promise<JsonRpcResponse | null>
} {
  const callOpts: CallToolOpts = {
    defaultScope: opts.defaultScope,
    selfAgentId: opts.selfAgentId,
    selfParent: opts.selfParent,
  }
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
          const out = await callTool(backend, selfSessionName, name, args, callOpts)
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
  /** Drain messages addressed to a session since last call (for channel injector). */
  drain(sessionName: string): TribeMessage[]
  /** Direct access to the message log (tests). */
  log(): readonly TribeMessage[]
} {
  const history: TribeMessage[] = []
  const unseenBySession = new Map<string, TribeMessage[]>()
  const members = new Map<string, TribeMember>()
  let chiefName: string | null = null

  function ensureMember(name: string, agentId?: string, parent?: string): TribeMember {
    const existing = members.get(name)
    if (existing) {
      if (agentId && !existing.agentId) existing.agentId = agentId
      if (parent && !existing.parent) existing.parent = parent
      existing.lastActive = Date.now()
      existing.status = "online"
      return existing
    }
    const m: TribeMember = {
      name,
      status: "online",
      lastActive: Date.now(),
      agentId,
      parent,
      isChief: chiefName === name,
    }
    members.set(name, m)
    return m
  }

  return {
    async send(opts) {
      const sender = ensureMember(opts.from)
      // Targets must be known peers — agents call tribe_join first. Mirrors
      // the JSONL backend's strictness so behavior is identical across backends.
      if (opts.to !== "*" && !members.has(opts.to)) {
        throw new Error(`tribe: unknown peer '${opts.to}'`)
      }

      const msg: TribeMessage = {
        from: opts.from,
        to: opts.to,
        text: opts.text,
        ts: Date.now(),
        agentId: sender.agentId,
        parent: sender.parent,
      }
      history.push(msg)

      const scope = opts.scope ?? "tree"
      const all = Array.from(members.values())
      const reachable = filterRecipientsByScope(scope, sender, all)

      if (opts.to === "*") {
        for (const peer of reachable) {
          if (peer.name === opts.from) continue
          const list = unseenBySession.get(peer.name) ?? []
          list.push(msg)
          unseenBySession.set(peer.name, list)
        }
      } else {
        if (!reachable.some((p) => p.name === opts.to)) {
          throw new Error(`tribe: peer '${opts.to}' is out of scope '${scope}'`)
        }
        const list = unseenBySession.get(opts.to) ?? []
        list.push(msg)
        unseenBySession.set(opts.to, list)
      }
    },
    async history(opts) {
      const sender = members.get(opts.forSession) ?? {
        name: opts.forSession,
        status: "online" as const,
      }
      const scope = opts.scope ?? "tree"
      const allMembers = Array.from(members.values())
      const reachableNames = new Set(filterRecipientsByScope(scope, sender, allMembers).map((p) => p.name))
      reachableNames.add(opts.forSession)

      const visible = history.filter((m) => {
        // Always show messages where this session is participant
        if (m.from === opts.forSession || m.to === opts.forSession) return true
        // Broadcasts visible if sender is in scope
        if (m.to === "*" && reachableNames.has(m.from)) return true
        // Direct messages between in-scope peers also visible at "all"/"agent"
        if (scope === "all" || scope === "agent") {
          return reachableNames.has(m.from) && (m.to === "*" || reachableNames.has(m.to))
        }
        return false
      })
      const filtered = applyHistoryFilter(visible, opts.filter)
      const limit = opts.limit ?? 50
      return filtered.slice(-limit)
    },
    async members(opts) {
      const sender = members.get(opts.forSession) ?? {
        name: opts.forSession,
        status: "online" as const,
      }
      const scope = opts.scope ?? "tree"
      const all = Array.from(members.values())
      return filterRecipientsByScope(scope, sender, all).map((m) => ({
        ...m,
        isChief: chiefName === m.name,
      }))
    },
    async join(opts) {
      ensureMember(opts.name, opts.agentId, opts.parent)
    },
    async claimChief(opts) {
      ensureMember(opts.name)
      if (chiefName == null) {
        chiefName = opts.name
        return { ok: true, chief: chiefName }
      }
      if (chiefName === opts.name) return { ok: true, chief: chiefName }
      return { ok: false, chief: chiefName }
    },
    async releaseChief(opts) {
      if (chiefName === opts.name) {
        chiefName = null
        return { ok: true, chief: null }
      }
      return { ok: false, chief: chiefName }
    },
    async chief() {
      return chiefName
    },
    drain(sessionName) {
      const pending = unseenBySession.get(sessionName) ?? []
      unseenBySession.delete(sessionName)
      return pending
    },
    log() {
      return history
    },
  }
}
