/**
 * `runClaudeAcpServer({ stdin, stdout, env })` — main entry point. Wires an
 * `AgentSideConnection` over the given stdio streams and exposes an `Agent`
 * implementation that spawns the `claude` binary on each `newSession` and
 * forwards its events as ACP `SessionUpdate` notifications.
 *
 * # Why this server exists
 *
 * - `@agentclientprotocol/claude-agent-acp` (Anthropic-published, Zed-shipped)
 *   blocks Claude.ai subscriptions at session-init — Anthropic policy
 *   reserves Pro/Max quota for Claude Code's own surfaces.
 * - `carlrannaberg/cc-acp` (the only prior community subscription-compatible
 *   binary wrap) has been abandoned for ~8 months.
 *
 * Spawning the `claude` binary directly inherits Claude Code's full auth gate
 * (`CLAUDE_CODE_OAUTH_TOKEN`, `ANTHROPIC_API_KEY`, `~/.claude/auth.json`
 * fallback). This server packages that path as a real ACP server consumable
 * by any ACP client (Zed, Neovim, OpenACP, silvercode, future).
 *
 * # Architecture
 *
 *     stdio (ndJsonStream) ──┐
 *                            │
 *                  AgentSideConnection ── Agent impl (this file)
 *                                              │
 *                                              ├─ initialize()
 *                                              │   → returns {protocolVersion: 1, ...}
 *                                              │
 *                                              ├─ newSession({cwd, mcpServers})
 *                                              │   → spawnClaude(...) ── AgentSession
 *                                              │   → attachWire(...) ── translates events
 *                                              │   → returns {sessionId}
 *                                              │
 *                                              ├─ prompt({sessionId, prompt})
 *                                              │   → session.send(text); awaitTurn()
 *                                              │
 *                                              └─ cancel({sessionId})
 *                                                  → session.close()
 *
 * Subscription auth is fully transparent — `spawnClaude` (in `@km/agent-
 * harness`) inherits `process.env`, so OAuth / API-key / auth-json all
 * "just work" as they would for an interactive `claude` invocation.
 */

import { Readable, Writable } from "node:stream"
import * as acp from "@agentclientprotocol/sdk"
import type { AgentSession, McpServerSpec } from "@km/agent-harness"
import { spawnClaude } from "@km/agent-harness"
import { createScope, type Scope, disposable } from "@silvery/scope"
import { attachWire, type WireHandle } from "./wire.ts"

/**
 * Options for {@link runClaudeAcpServer}. By default reads from `process.stdin`
 * and writes to `process.stdout`.
 */
export interface RunClaudeAcpServerOpts {
  /** Stream the server reads JSON-RPC frames from. Defaults to `process.stdin`. */
  stdin?: NodeJS.ReadableStream
  /** Stream the server writes JSON-RPC frames to. Defaults to `process.stdout`. */
  stdout?: NodeJS.WritableStream
  /**
   * Stream the server logs diagnostic messages to. Defaults to `process.stderr`.
   * Diagnostic output goes here so it doesn't corrupt the JSON-RPC framing on
   * stdout. Currently unused at v1 (silent server) — wired for future use.
   */
  stderr?: NodeJS.WritableStream
  /**
   * Override the `claude` binary path. Defaults to `claude` on PATH.
   * Useful for testing or for users with non-standard installs.
   */
  claudeBinary?: string
  /**
   * Scope owning the server's lifetime. Disposing it kills any in-flight
   * Claude subprocesses and detaches the ACP connection. If omitted, an
   * internal scope is created and cleaned up on stream close.
   */
  scope?: Scope
}

/**
 * Run the ACP server. Resolves when the underlying ACP connection closes
 * (i.e. stdin EOF). Rejects only on catastrophic stream-setup errors.
 *
 * Typical bin entry usage (`bin/silvercode-claude-acp.js`):
 *
 * ```ts
 * import { runClaudeAcpServer } from "@km/claude-acp"
 * await runClaudeAcpServer()
 * ```
 */
