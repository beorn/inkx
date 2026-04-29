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
 *                                              │   → returns {protocolVersion: 1, loadSession: true, ...}
 *                                              │
 *                                              ├─ newSession({cwd, mcpServers})
 *                                              │   → spawnClaude(...) ── AgentSession
 *                                              │   → attachWire(...) ── translates events
 *                                              │   → returns {sessionId}
 *                                              │
 *                                              ├─ loadSession({sessionId, cwd, mcpServers})
 *                                              │   → replayJsonl(...) ── replays JSONL as SessionUpdates
 *                                              │   → spawnClaude(--resume sessionId) ── AgentSession
 *                                              │   → attachWire(...) ── translates live events
 *                                              │   → returns {}
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

import { createReadStream } from "node:fs"
import { readdir, stat } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { Readable, Writable } from "node:stream"
import * as acp from "@agentclientprotocol/sdk"
import type { AgentEvent, AgentSession, McpServerSpec, ToolCallContent, ToolCallId } from "@km/agent-harness"
import { createLineSplitter, createStreamJsonParser, silvercodeToAcp, spawnClaude } from "@km/agent-harness"
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
  /**
   * Override the session-init timeout (ms) for `newSession`. Defaults to
   * 30s — generous enough for cold-boot Claude on M-series with multiple
   * MCP children (typically 5-15s) without being indefinite. Tests
   * override this to a small value to exercise the rejection path
   * without waiting 30s of wall clock.
   * @internal
   */
  sessionInitTimeoutMs?: number
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
          loadSession: true,
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

      // ACP sessionId MUST equal the real Claude session UUID — that's what
      // the on-disk JSONL transcript at ~/.claude/projects/<cwd>/<id>.jsonl
      // is keyed by. Earlier this server synthesized `claude-acp-${ts}-N`
      // when session-init didn't arrive in time and surfaced THAT to the
      // client; the resume hint then printed the synthetic id, and the
      // next `--resume <syntheticId>` failed with "session not found"
      // because the JSONL's real filename is the Claude UUID. UI rendered
      // that error to stderr behind the alt screen → user saw a blank
      // screen.
      //
      // Fix (km-silvercode.claude-acp-init-timeout-no-fallback): subscribe
      // to the spawn's event stream BEFORE returning, buffer all events
      // until session-init lands, then use `event.sessionId` as the ACP
      // sessionId. If session-init doesn't arrive within
      // SESSION_INIT_TIMEOUT_MS, REJECT newSession — no synthetic fallback,
      // no phantom session. The client surfaces the error via its
      // existing spawn-error mechanism (silvercode's controller wires
      // `lastSpawnError` from a rejected newSession).
      //
      // 30s — cold-boot Claude on M-series with multiple MCP children
      // regularly takes 5-15s. 10s was too tight; 30s is generous without
      // being indefinite. The buffered events are replayed through the
      // wire after attachWire so nothing's lost in the window between
      // spawn and wire-attach.
      const SESSION_INIT_TIMEOUT_MS = opts.sessionInitTimeoutMs ?? 30_000
      const buffered: AgentEvent[] = []
      let bufferingActive = true
      const stopBuffering = agentSession.subscribe((event) => {
        if (bufferingActive) buffered.push(event)
      })
      let sessionId: string
      try {
        sessionId = await new Promise<string>((resolve, reject) => {
          const timer = setTimeout(() => {
            unsubscribe()
            // Build an informative error. If claude already emitted
            // error/session-end/session-lifecycle events while we were
            // waiting, the real failure reason lives there — surface it
            // instead of the generic timeout message. Common causes:
            // bad OAuth (Keychain slot empty for the requested
            // CLAUDE_CONFIG_DIR), claude binary missing, MCP child
            // failing to start.
            const details = summarizeBufferedFailure(buffered)
            const baseMsg = `claude failed to initialize within ${SESSION_INIT_TIMEOUT_MS / 1000}s`
            const fullMsg = details
              ? `${baseMsg}. Subprocess output:\n${details}\n\nCheck Claude Code subscription auth (CLAUDE_CONFIG_DIR for --account) and MCP server health. DEBUG=silvercode:* DEBUG_LOG=/tmp/sc.log silvercode … for full trace.`
              : `${baseMsg} (no diagnostic events received — likely a subprocess spawn failure or stdin/stdout pipe issue). Check Claude Code subscription auth and MCP server health (DEBUG=silvercode:* DEBUG_LOG=/tmp/sc.log).`
            reject(new acp.RequestError(-32000, fullMsg))
          }, SESSION_INIT_TIMEOUT_MS)
          const unsubscribe = agentSession.subscribe((event) => {
            // session-init: success path.
            if (event.kind === "session-init") {
              clearTimeout(timer)
              unsubscribe()
              resolve(event.sessionId)
              return
            }
            // Early-fail path: claude died before emitting session-init.
            // Surface the real reason (error message or stopReason) so
            // the user sees auth / subprocess errors instead of a 30s
            // generic timeout.
            if (event.kind === "error") {
              clearTimeout(timer)
              unsubscribe()
              reject(
                new acp.RequestError(
                  -32000,
                  `claude failed to initialize: ${event.message}. Check Claude Code subscription auth (CLAUDE_CONFIG_DIR for --account) and MCP server health.`,
                ),
              )
              return
            }
            if (event.kind === "session-end" || event.kind === "session-lifecycle") {
              const ended =
                event.kind === "session-end" ||
                (event.kind === "session-lifecycle" && event.state === "ended")
              if (!ended) return
              const reason =
                event.kind === "session-end" && event.stopReason ? event.stopReason : "subprocess exited"
              clearTimeout(timer)
              unsubscribe()
              reject(
                new acp.RequestError(
                  -32000,
                  `claude exited before initializing (${reason}). Check that the claude binary is on PATH and the requested account has valid OAuth credentials.`,
                ),
              )
            }
          })
        })
      } catch (err) {
        // Init failed — stop buffering, drop the spawn, dispose the
        // per-session scope (which kills the subprocess), and propagate
        // the rejection to the ACP client. No synthetic id is ever
        // minted; the client's spawn-error UI handles surfacing.
        bufferingActive = false
        try {
          stopBuffering()
        } catch {
          // best-effort
        }
        try {
          await sessionScope[Symbol.asyncDispose]()
        } catch {
          // best-effort
        }
        throw err
      }

      // Wire events from the legacy AgentSession to ACP sessionUpdate
      // notifications. We attach AFTER we know the real sessionId, then
      // replay any buffered events (everything that arrived between
      // spawn and now, including session-init itself) so the wire
      // translates them into sessionUpdate notifications with the
      // correct sessionId.
      const wire = attachWire(connRef, agentSession, sessionId)
      sessionScope.use(disposable({}, () => wire.detach()))

      // Stop buffering and replay. The buffer-stop comes BEFORE the
      // attachWire subscribe is in place to avoid double-delivery, but
      // events that arrived in the same tick as the timer/init resolve
      // can still slip in — the wire's emit is idempotent enough at the
      // notification level (the consumer side dedups), and we'd rather
      // double-send than drop.
      bufferingActive = false
      stopBuffering()
      for (const event of buffered) wire.replayEvent(event)

      sessions.set(sessionId, { agentSession, wire, sessionScope })

      return {
        sessionId: sessionId as acp.SessionId,
        // No initial mode / config / model state — Claude Code doesn't
        // expose ACP-shaped variants of those at the wire layer.
      }
    },

    async loadSession(params: acp.LoadSessionRequest): Promise<acp.LoadSessionResponse> {
      if (!connRef) throw new Error("claude-acp: connection not yet bound")

      const sessionId = params.sessionId as string
      const cwd = params.cwd ?? process.cwd()

      // Resolve the on-disk JSONL path. Claude Code stores sessions at:
      //   ~/.claude/projects/<encodedCwd>/<sessionId>.jsonl
      // where encodedCwd replaces every '/' with '-' (leading '-' is from '/'
      // at the root — it's the literal encoding Claude Code uses).
      const encodedCwd = cwd.replace(/\//g, "-")
      const projectsDir = join(homedir(), ".claude", "projects", encodedCwd)
      const jsonlPath = join(projectsDir, `${sessionId}.jsonl`)

      // Synthetic-id detection: pre-fix silvercode versions minted ids of
      // the form `claude-acp-<13-digit-millis>-<seq>` when session-init
      // timed out. Those ids never resolve to a JSONL on disk — fail
      // FAST with an actionable error that lists recent resumable
      // sessions in this cwd, instead of the generic "session not found".
      // Bead: km-silvercode.claude-acp-init-timeout-no-fallback.
      if (SYNTHETIC_ACP_ID_RE.test(sessionId)) {
        const recent = await listRecentSessions(projectsDir)
        throw new acp.RequestError(-32000, syntheticIdErrorMessage(sessionId, recent))
      }

      // Verify the file exists before doing anything else.
      try {
        await stat(jsonlPath)
      } catch {
        throw new acp.RequestError(-32000, `session not found: ${sessionId}`)
      }

      // Per-session scope — ties both the JSONL replay and the live resume
      // subprocess to a single teardown path.
      const sessionScope = scope.child(`claude-session-${sessions.size + 1}`)

      // Build the MCP servers list the same way newSession does.
      const mcpServers: McpServerSpec[] = []
      for (const m of params.mcpServers ?? []) {
        const candidate = m as Partial<acp.McpServerStdio> & { name: string }
        if (typeof candidate.command === "string") {
          mcpServers.push({
            name: candidate.name,
            command: candidate.command,
            args: candidate.args ?? [],
            env: Object.fromEntries((candidate.env ?? []).map((e) => [e.name, e.value])),
          })
        }
      }

      // -----------------------------------------------------------------------
      // Phase 1 — Replay the JSONL file as SessionUpdate notifications.
      //
      // We pipe the on-disk JSONL through the existing stream-json parser
      // (the same parser spawnClaude uses for live output). Each recognizable
      // AgentEvent gets translated to a SessionUpdate notification via the same
      // silvercodeToAcp boundary adapter that attachWire uses, guaranteeing
      // the replay and the live stream use identical translation paths.
      //
      // Unsupported event kinds are skipped silently — they were already
      // handled in the original session. On-disk JSONL uses aggregate
      // "assistant" entries (not streaming text deltas), so assistant-message
      // events are specially handled to emit agent_message_chunk per block.
      // -----------------------------------------------------------------------

      await replayJsonl(jsonlPath, sessionId, connRef)

      // -----------------------------------------------------------------------
      // Phase 2 — Spawn `claude --resume <sessionId>` and attach the wire,
      // mirroring the newSession path exactly so prompt()/cancel() work the
      // same way for resumed sessions as for new ones.
      // -----------------------------------------------------------------------

      const agentSession = spawnClaude({
        cwd,
        resume: sessionId,
        mcpServers: mcpServers.length > 0 ? mcpServers : undefined,
        ...(opts.claudeBinary ? { binary: opts.claudeBinary } : {}),
      })

      sessionScope.use(
        disposable({}, () => {
          try {
            agentSession.close()
          } catch {
            // already closed
          }
        }),
      )

      const wire = attachWire(connRef, agentSession, sessionId)
      sessionScope.use(disposable({}, () => wire.detach()))

      sessions.set(sessionId, { agentSession, wire, sessionScope })

      return {}
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

// ---------------------------------------------------------------------------
// Synthetic-id detection — pre-fix silvercode versions minted ids of the
// form `claude-acp-<13-digit-unix-millis>-<seq>` when session-init timed
// out. The regex pins to 13 digits because real Claude session UUIDs use
// hex with dashes (8-4-4-4-12) and never start with `claude-acp-`.
// ---------------------------------------------------------------------------

const SYNTHETIC_ACP_ID_RE = /^claude-acp-\d{13}-\d+$/

interface RecentSession {
  uuid: string
  preview: string
  ageMs: number
}

/**
 * List the 5 most recent session JSONLs in a Claude projects dir, sorted
 * by mtime descending. Each entry includes the session UUID (filename
 * minus .jsonl), a 60-char preview of the first message, and its age in
 * ms. Returns `[]` if the dir is missing, unreadable, or empty.
 *
 * Used by `loadSession` to render an actionable error when the user
 * passes a synthetic / unknown id.
 */
async function listRecentSessions(projectsDir: string): Promise<RecentSession[]> {
  let entries: string[]
  try {
    entries = await readdir(projectsDir)
  } catch {
    return []
  }
  const candidates: { uuid: string; mtimeMs: number; path: string }[] = []
  for (const entry of entries) {
    if (!entry.endsWith(".jsonl")) continue
    const uuid = entry.slice(0, -".jsonl".length)
    const path = join(projectsDir, entry)
    try {
      const st = await stat(path)
      candidates.push({ uuid, mtimeMs: st.mtimeMs, path })
    } catch {
      // skip unreadable entries
    }
  }
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs)
  const top = candidates.slice(0, 5)
  const now = Date.now()
  const out: RecentSession[] = []
  for (const c of top) {
    out.push({
      uuid: c.uuid,
      preview: await firstMessagePreview(c.path),
      ageMs: Math.max(0, now - c.mtimeMs),
    })
  }
  return out
}

/**
 * Read the first user-message text (up to 60 chars) from a JSONL
 * transcript without loading the whole file. Returns "" if the file is
 * unreadable or has no recognizable user-text entry in its first slice.
 */
async function firstMessagePreview(jsonlPath: string): Promise<string> {
  return new Promise<string>((resolve) => {
    let buffer = ""
    let resolved = false
    const finish = (preview: string): void => {
      if (resolved) return
      resolved = true
      try {
        stream.destroy()
      } catch {
        // best-effort
      }
      resolve(preview)
    }
    const stream = createReadStream(jsonlPath, { encoding: "utf8", end: 16384 })
    stream.on("data", (chunk: string | Buffer) => {
      buffer += typeof chunk === "string" ? chunk : chunk.toString("utf8")
      const lines = buffer.split("\n")
      // Hold the trailing partial line for the next chunk.
      buffer = lines.pop() ?? ""
      for (const line of lines) {
        if (line.length === 0) continue
        const text = extractFirstUserText(line)
        if (text) {
          const truncated = text.length > 60 ? text.slice(0, 57) + "..." : text
          finish(truncated)
          return
        }
      }
    })
    stream.on("end", () => finish(""))
    stream.on("error", () => finish(""))
  })
}

/**
 * Best-effort extraction of the user text from a single JSONL line.
 * Returns the text or `null` if the line doesn't carry a user message.
 */
function extractFirstUserText(line: string): string | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(line)
  } catch {
    return null
  }
  if (typeof parsed !== "object" || parsed === null) return null
  const obj = parsed as { type?: string; message?: { role?: string; content?: unknown } }
  if (obj.type !== "user") return null
  const content = obj.message?.content
  if (typeof content === "string") return content
  if (Array.isArray(content)) {
    for (const block of content) {
      if (typeof block === "object" && (block as { type?: string })?.type === "text") {
        const text = (block as { text?: unknown }).text
        if (typeof text === "string" && text.length > 0) return text
      }
    }
  }
  return null
}

