/**
 * connectAcp(scope, opts) — scope-bound `ClientSideConnection` factory for
 * **external ACP servers** (Codex via `@zed-industries/codex-acp`, Gemini CLI
 * in ACP mode, GitHub Copilot CLI, `pi-acp`, etc.).
 *
 * NOT for wrapping Claude Code — that's `acp-adapter-claude` / Anthropic's
 * own `claude-agent-acp`. This module is the **client side**:
 *
 *     silvercode → ACP wire (ndJsonStream over stdio) → external ACP server.
 *
 * The connection lifecycle is owned by a `Scope` (`@silvery/scope`):
 *
 * - When the scope disposes, the child process is killed (SIGTERM, with a
 *   short SIGKILL fallback), the ACP `ClientSideConnection` closes, and
 *   in-flight prompts abort via the connection's AbortSignal.
 * - Children are registered with the scope at construction. The signal also
 *   propagates to in-flight `prompt(...)` calls, so callers don't have to
 *   thread cancellation manually.
 *
 * The returned `AcpAgentSession` is structurally compatible with the existing
 * silvercode `AgentSession` (`./events.ts`). `subscribe(handler)` receives
 * the legacy `AgentEvent` union — `sessionUpdate` notifications from the
 * agent are mapped to the closest legacy event so existing
 * `session-store.ts` consumers work unchanged. Once the
 * `acp-foundation`-shaped `SessionUpdate` becomes the canonical UI surface
 * (bead `km-silvercode.acp-session`), this mapping moves to a thin
 * pass-through and the existing inline mapper retires.
 *
 * Reference: hub/silvercode/future/ai-terminal/10-agent-router-landscape.md
 *            § "How ACP is set up and consumed (concrete)".
 */

import { spawn as nodeSpawn } from "node:child_process"
import { gracefulKillTree } from "./spawn"
import { EventEmitter } from "node:events"
import { Readable, Writable } from "node:stream"
import { fileURLToPath } from "node:url"
import * as acp from "@agentclientprotocol/sdk"
import { Scope, disposable } from "@silvery/scope"
import createDebug from "debug"
import { acpToSilvercode } from "./acp-boundary.ts"
import type {
  AgentEvent,
  AgentSession,
  ContentBlock as LegacyContentBlock,
  PermissionRequestId,
  SessionId,
  ToolUseId,
  TurnId,
} from "./events.ts"

const dSpawn = createDebug("agent-harness:acp:spawn")
const dWire = createDebug("agent-harness:acp:wire")
const dEvent = createDebug("agent-harness:acp:event")

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Permission handler — invoked when the agent requests permission to run a
 * tool. Return `null` to translate to `{ outcome: "cancelled" }`. If no
 * handler is wired, the connection responds `cancelled` and surfaces an
 * `error` AgentEvent so the UI knows permission flow is unconfigured.
 */
export type PermissionHandler = (req: acp.RequestPermissionRequest) => Promise<acp.RequestPermissionResponse | null>

export type FsHandler = {
  readTextFile?: (req: acp.ReadTextFileRequest) => Promise<acp.ReadTextFileResponse>
  writeTextFile?: (req: acp.WriteTextFileRequest) => Promise<acp.WriteTextFileResponse>
}

export type TerminalHandler = {
  createTerminal?: (req: acp.CreateTerminalRequest) => Promise<acp.CreateTerminalResponse>
  terminalOutput?: (req: acp.TerminalOutputRequest) => Promise<acp.TerminalOutputResponse>
  releaseTerminal?: (req: acp.ReleaseTerminalRequest) => Promise<acp.ReleaseTerminalResponse | void>
  waitForTerminalExit?: (req: acp.WaitForTerminalExitRequest) => Promise<acp.WaitForTerminalExitResponse>
  killTerminal?: (req: acp.KillTerminalRequest) => Promise<acp.KillTerminalResponse | void>
}