export async function runClaudeAcpServer(opts: RunClaudeAcpServerOpts = {}): Promise<void> {
  const stdin = opts.stdin ?? process.stdin
  const stdout = opts.stdout ?? process.stdout
  const ownsScope = !opts.scope
  const scope = opts.scope ?? createScope("claude-acp-server")

  // Stream wiring — convert Node streams to Web streams for the SDK.
  const writable = Writable.toWeb(stdout as Writable) as WritableStream<Uint8Array>
  const readable = Readable.toWeb(stdin as Readable) as ReadableStream<Uint8Array>
  const stream = acp.ndJsonStream(writable, readable)

  // Per-session state. Indexed by ACP session id.
  interface SessionEntry {
    agentSession: AgentSession
    wire: WireHandle
    sessionScope: Scope
  }
  const sessions = new Map<string, SessionEntry>()

  // Build the Agent — `toAgent(conn)` is invoked by AgentSideConnection
  // synchronously during construction, so we close over `conn` after.
  // eslint-disable-next-line prefer-const
  let connRef: acp.AgentSideConnection | null = null

  const agent: acp.Agent = {
    async initialize(_params: acp.InitializeRequest): Promise<acp.InitializeResponse> {
      // We pin protocolVersion=1 — the wire is stable; only types churn.
      // Auth methods describe what end-users can use to authenticate the
      // *spawned* claude binary; we don't actually do any auth dance ourselves
      // (the binary handles it). Listing the methods makes ACP clients
      // surface them in their auth-method picker.
      return {
        protocolVersion: 1,
        agentCapabilities: {
          loadSession: false,
          promptCapabilities: {
            image: false,
            audio: false,
            embeddedContext: false,
          },
        },
        authMethods: [
          {
            id: "claude-login",
            name: "Claude Login (Pro/Max OAuth)",
            description:
              "Use the Pro/Max OAuth token from `claude login`. The CLAUDE_CODE_OAUTH_TOKEN env var or ~/.claude/auth.json must be set on the server process; this server does not perform the OAuth dance itself.",
          },
          {
            id: "anthropic-api-key",
            name: "Anthropic API Key",
            description:
              "Use ANTHROPIC_API_KEY (per-token API billing). Set the env var on the server process before launching this binary.",
          },
        ],
      }
    },

    async authenticate(_params: acp.AuthenticateRequest): Promise<acp.AuthenticateResponse> {
      // Authentication is performed by the Claude binary itself when it
      // spawns. The server is a passive relay — there's no authentication
      // dance to run here. Return success so clients that do an explicit
      // `authenticate` step before `newSession` proceed.
      return {}
    },

    async newSession(params: acp.NewSessionRequest): Promise<acp.NewSessionResponse> {
      if (!connRef) throw new Error("claude-acp: connection not yet bound")

      // Translate ACP McpServer[] → silvercode McpServerSpec[]. silvercode's
      // spec is intentionally the stdio subset that Claude Code understands;
      // HTTP/SSE MCP servers are dropped at v1 with a no-op so newSession
      // doesn't fail on a feature mismatch.
      const mcpServers: McpServerSpec[] = []
      for (const m of params.mcpServers ?? []) {
        // ACP's McpServer is a union of {stdio, http, sse}. silvercode's
        // McpServerSpec covers only the stdio shape (it's all Claude Code's
        // MCP layer understands at v1). Discriminate by the presence of a
        // `command` field — the stdio variant has it; http/sse don't.
        const candidate = m as Partial<acp.McpServerStdio> & { name: string }
        if (typeof candidate.command === "string") {
          mcpServers.push({
            name: candidate.name,
            command: candidate.command,
            args: candidate.args ?? [],
            env: Object.fromEntries((candidate.env ?? []).map((e) => [e.name, e.value])),
          })
        }
        // HTTP / SSE MCP servers: skipped silently. Future work: spawn a
        // bridge or surface a config error notification.
      }

      // Create a per-session scope so `cancel({sessionId})` / scope-disposal
      // can tear down exactly this session without affecting siblings.
      // Use scope.child() so disposal cascades from the server scope.
      const sessionScope = scope.child(`claude-session-${sessions.size + 1}`)

      const agentSession = spawnClaude({
        cwd: params.cwd,
        mcpServers: mcpServers.length > 0 ? mcpServers : undefined,
        ...(opts.claudeBinary ? { binary: opts.claudeBinary } : {}),
        // Default to non-bare so users get the full Claude Code feature set
        // (hooks, plugins, skills). Programmatic ACP clients that want
        // deterministic behavior can spawn the bin with `--bare` flag — but
        // since this is stdio-only we don't expose it as an ACP option.
      })

      // Tie the spawned subprocess to the per-session scope. Disposing the
      // scope kills the process group via `agentSession.close()`.
      sessionScope.use(
        disposable({}, () => {
          try {
            agentSession.close()
          } catch {
            // already closed
          }
        }),
      )

      // The actual session id surfaces from `spawnClaude`'s `session-init`
      // event — but newSession needs to return one synchronously. We use the
      // ACP-spec recommendation: synthesize one and let the underlying
      // sessionId stay an internal detail. ACP clients only care that the
      // id we return is what they use for subsequent prompt/cancel calls.
      const sessionId = `claude-acp-${Date.now()}-${sessions.size + 1}`

      // Wire events from the legacy AgentSession to ACP sessionUpdate
      // notifications.
      const wire = attachWire(connRef, agentSession, sessionId)
      sessionScope.use(disposable({}, () => wire.detach()))

      sessions.set(sessionId, { agentSession, wire, sessionScope })

      return {
        sessionId: sessionId as acp.SessionId,
        // No initial mode / config / model state — Claude Code doesn't
        // expose ACP-shaped variants of those at the wire layer.
      }
    },

    async prompt(params: acp.PromptRequest): Promise<acp.PromptResponse> {
      const entry = sessions.get(params.sessionId as string)
      if (!entry) {
        throw new acp.RequestError(-32000, `claude-acp: unknown sessionId ${params.sessionId}`)
      }

      // Concatenate text content blocks. Non-text blocks are silently dropped
      // at v1 — Claude Code's stream-json `send()` is text-only. (Image /
      // resource_link inputs would need richer wire-level support to land.)
      const textParts: string[] = []
      for (const block of params.prompt) {
        if (block.type === "text") textParts.push(block.text)
      }
      const text = textParts.join("")

      // Echo the user message as a `user_message_chunk` notification so
      // clients see the same conversation transcript Claude Code sees. This
      // matches what `claude-agent-acp` does for API-key users.
      void connRef?.sessionUpdate({
        sessionId: params.sessionId,
        update: {
          sessionUpdate: "user_message_chunk",
          content: { type: "text", text },
        },
      })

      try {
        entry.agentSession.send(text)
      } catch (err) {
        return {
          stopReason: "cancelled" as acp.StopReason,
          ...(err instanceof Error ? { _meta: { error: err.message } } : {}),
        }
      }

      // awaitTurn() resolves when the underlying AgentSession emits turn-end
      // or session-end (or the wire detaches due to cancel/dispose).
      return entry.wire.awaitTurn()
    },

    async cancel(params: acp.CancelNotification): Promise<void> {
      const entry = sessions.get(params.sessionId as string)
      if (!entry) return
      // Disposing the per-session scope tears down both the subprocess and
      // the wire attachment, settling any pending `awaitTurn()` with
      // `cancelled`.
      try {
        await entry.sessionScope[Symbol.asyncDispose]()
      } catch {
        // best-effort
      }
      sessions.delete(params.sessionId as string)
    },
  }

  const conn = new acp.AgentSideConnection(() => agent, stream)
  connRef = conn

  // When the connection closes (stream EOF), drop the scope. If we own it,
  // dispose synchronously; if the caller owns it, just unwind our state.
  void conn.closed.then(async () => {
    if (ownsScope) {
      try {
        await scope[Symbol.asyncDispose]()
      } catch {
        // best-effort
      }
    }
    return undefined
  })

  // Resolve when the connection closes. Callers (the bin entry) typically
  // run for the lifetime of the parent ACP client.
  await conn.closed
}