/** Render the actionable error message for a synthetic-id `loadSession`. */
function syntheticIdErrorMessage(sessionId: string, recent: RecentSession[]): string {
  const lines: string[] = []
  lines.push(`silvercode: --resume ${sessionId} — synthetic session ids cannot be resumed.`)
  lines.push(`This id was minted by an older silvercode that timed out waiting for`)
  lines.push(`the real Claude session UUID (now fixed in claude-acp).`)
  lines.push("")
  if (recent.length === 0) {
    lines.push("No resumable sessions found in this cwd. Omit --resume to start fresh.")
  } else {
    lines.push("Recent resumable sessions in this cwd:")
    for (const r of recent) {
      const ageLabel = formatAge(r.ageMs)
      const previewLabel = r.preview ? `"${r.preview}"` : "(no preview)"
      lines.push(`  ${r.uuid}  ${previewLabel}  (${ageLabel})`)
    }
    lines.push("")
    lines.push("Or omit --resume to start fresh.")
  }
  return lines.join("\n")
}

/** Human-readable age string ("2h ago", "5d ago", "just now"). */
function formatAge(ms: number): string {
  const sec = Math.floor(ms / 1000)
  if (sec < 60) return "just now"
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  return `${day}d ago`
}

/**
 * Summarize buffered events that arrived before session-init for inclusion
 * in the timeout error. Pulls error messages, session-end stopReasons, and
 * any other diagnostic-shaped events. Returns null if nothing useful was
 * captured (silent subprocess — distinct failure mode worth its own hint).
 */