export type AcpConnectOpts = {
  /** Executable to spawn (e.g. `npx`, `codex`, absolute path). */
  command: string
  /** Arguments. */
  args?: string[]
  /** Environment variables (merged over `process.env`). */
  env?: Record<string, string | undefined>
  /** Working directory for the child. Defaults to `process.cwd()`. */
  cwd?: string
  /**
   * Capabilities the **client** advertises to the agent during initialize.
   * Default: `{}` — no fs / terminal capabilities. Wire handlers and
   * advertise the matching capabilities together.
   */
  clientCapabilities?: acp.ClientCapabilities
  /** Protocol version to negotiate. Defaults to `acp.PROTOCOL_VERSION` (1). */
  protocolVersion?: number
  /** MCP servers to forward to the agent's `newSession`. */
  mcpServers?: acp.McpServer[]
  /**
   * Working directory for the **session** (passed to `newSession`). If
   * omitted, falls back to `cwd` and then `process.cwd()`. Must be absolute
   * per ACP spec.
   */
  sessionCwd?: string
  /** Permission handler (see `PermissionHandler`). */
  permissionHandler?: PermissionHandler
  /** Filesystem handlers (only invoked when matching capability advertised). */
  fsHandler?: FsHandler
  /** Terminal handlers (only invoked when `clientCapabilities.terminal === true`). */
  terminalHandler?: TerminalHandler
  /** When true, swallow subprocess stderr instead of forwarding as `error` events. */
  silentStderr?: boolean
  /** Skip the initial `newSession` call. Caller drives the session lifecycle. */
  skipNewSession?: boolean
  /**
   * Resume an existing session instead of creating a new one. When set,
   * `agent.loadSession({ sessionId, cwd, mcpServers })` is called in place
   * of `agent.newSession`. The agent re-emits prior `SessionUpdate`
   * notifications during load so subscribers rebuild UI state from the
   * stream. Throws `AcpResumeUnsupportedError` if the agent doesn't
   * advertise `loadSession: true` in its initialize response.
   */
  resume?: { sessionId: string }
  /**
   * Model id to surface in the legacy session-init event. ACP itself
   * doesn't include a model field in its session lifecycle — the agent
   * picks per turn from the connection — so silvercode passes the
   * resolved model through here just so the SidePanel and any legacy
   * `SessionState.model` consumers display something meaningful for
   * non-Claude backends. Optional; empty string when omitted.
   */
  model?: string
}

/**
 * Thrown by `connectAcp` when `opts.resume` is set but the negotiated
 * agent doesn't advertise `loadSession` capability. Carries the actual
 * `agentCapabilities` so callers can offer a meaningful fallback.
 */
export class AcpResumeUnsupportedError extends Error {
  readonly agentCapabilities: acp.AgentCapabilities
  constructor(agentCapabilities: acp.AgentCapabilities) {
    super(
      "ACP agent does not advertise loadSession capability — cannot resume. " +
        `Capabilities: ${JSON.stringify(agentCapabilities)}`,
    )
    this.name = "AcpResumeUnsupportedError"
    this.agentCapabilities = agentCapabilities
  }
}

/**
 * Handle for a live connection to an external ACP server. Extends the
 * existing silvercode `AgentSession` so consumers (session-store, UI) can
 * treat ACP-spawned sessions identically to subprocess-spawned ones.
 */
export interface AcpAgentSession extends AgentSession {
  /** The underlying ACP connection (use sparingly — prefer the typed wrappers). */
  readonly agent: acp.ClientSideConnection
  /** Capabilities the agent advertised during initialize. */
  readonly capabilities: acp.AgentCapabilities
  /** Authentication methods the agent advertised. Empty if no auth required. */
  readonly authMethods: acp.AuthMethod[]
  /** Negotiated protocol version. */
  readonly protocolVersion: number
  /**
   * Send a prompt. Returns the stop reason. Aborts when the scope disposes.
   * Convenience wrapper around `agent.prompt({ sessionId, prompt: ... })`.
   */
  prompt(content: acp.ContentBlock[]): Promise<acp.PromptResponse>
  /** Cancel the in-flight prompt for this session (notification only). */
  cancel(): Promise<void>
  /** Authenticate with the given method id (subscription OAuth, env-var, etc.). */
  authenticate(methodId: string): Promise<acp.AuthenticateResponse | void>
  /**
   * Resume an existing session within this open connection. The agent
   * re-emits prior SessionUpdate notifications during load. Throws
   * `AcpResumeUnsupportedError` if the agent didn't advertise loadSession
   * capability at initialize time. Replaces this handle's `sessionId`
   * with the resumed one.
   */
  loadSession(
    sessionId: string,
    opts?: { cwd?: string; mcpServers?: acp.McpServer[] },
  ): Promise<acp.LoadSessionResponse>
}

// ---------------------------------------------------------------------------
// Registry — known external ACP servers, by id.
//
// Update this table when new agents matter; defer dynamic registry fetch to a
// follow-up bead (see km-silvercode.acp tracking notes for ACP server
// catalogue work).
// ---------------------------------------------------------------------------

export type AcpRegistryId =
  | "codex" // OpenAI Codex via @zed-industries/codex-acp
  | "gemini" // Google Gemini CLI in ACP mode
  | "github-copilot-cli" // GitHub Copilot CLI (binary on PATH)
  | "pi-acp" // pi-acp ecosystem
  | "claude-code" // silvercode-built subscription-compatible Claude wrapper