function summarizeBufferedFailure(buffered: ReadonlyArray<AgentEvent>): string | null {
  const lines: string[] = []
  for (const event of buffered) {
    if (event.kind === "error") {
      lines.push(`  error: ${event.message}`)
    } else if (event.kind === "session-end") {
      lines.push(`  session-end: ${event.stopReason ?? "(no stopReason)"}`)
    } else if (event.kind === "session-lifecycle" && event.state === "ended") {
      lines.push(`  session-lifecycle: ended`)
    }
  }
  return lines.length > 0 ? lines.join("\n") : null
}

// ---------------------------------------------------------------------------
// replayJsonl — read a Claude session JSONL file and emit each recognized
// AgentEvent as an ACP SessionUpdate notification. Used during loadSession.
//
// The same createStreamJsonParser that spawnClaude uses for live output is
// reused here — it already knows how to skip unrecognized types
// (permission-mode, attachment, last-prompt, file-history-snapshot, etc.)
// and correctly handles the on-disk JSONL shapes (assistant aggregate blocks,
// user echo with wrapper-tag normalization, meta entries with isMeta:true).
// ---------------------------------------------------------------------------

/**
 * Emit ACP SessionUpdate notifications for every recognizable event in a
 * Claude session JSONL file. Resolves when the file is fully read.
 *
 * Events that don't map to a SessionUpdate (e.g. session-init, status,
 * permission-request) are skipped silently — they were already handled in
 * the original session.
 */