// `bun x` (not `npx`) is used for npm-resolved agents because silvercode
// commonly runs inside the km monorepo, whose root package.json declares
// `$@silvery/ag` workspace overrides that npm can't resolve. `bun x`
// transparently resolves and runs the package without colliding with our
// workspace overrides. See feedback-npx-mcp-from-workspace.md.
const ACP_REGISTRY: Record<
  AcpRegistryId,
  { command: string; args: string[]; description: string; env?: Record<string, string> }
> = {
  codex: {
    command: "bun",
    args: ["x", "@zed-industries/codex-acp"],
    description: "OpenAI Codex via Zed's ACP wrapper (ChatGPT subscription supported).",
  },
  gemini: {
    command: "bun",
    // `--acp` is the canonical flag as of gemini-cli 0.38+; `--experimental-acp`
    // is deprecated but still works. We use `--acp` to avoid confusion.
    args: ["x", "@google/gemini-cli", "--acp"],
    // GEMINI_CLI_TRUST_WORKSPACE suppresses the "Skipping project agents due to
    // untrusted folder" info notice that gemini-cli writes to stdout in ACP mode
    // (via createNonInteractiveUI → process.stdout.write). Without this, that
    // line corrupts the ndJSON-RPC stream and causes a SyntaxError in the ACP
    // SDK parser. Same effect as passing --skip-trust on the CLI.
    env: { GEMINI_CLI_TRUST_WORKSPACE: "true" },
    description: "Google Gemini CLI in ACP mode (Sign in with Google supported).",
  },
  "github-copilot-cli": {
    command: "copilot",
    args: [],
    description: "GitHub Copilot CLI — assumes `copilot` binary on PATH (Copilot subscription).",
  },
  "pi-acp": {
    command: "bun",
    args: ["x", "pi-acp"],
    description: "pi-acp ecosystem agent.",
  },
  "claude-code": {
    command: "bun",
    // @km/claude-acp is private (workspace-only) — `bun x @km/claude-acp` 404s
    // on npm. Resolve the bin via this file's directory: acp-client.ts lives at
    // apps/silvercode/packages/agent-harness/src/, so the sibling claude-acp
    // package's bin is at ../../claude-acp/bin/silvercode-claude-acp.js.
    // probe-acp.ts uses the same resolution; mirror it here so the production
    // path matches the test path. Swap to `bun x @km/claude-acp` once the
    // package is published.
    args: [fileURLToPath(new URL("../../claude-acp/bin/silvercode-claude-acp.js", import.meta.url))],
    description:
      "Claude Code via silvercode's standalone ACP wrapper — subscription-compatible (Pro/Max OAuth + ANTHROPIC_API_KEY). The only maintained subscription path; @agentclientprotocol/claude-agent-acp blocks Pro/Max, and carlrannaberg/cc-acp is abandoned. Bin resolved via import.meta.url because the package is private (workspace-only).",
  },
}

/**
 * Resolve a registry id and connect. Convenience over `connectAcp`.
 *
 * Resume: pass `opts.resume = { sessionId }` to call `loadSession` instead
 * of `newSession`. Throws `AcpResumeUnsupportedError` if the resolved agent
 * doesn't advertise `loadSession: true`. Per agent (verified 2026-04-26):
 *
 *   codex        — loadSession: true
 *   pi-acp       — loadSession: true
 *   gemini       — partial (advertises true; replay coverage unverified)
 *   claude-code  — loadSession: true (JSONL replay + claude --resume shipped,
 *                  bead km-silvercode.acp-claude-acp-loadsession CLOSED)
 *   github-copilot-cli — unverified
 */
export function connectAcpRegistry(
  scope: Scope,
  registryId: AcpRegistryId,
  opts: Omit<AcpConnectOpts, "command" | "args"> & {
    /** Override the registry args (e.g. add `--model` to gemini). */
    extraArgs?: string[]
  } = {},
): Promise<AcpAgentSession> {
  const entry = ACP_REGISTRY[registryId]
  if (!entry) {
    throw new Error(`connectAcpRegistry: unknown registryId ${JSON.stringify(registryId)}`)
  }
  const { extraArgs, ...rest } = opts
  return connectAcp(scope, {
    ...rest,
    command: entry.command,
    args: extraArgs ? [...entry.args, ...extraArgs] : entry.args,
    // Registry-level env (e.g. GEMINI_CLI_TRUST_WORKSPACE) is merged first so
    // caller opts.env can override it if needed.
    env: entry.env ? { ...entry.env, ...rest.env } : rest.env,
  })
}

// ---------------------------------------------------------------------------
// Test seam — the spawn function. Tests inject a fake to avoid invoking real
// binaries. Production code uses `nodeSpawn`.
// ---------------------------------------------------------------------------