async function replayJsonl(jsonlPath: string, sessionId: string, conn: acp.AgentSideConnection): Promise<void> {
  return new Promise((resolve, reject) => {
    function emitUpdate(event: AgentEvent): void {
      let update: acp.SessionUpdate | null = null

      switch (event.kind) {
        case "user-message": {
          update = silvercodeToAcp({
            sessionUpdate: "user_message_chunk",
            content: { type: "text", text: event.text },
            messageId: null,
          })
          break
        }
        case "text-delta": {
          update = silvercodeToAcp({
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: event.text },
            messageId: null,
          })
          break
        }
        case "thinking-delta": {
          update = silvercodeToAcp({
            sessionUpdate: "agent_thought_chunk",
            content: { type: "text", text: event.text },
            messageId: null,
          })
          break
        }
        case "tool-use": {
          update = silvercodeToAcp({
            sessionUpdate: "tool_call",
            toolCallId: String(event.id) as ToolCallId,
            title: event.name,
            status: "in_progress",
            rawInput: event.input,
          })
          break
        }
        case "tool-result": {
          const content: ToolCallContent[] = [
            {
              type: "content",
              content: {
                type: "text",
                text: typeof event.output === "string" ? event.output : JSON.stringify(event.output ?? ""),
              },
            },
          ]
          update = silvercodeToAcp({
            sessionUpdate: "tool_call_update",
            toolCallId: String(event.id) as ToolCallId,
            status: event.is_error ? "failed" : "completed",
            rawOutput: event.output,
            content,
          })
          break
        }
        case "assistant-message": {
          // On-disk JSONL stores assistant turns as aggregate "assistant"
          // entries rather than streaming text deltas. During replay we
          // emit each text / thinking content block as the appropriate
          // chunk notification so clients reconstruct the full conversation
          // transcript. Tool-use blocks are handled by the separate
          // tool-use event that parse.ts also emits from the same aggregate.
          for (const block of event.content) {
            let blockUpdate: acp.SessionUpdate | null = null
            if (block.type === "text" && block.text.length > 0) {
              blockUpdate = silvercodeToAcp({
                sessionUpdate: "agent_message_chunk",
                content: { type: "text", text: block.text },
                messageId: null,
              })
            } else if (block.type === "thinking" && block.text.length > 0) {
              blockUpdate = silvercodeToAcp({
                sessionUpdate: "agent_thought_chunk",
                content: { type: "text", text: block.text },
                messageId: null,
              })
            }
            if (blockUpdate) {
              void conn.sessionUpdate({
                sessionId: sessionId as acp.SessionId,
                update: blockUpdate,
              })
            }
          }
          return
        }
        // session-init, turn-start, turn-end, session-end, session-lifecycle,
        // permission-request, permission-decision, status, error, handoff,
        // km-reference — no direct ACP SessionUpdate slot; skip silently
        // (already handled in the original session).
        default:
          return
      }

      if (update) {
        void conn.sessionUpdate({
          sessionId: sessionId as acp.SessionId,
          update,
        })
      }
    }

    const parser = createStreamJsonParser(emitUpdate)
    const splitter = createLineSplitter((line) => {
      try {
        parser.push(line)
      } catch {
        // Parser errors are defensive-skipped to match the live wire's stance.
      }
    })

    const fileStream = createReadStream(jsonlPath, { encoding: "utf8" })
    fileStream.on("data", (chunk: string | Buffer) => {
      splitter.push(typeof chunk === "string" ? chunk : chunk.toString("utf8"))
    })
    fileStream.on("end", () => {
      splitter.flush()
      resolve()
    })
    fileStream.on("error", (err) => {
      reject(err)
    })
  })
}