/** Minimal shape we need from a spawned child — keeps the test seam tight. */
export interface AcpSpawnedChild {
  readonly pid?: number
  readonly stdin: NodeJS.WritableStream | null
  readonly stdout: NodeJS.ReadableStream | null
  readonly stderr: NodeJS.ReadableStream | null
  /** Liveness fields — `null` while alive, set on exit. Read directly to avoid PID-reuse hazards. */
  readonly exitCode: number | null
  readonly signalCode: NodeJS.Signals | null
  kill(signal?: NodeJS.Signals | number): boolean
  on(event: "exit", listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown
  on(event: "error", listener: (err: Error) => void): unknown
}

export type AcpSpawn = (
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv },
) => AcpSpawnedChild

let activeSpawn: AcpSpawn = (command, args, options) =>
  nodeSpawn(command, args, {
    ...options,
    stdio: ["pipe", "pipe", "pipe"],
    // detached: true puts the ACP child in its own process group so we
    // can SIGTERM the whole tree (npx wrapper + the actual agent binary +
    // any MCP grandchildren) on shutdown via gracefulKillTree's
    // `process.kill(-pid, …)`. Without this, SIGTERM only reaches the
    // direct child (typically `npx`) and the inner agent process can
    // be left as an orphan — which is exactly what made codex hang on
    // Ctrl+D quit.
    detached: true,
  }) as unknown as AcpSpawnedChild

/**
 * Override the spawn function used by `connectAcp`. Tests pass a fake that
 * returns an in-memory child; production never calls this.
 */
export function __setAcpSpawnForTesting(fn: AcpSpawn | null): void {
  activeSpawn =
    fn ??
    ((command, args, options) =>
      nodeSpawn(command, args, {
        ...options,
        stdio: ["pipe", "pipe", "pipe"],
        detached: true,
      }) as unknown as AcpSpawnedChild)
}

// ---------------------------------------------------------------------------
// stdout filter — strip non-JSON lines before the ACP SDK parser sees them
// ---------------------------------------------------------------------------

/**
 * Wrap a Readable stdout stream with a line filter that passes only lines
 * starting with `{` (JSON objects) to the output. All other lines are
 * considered non-JSON noise (info/warning text from the ACP server process)
 * and are routed to `onDropped` for surfacing as diagnostic events.
 *
 * The ACP ndJSON protocol sends one JSON object per line. Any line that is NOT
 * a JSON object is out-of-band noise that would corrupt the stream parser.
 *
 * Implementation notes:
 * - Works in streaming mode: buffers a partial line across chunk boundaries.
 * - Passes the raw chunk through unchanged if it's entirely JSON lines (the
 *   common case) to avoid unnecessary copies.
 * - Empty lines are silently dropped (ndJSON allows them as separators).
 */
export function buildNonJsonLineFilter(source: Readable, onDropped: (line: string) => void): Readable {
  let tail = ""

  const output = new Readable({
    read() {
      // pull-driven; data is pushed by the source 'data' listener below
    },
  })

  source.on("data", (chunk: Buffer | string) => {
    const text = tail + (typeof chunk === "string" ? chunk : chunk.toString("utf8"))
    const lines = text.split("\n")
    // The last element is either empty (chunk ended with \n) or a partial line.
    tail = lines.pop() ?? ""

    for (const line of lines) {
      if (line === "") continue // ndJSON separator — drop silently
      if (line.startsWith("{")) {
        output.push(Buffer.from(line + "\n", "utf8"))
      } else {
        onDropped(line)
      }
    }
  })

  source.on("end", () => {
    // Flush any partial buffered line.
    if (tail !== "") {
      if (tail.startsWith("{")) {
        output.push(Buffer.from(tail, "utf8"))
      } else {
        onDropped(tail)
      }
    }
    output.push(null)
  })

  source.on("error", (err) => {
    output.destroy(err)
  })

  return output
}

// ---------------------------------------------------------------------------
// connectAcp
// ---------------------------------------------------------------------------

export async function connectAcp(scope: Scope, opts: AcpConnectOpts): Promise<AcpAgentSession> {
  const protocolVersion = opts.protocolVersion ?? acp.PROTOCOL_VERSION
  const cwd = opts.cwd ?? process.cwd()
  const env: NodeJS.ProcessEnv = { ...process.env, ...opts.env }
  const args = opts.args ?? []

  dSpawn("connectAcp command=%s args=%o cwd=%s", opts.command, args, cwd)

  const child = activeSpawn(opts.command, args, { cwd, env })
  if (!child.stdin || !child.stdout) {
    throw new Error(`connectAcp: child process started without stdin/stdout pipes (command=${opts.command})`)
  }

  // Register the child with the scope. Disposal kills the process group;
  // best-effort SIGTERM, then SIGKILL after a short grace period if still
  // alive. We don't wait — disposal is fire-and-forget at this layer (the
  // connection's `closed` promise handles drain).
  let exited = false
  scope.use(
    disposable({ pid: child.pid }, () => {
      if (exited) return
      try {
        child.kill("SIGTERM")
      } catch {
        // already gone
      }
      // Give the agent ~250ms to flush; if still alive, SIGKILL.
      const t = setTimeout(() => {
        if (exited) return
        try {
          child.kill("SIGKILL")
        } catch {
          // already gone
        }
      }, 250)
      // setTimeout returns a NodeJS.Timeout (not a number) under @types/node;
      // unref keeps the dispose timer from holding the event loop open.
      ;(t as unknown as { unref?: () => void }).unref?.()
    }),
  )

  let resolveExit: (() => void) | null = null
  const exitPromise = new Promise<void>((r) => {
    resolveExit = r
  })
  child.on("exit", (code, signal) => {
    exited = true
    dSpawn("child exit code=%s signal=%s", code, signal)
    resolveExit?.()
  })
  child.on("error", (err) => {
    dSpawn("child error: %s", err.message)
  })

  // Build the bus for AgentEvent subscribers (legacy session-store path).
  const bus = new EventEmitter()
  let sessionId: SessionId = "acp-pending" as SessionId
  let closed = false
  let sentTerm = false
  // Active prompt turn id — shared across every SessionUpdate notification
  // that lands between `prompt()` start and resolve. Without this, each
  // notification minted a fresh `acp-turn-${Date.now()}` and the legacy
  // session-store keyed each `text-delta` to a new MessageEntry → every
  // streamed chunk rendered as its own `●` row. Set in `send()`/`prompt()`,
  // cleared after `turn-end` emits.
  let currentTurnId: TurnId | null = null
  function turnIdForUpdate(): TurnId {
    return currentTurnId ?? (("acp-turn-" + Date.now()) as TurnId)
  }

  function emit(event: AgentEvent): void {
    // `handoff` lacks `sessionId` — narrow before logging.
    const sid = "sessionId" in event ? event.sessionId : "<handoff>"
    dEvent("emit kind=%s session=%s", event.kind, sid)
    bus.emit("event", event)
  }

  // Surface stderr as legacy `error` events so the UI's existing
  // `state.lastError` panel works unchanged.
  child.stderr?.on("data", (chunk: Buffer | string) => {
    if (opts.silentStderr) return
    const msg = typeof chunk === "string" ? chunk.trim() : chunk.toString("utf8").trim()
    if (!msg) return
    emit({ kind: "error", sessionId, message: msg, ts: Date.now() })
  })

  // Stream wiring — convert Node streams to Web streams for the SDK.
  //
  // stdout filter: drop any line that does NOT start with `{`. Some ACP
  // servers (notably `@google/gemini-cli`) write info/warning notices
  // directly to stdout via their non-interactive UI layer instead of stderr.
  // Those plain-text lines corrupt the ndJSON-RPC stream and cause
  // `SyntaxError: JSON Parse error` in the ACP SDK parser. The filter strips
  // them before the SDK ever sees them. Dropped lines are surfaced as `error`
  // AgentEvents so they remain visible in the UI.
  //
  // Why here and not in the SDK: this is a process-boundary concern — the
  // spawned binary is breaking the ACP wire contract by writing to stdout.
  // The filter is the minimal correct fix at the stdio pipe layer.
  const writable = Writable.toWeb(child.stdin as Writable) as WritableStream<Uint8Array>
  const rawReadable = child.stdout as Readable
  const filteredReadable = buildNonJsonLineFilter(rawReadable, (dropped) => {
    // Emit after sessionId is assigned (runs asynchronously, so sessionId
    // will be set by then). The `error` kind surfaces in the UI's error panel.
    dWire("stdout-filter dropped non-JSON line: %s", dropped)
    emit({ kind: "error", sessionId, message: `[acp stdout] ${dropped}`, ts: Date.now() })
  })
  const readable = Readable.toWeb(filteredReadable) as ReadableStream<Uint8Array>
  const stream = acp.ndJsonStream(writable, readable)

  // Build the Client callback bridge.
  const client: acp.Client = {
    // eslint-disable-next-line @typescript-eslint/require-await
    async sessionUpdate(params: acp.SessionNotification): Promise<void> {
      dWire("sessionUpdate %s", params.update.sessionUpdate)
      try {
        const mapped = mapSessionUpdateToLegacyEvents(params, sessionId, turnIdForUpdate())
        for (const ev of mapped) emit(ev)
      } catch (err) {
        emit({
          kind: "error",
          sessionId,
          message: `acp sessionUpdate handler failed: ${(err as Error).message}`,
          raw: params,
          ts: Date.now(),
        })
      }
    },

    async requestPermission(req: acp.RequestPermissionRequest): Promise<acp.RequestPermissionResponse> {
      dWire("requestPermission tool=%s", req.toolCall.title ?? req.toolCall.toolCallId)
      // Surface a legacy permission-request event so existing UI sees it.
      emit({
        kind: "permission-request",
        sessionId,
        requestId: String(req.toolCall.toolCallId) as PermissionRequestId,
        tool: req.toolCall.title ?? "",
        args: req.toolCall.rawInput,
        ts: Date.now(),
      })
      if (!opts.permissionHandler) {
        emit({
          kind: "error",
          sessionId,
          message:
            "acp permissionHandler not configured — auto-cancelling permission request. " +
            "Wire AcpConnectOpts.permissionHandler to surface this in the UI.",
          ts: Date.now(),
        })
        return { outcome: { outcome: "cancelled" } }
      }
      const handled = await opts.permissionHandler(req)
      if (!handled) return { outcome: { outcome: "cancelled" } }
      return handled
    },

    ...(opts.fsHandler?.readTextFile ? { readTextFile: opts.fsHandler.readTextFile } : {}),
    ...(opts.fsHandler?.writeTextFile ? { writeTextFile: opts.fsHandler.writeTextFile } : {}),

    ...(opts.terminalHandler?.createTerminal ? { createTerminal: opts.terminalHandler.createTerminal } : {}),
    ...(opts.terminalHandler?.terminalOutput ? { terminalOutput: opts.terminalHandler.terminalOutput } : {}),
    ...(opts.terminalHandler?.releaseTerminal ? { releaseTerminal: opts.terminalHandler.releaseTerminal } : {}),
    ...(opts.terminalHandler?.waitForTerminalExit
      ? { waitForTerminalExit: opts.terminalHandler.waitForTerminalExit }
      : {}),
    ...(opts.terminalHandler?.killTerminal ? { killTerminal: opts.terminalHandler.killTerminal } : {}),
  }

  const agent = new acp.ClientSideConnection(() => client, stream)

  // When the connection closes (stream EOF), mark closed + emit session-end.
  void agent.closed.then(() => {
    if (closed) return
    closed = true
    emit({ kind: "session-lifecycle", sessionId, state: "ended", ts: Date.now() })
    emit({ kind: "session-end", sessionId, ts: Date.now() })
  })

  // Initialize — exchanges protocol version + capabilities.
  const init = await agent.initialize({
    protocolVersion,
    clientCapabilities: opts.clientCapabilities ?? {},
  })
  dSpawn("initialize ok protocolVersion=%d", init.protocolVersion)

  // Open a session unless caller wants to drive that explicitly.
  if (!opts.skipNewSession) {
    const sessionCwd = opts.sessionCwd ?? cwd
    if (opts.resume) {
      // Resume path — call loadSession instead of newSession. The agent
      // re-emits prior SessionUpdates during load via the existing
      // sessionUpdate notification path, so subscribers rebuild UI state
      // from the stream automatically.
      if (init.agentCapabilities?.loadSession !== true) {
        throw new AcpResumeUnsupportedError(init.agentCapabilities ?? {})
      }
      sessionId = opts.resume.sessionId as SessionId
      dSpawn("loadSession sessionId=%s cwd=%s", sessionId, sessionCwd)
      await agent.loadSession({
        sessionId: opts.resume.sessionId as acp.SessionId,
        cwd: sessionCwd,
        mcpServers: opts.mcpServers ?? [],
      })
      dSpawn("loadSession ok sessionId=%s", sessionId)
    } else {
      const newSessionResult = await agent.newSession({
        cwd: sessionCwd,
        mcpServers: opts.mcpServers ?? [],
      })
      sessionId = newSessionResult.sessionId as SessionId
      dSpawn("newSession ok sessionId=%s", sessionId)
    }
    // Surface a legacy session-init so existing session-store consumers
    // populate sessionId / cwd from day one. ACP doesn't carry the rich
    // metadata Claude's stream-json does, so most fields are empty. We emit
    // this AFTER loadSession returns so that any replayed SessionUpdate
    // notifications fired during the load arrive in order with init first.
    emit({
      kind: "session-init",
      sessionId,
      cwd: sessionCwd,
      model: opts.model ?? "",
      mode: "",
      tools: [],
      mcp_servers: (opts.mcpServers ?? []).map((s) => s.name),
      slashCommands: [],
      skills: [],
      plugins: [],
      claudeCodeVersion: "",
      apiKeySource: "",
      ts: Date.now(),
    })
  }

  const handle: AcpAgentSession = {
    get sessionId(): SessionId {
      return sessionId
    },
    get closed(): boolean {
      return closed
    },
    agent,
    capabilities: init.agentCapabilities ?? {},
    authMethods: init.authMethods ?? [],
    protocolVersion: init.protocolVersion,

    send(text: string): void {
      // Best-effort: caller should typically use prompt() for typed responses.
      // We fire prompt without awaiting to keep `send` synchronous like the
      // legacy AgentSession contract; errors surface through the `error` bus.
      //
      // Fix (bead km-silvercode.thinking-loop-after-bash): after the prompt
      // resolves, emit a `turn-end` event carrying the stop reason so that
      // `session-store` sets status → "idle" and the ActivityIndicator clears.
      // Without this, the PromptResponse was silently discarded — no turn-end
      // ever fired → store stayed in "thinking" → 98% CPU busy-loop.
      const turnId = ("acp-turn-" + Date.now()) as TurnId
      currentTurnId = turnId
      void agent
        .prompt({
          sessionId,
          prompt: [{ type: "text", text }],
        })
        .then((response) => {
          emit({
            kind: "turn-end",
            sessionId,
            turnId,
            stopReason: response.stopReason ?? "end_turn",
            ts: Date.now(),
          })
        })
        .catch((err: Error) => {
          emit({
            kind: "error",
            sessionId,
            message: `acp prompt failed: ${err.message}`,
            ts: Date.now(),
          })
        })
        .finally(() => {
          if (currentTurnId === turnId) currentTurnId = null
        })
    },

    respondToPermission(_requestId: PermissionRequestId, _approved: boolean): void {
      // ACP permission flow is request/response inside requestPermission()
      // — there's no out-of-band approval channel. Callers wire
      // `permissionHandler` to resolve the request inline. Surface a clear
      // error if anything tries to use the legacy out-of-band path.
      emit({
        kind: "error",
        sessionId,
        message:
          "AcpAgentSession.respondToPermission() is not supported — wire " +
          "AcpConnectOpts.permissionHandler to resolve permission requests inline.",
        ts: Date.now(),
      })
    },

    subscribe(handler: (event: AgentEvent) => void): () => void {
      bus.on("event", handler)
      return () => bus.off("event", handler)
    },

    close(): Promise<void> {
      // Same shape as spawnClaude.close + codex-spawn.close. Idempotent;
      // resolves on real exit.
      if (sentTerm) return exitPromise
      sentTerm = true
      closed = true
      // Drain stdio first. EOF on stdin is the documented graceful
      // shutdown signal for ACP JSON-RPC agents — the wrapper sees
      // EOF, flushes, and exits without needing SIGTERM. Draining
      // stdout/stderr also breaks any backpressure that could
      // otherwise block the SIGTERM-to-exit path.
      const c = child as unknown as {
        stdin?: { destroy?: () => void } | null
        stdout?: { destroy?: () => void } | null
        stderr?: { destroy?: () => void } | null
      }
      c.stdin?.destroy?.()
      c.stdout?.destroy?.()
      c.stderr?.destroy?.()
      const alive = child.exitCode === null && child.signalCode === null
      if (alive && child.pid !== undefined) {
        // Same pgroup-SIGTERM + 10 s SIGKILL fallback as spawnClaude.
        // The 10 s window lets the agent finish flushing its in-flight
        // request + write any session transcript before being force-
        // killed. Defaults to single-proc kill on non-POSIX where
        // negative-pid signaling fails — see gracefulKillTree.
        gracefulKillTree(child.pid, child as unknown as Parameters<typeof gracefulKillTree>[1], {
          fallbackAfterMs: 10_000,
        })
      }
      return exitPromise
    },
    [Symbol.asyncDispose](): Promise<void> {
      return this.close()
    },

    async prompt(content: acp.ContentBlock[]): Promise<acp.PromptResponse> {
      const turnId = ("acp-turn-" + Date.now()) as TurnId
      currentTurnId = turnId
      try {
        return await agent.prompt({ sessionId, prompt: content })
      } finally {
        if (currentTurnId === turnId) currentTurnId = null
      }
    },

    async cancel(): Promise<void> {
      await agent.cancel({ sessionId })
    },

    async authenticate(methodId: string): Promise<acp.AuthenticateResponse | void> {
      return agent.authenticate({ methodId })
    },

    async loadSession(
      newSessionId: string,
      loadOpts?: { cwd?: string; mcpServers?: acp.McpServer[] },
    ): Promise<acp.LoadSessionResponse> {
      if (init.agentCapabilities?.loadSession !== true) {
        throw new AcpResumeUnsupportedError(init.agentCapabilities ?? {})
      }
      const resolvedCwd = loadOpts?.cwd ?? opts.sessionCwd ?? cwd
      sessionId = newSessionId as SessionId
      const result = await agent.loadSession({
        sessionId: newSessionId as acp.SessionId,
        cwd: resolvedCwd,
        mcpServers: loadOpts?.mcpServers ?? opts.mcpServers ?? [],
      })
      // Surface a legacy session-init for any consumers that materialize state
      // from it. The replayed SessionUpdate notifications fired by the agent
      // during load will continue to arrive on the existing notification path.
      emit({
        kind: "session-init",
        sessionId,
        cwd: resolvedCwd,
        model: opts.model ?? "",
        mode: "",
        tools: [],
        mcp_servers: (loadOpts?.mcpServers ?? opts.mcpServers ?? []).map((s) => s.name),
        slashCommands: [],
        skills: [],
        plugins: [],
        claudeCodeVersion: "",
        apiKeySource: "",
        ts: Date.now(),
      })
      return result
    },
  }

  return handle
}

// ---------------------------------------------------------------------------
// SessionUpdate → legacy AgentEvent mapping
//
// This is intentionally a thin, lossy bridge. Once `acp-foundation`'s
// SessionUpdate becomes the canonical UI surface (bead
// `km-silvercode.acp-session`), the typed component layer subscribes
// directly to those updates and this mapper retires.
// ---------------------------------------------------------------------------

function mapSessionUpdateToLegacyEvents(
  params: acp.SessionNotification,
  fallbackSessionId: SessionId,
  turnId: TurnId,
): AgentEvent[] {
  // Run the canonical adapter so we exercise the boundary code path. The
  // resulting silvercode-shaped update is what richer consumers will use
  // once acp-session ships; we still emit the legacy event for now.
  let scUpdate
  try {
    scUpdate = acpToSilvercode(params.update)
  } catch {
    // Unknown variant — surface as raw status so nothing is silently dropped.
    return [
      {
        kind: "status",
        sessionId: fallbackSessionId,
        status: `acp:${params.update.sessionUpdate}`,
        ts: Date.now(),
      },
    ]
  }

  const sessionId = (params.sessionId as SessionId) ?? fallbackSessionId
  const ts = Date.now()
  const events: AgentEvent[] = []

  switch (scUpdate.sessionUpdate) {
    case "user_message_chunk":
    case "agent_message_chunk": {
      const block = contentBlockToLegacy(scUpdate.content)
      if (block.type === "text") {
        events.push({
          kind: "text-delta",
          sessionId,
          turnId,
          blockIndex: 0,
          text: block.text,
          ts,
        })
      } else {
        events.push({
          kind: "status",
          sessionId,
          status: `acp:${scUpdate.sessionUpdate}:${block.type}`,
          ts,
        })
      }
      return events
    }

    case "agent_thought_chunk": {
      const block = contentBlockToLegacy(scUpdate.content)
      if (block.type === "text") {
        events.push({
          kind: "thinking-delta",
          sessionId,
          turnId,
          blockIndex: 0,
          text: block.text,
          ts,
        })
      }
      return events
    }

    case "tool_call": {
      events.push({
        kind: "tool-use",
        sessionId,
        turnId,
        id: String(scUpdate.toolCallId) as ToolUseId,
        name: scUpdate.title,
        input: scUpdate.rawInput,
        ts,
      })
      return events
    }

    case "tool_call_update": {
      // status transitions surface as legacy status events; final outputs
      // surface as tool-result.
      if (scUpdate.status === "completed" || scUpdate.status === "failed") {
        events.push({
          kind: "tool-result",
          sessionId,
          id: String(scUpdate.toolCallId) as ToolUseId,
          output: scUpdate.rawOutput,
          is_error: scUpdate.status === "failed",
          ts,
        })
      } else if (scUpdate.status) {
        events.push({
          kind: "status",
          sessionId,
          status: `tool:${scUpdate.toolCallId}:${scUpdate.status}`,
          ts,
        })
      }
      return events
    }

    case "plan":
    case "available_commands_update":
    case "current_mode_update":
    case "config_option_update":
    case "session_info_update":
    case "usage_update": {
      // Legacy events have no rich slot for these; surface as status so the
      // UI knows something happened. Once acp-session lands, components
      // subscribe to the canonical SessionUpdate surface for these directly.
      events.push({
        kind: "status",
        sessionId,
        status: `acp:${scUpdate.sessionUpdate}`,
        ts,
      })
      return events
    }
  }

  // Unreachable — TS narrows scUpdate to never. Safety net for SDK churn.
  events.push({
    kind: "status",
    sessionId,
    status: `acp:unknown`,
    ts,
  })
  return events
}

function contentBlockToLegacy(block: import("./acp-types.ts").ContentBlock): LegacyContentBlock {
  if (block.type === "text") {
    return { type: "text", text: block.text }
  }
  if (block.type === "image") {
    return { type: "image", mediaType: block.mimeType ?? "" }
  }
  // audio / resource_link / resource have no direct legacy slot. Surface as
  // empty text so the caller can decide to emit a status event instead.
  return { type: "text", text: "" }
}
