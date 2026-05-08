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
import { acpRequestPermissionToSilvercode, acpToSilvercode } from "./acp-boundary.ts"
import type { AgentEvent, AgentSession, PermissionRequestId, SessionId, ToolUseId, TurnId } from "./events.ts"

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

export type AcpReasoningEffort = "low" | "medium" | "high" | "xhigh"
export type AcpSessionConfigValue = string | boolean
export type AcpSessionConfigDefaults = Readonly<Record<string, AcpSessionConfigValue>>

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
  /** Initial ACP session config values, applied when the agent advertises matching options. */
  sessionConfig?: AcpSessionConfigDefaults
  /** Initial Codex reasoning effort, applied through ACP session config when supported. */
  reasoningEffort?: AcpReasoningEffort
  /** Spawn implementation for this connection. Tests and fake providers inject here. */
  spawn?: AcpSpawn
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

export type AcpSetSessionConfigOptionParams =
  | { configId: acp.SessionConfigId; type: "boolean"; value: boolean; _meta?: Record<string, unknown> | null }
  | { configId: acp.SessionConfigId; value: acp.SessionConfigValueId; _meta?: Record<string, unknown> | null }

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
  /** Latest session config options advertised by the agent. */
  readonly configOptions: acp.SessionConfigOption[]
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
   * Set an ACP session config option on the active session. The response
   * carries the full option set because agents may change related options
   * after one value changes.
   */
  setSessionConfigOption(params: AcpSetSessionConfigOptionParams): Promise<acp.SetSessionConfigOptionResponse>
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

export const ACP_REGISTRY_IDS = ["codex", "gemini", "github-copilot-cli", "pi-acp", "claude", "claude-code"] as const

export type AcpRegistryId = (typeof ACP_REGISTRY_IDS)[number]

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
  claude: {
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
  "claude-code": {
    command: "bun",
    args: [fileURLToPath(new URL("../../claude-acp/bin/silvercode-claude-acp.js", import.meta.url))],
    description:
      "Claude Code via silvercode's standalone ACP wrapper — subscription-compatible (legacy alias for claude).",
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
  once(event: "exit", listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown
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

  const spawn = opts.spawn ?? activeSpawn
  const child = spawn(opts.command, args, { cwd, env })
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
      if (child.pid !== undefined) {
        gracefulKillTree(child.pid, child as unknown as Parameters<typeof gracefulKillTree>[1], {
          fallbackAfterMs: 250,
        })
        return
      }
      try {
        child.kill("SIGTERM")
      } catch {
        // already gone
      }
    }),
  )

  let resolveExit: (() => void) | null = null
  const exitPromise = new Promise<void>((resolve) => {
    resolveExit = resolve
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
  let configOptions: acp.SessionConfigOption[] = []
  let closed = false
  let sentTerm = false
  // Active prompt turn id — shared across every SessionUpdate notification
  // that lands between `prompt()` start and resolve. Without this, each
  // notification minted a fresh `acp-turn-${Date.now()}` and the legacy
  // session-store keyed each `text-delta` to a new MessageEntry → every
  // streamed chunk rendered as its own `●` row. Set in `send()`/`prompt()`,
  // cleared after `turn-end` emits.
  let currentTurnId: TurnId | null = null
  let lastMessageTurnId: TurnId | null = null
  let lastActivityTs = 0
  let cancelWatchdog: (() => void) | null = null
  function turnIdForUpdate(): TurnId {
    // During a turn (prompt() in flight): use the active turnId. Between
    // turns: glue late stragglers onto the most recent turn instead of
    // minting a fresh `acp-turn-${Date.now()}` per update — without this,
    // each late notification spawns its own MessageEntry and the chat
    // scrollback chunks one logical turn into multiple message cards.
    // The fallback is ONLY hit between turns (i.e. after `prompt()` has
    // resolved and emitted `turn-end`); during a live turn, `currentTurnId`
    // always wins.
    // Bead: km-silvercode.claude-acp-wire-bugs.
    return currentTurnId ?? lastMessageTurnId ?? (("acp-turn-" + Date.now()) as TurnId)
  }
  function turnIdForPromptEnd(fallback: TurnId): TurnId {
    return lastMessageTurnId ?? fallback
  }

  function emit(event: AgentEvent): void {
    // `handoff` lacks `sessionId` — narrow before logging.
    const sid = "sessionId" in event ? event.sessionId : "<handoff>"
    dEvent("emit kind=%s session=%s", event.kind, sid)
    lastActivityTs = Date.now()
    bus.emit("event", event)
  }

  // ─── Turn lifecycle helper ──────────────────────────────────────────────
  //
  // Why this exists:
  // ACP has no wire-level turn boundary — `prompt(...)` returns a promise,
  // and its settlement (resolve OR reject) IS the turn end. Three separate
  // bugs have shipped in this area (km-silvercode.thinking-loop-after-bash,
  // km-silvercode.claude-acp-wire-bugs) because each call site re-invents
  // the same try/finally + emit-turn-end pattern and forgets one corner.
  //
  // This helper centralizes the pattern so it can't be forgotten:
  //   - Self-heal: if a prior turn never emitted turn-end (bug elsewhere),
  //     fire it now so the new turn starts from a clean status=idle.
  //   - try/catch/finally with turn-end on both success AND failure paths.
  //   - Watchdog: if no events arrive for ACTIVITY_WATCHDOG_MS during the
  //     turn, force-emit turn-end + an error so the UI un-sticks.
  //
  // Bead: km-silvercode.claude-acp-wire-bugs
  const ACTIVITY_WATCHDOG_MS = 300_000 // 5 min — generous; only catches truly stuck wires
  function selfHealStuckTurn(reason: string): void {
    if (currentTurnId === null) return
    const stale = currentTurnId
    emit({
      kind: "turn-end",
      sessionId,
      turnId: turnIdForPromptEnd(stale),
      stopReason: "end_turn",
      ts: Date.now(),
    })
    dWire("self-healed stuck turn: reason=%s stale=%s", reason, stale)
    currentTurnId = null
    lastMessageTurnId = null
  }
  function clearWatchdog(): void {
    cancelWatchdog?.()
    cancelWatchdog = null
  }
  function armWatchdog(turnId: TurnId): void {
    clearWatchdog()
    cancelWatchdog = scope.timeout(() => {
      // Only fire if THIS turn is still the active one. A turn that
      // resolved cleanly already cleared currentTurnId.
      if (currentTurnId === turnId) {
        const idle = Date.now() - lastActivityTs
        if (idle >= ACTIVITY_WATCHDOG_MS - 1000) {
          selfHealStuckTurn(`watchdog: ${Math.round(idle / 1000)}s of inactivity`)
        }
      }
    }, ACTIVITY_WATCHDOG_MS)
  }
  async function withTurnLifecycle<T>(
    promptFn: (turnId: TurnId) => Promise<T>,
    extractStopReason: (result: T) => acp.StopReason | undefined,
  ): Promise<T> {
    // Self-heal any stale prior turn — user-initiated activity is the
    // recovery signal we trust most.
    if (currentTurnId !== null) selfHealStuckTurn("new prompt while prior turn unsettled")
    const turnId = ("acp-turn-" + Date.now()) as TurnId
    currentTurnId = turnId
    lastMessageTurnId = null
    lastActivityTs = Date.now()
    emit({
      kind: "turn-start",
      sessionId,
      turnId,
      role: "assistant",
      ts: Date.now(),
    })
    armWatchdog(turnId)
    let stopReason: acp.StopReason = "end_turn"
    try {
      const result = await promptFn(turnId)
      stopReason = extractStopReason(result) ?? "end_turn"
      return result
    } catch (err) {
      stopReason = "refusal"
      emit({
        kind: "error",
        sessionId,
        message: `acp prompt failed: ${(err as Error).message}`,
        ts: Date.now(),
      })
      throw err
    } finally {
      // Emit turn-end whether the prompt succeeded or failed — without
      // this, status stays in "thinking" on rejected prompts (the
      // original bug from 2026-04-25 that keeps recurring).
      if (currentTurnId === turnId) {
        const endTurnId = turnIdForPromptEnd(turnId)
        emit({
          kind: "turn-end",
          sessionId,
          turnId: endTurnId,
          stopReason,
          ts: Date.now(),
        })
        // Clear the active marker but capture lastMessageTurnId so any late
        // sessionUpdate stragglers between this turn and the next prompt
        // glue onto the right MessageEntry. lastMessageTurnId is reset at
        // the START of the next turn (see the prelude above) — so this
        // doesn't leak across turns. We have to set it explicitly here
        // because the sessionUpdate bridge only assigns lastMessageTurnId
        // on a turnId-mismatch path; a clean turn whose updates all rode
        // currentTurnId would otherwise leave lastMessageTurnId null.
        lastMessageTurnId = endTurnId
        currentTurnId = null
      }
      clearWatchdog()
    }
  }

  async function setConfigOptionValue(configId: string, value: AcpSessionConfigValue): Promise<void> {
    const option = configOptions.find((item) => item.id === configId)
    if (!option) {
      dSpawn("session config requested id=%s value=%o but agent did not advertise the option", configId, value)
      return
    }
    if (option.type === "boolean" && typeof value !== "boolean") {
      throw new Error(`ACP ${configId} config option expects boolean value`)
    }
    if (option.type !== "boolean" && typeof value !== "string") {
      throw new Error(`ACP ${configId} config option expects select value`)
    }
    if (option.currentValue === value) return

    dSpawn("setSessionConfigOption id=%s value=%o sessionId=%s", configId, value, sessionId)
    const result = await agent.setSessionConfigOption({
      sessionId,
      configId: configId as acp.SessionConfigId,
      ...(typeof value === "boolean"
        ? { type: "boolean" as const, value }
        : { value: value as acp.SessionConfigValueId }),
    } as acp.SetSessionConfigOptionRequest)
    configOptions = result.configOptions
  }

  async function applyInitialConfigOptions(): Promise<void> {
    const requested: Record<string, AcpSessionConfigValue> = { ...opts.sessionConfig }
    if (opts.reasoningEffort && requested.reasoning_effort === undefined) {
      requested.reasoning_effort = opts.reasoningEffort
    }
    for (const [configId, value] of Object.entries(requested)) {
      await setConfigOptionValue(configId, value)
    }
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
  const readable = Readable.toWeb(filteredReadable) as unknown as ReadableStream<Uint8Array>
  const stream = acp.ndJsonStream(writable, readable)

  // Build the Client callback bridge.
  const client: acp.Client = {
    // eslint-disable-next-line @typescript-eslint/require-await
    async sessionUpdate(params: acp.SessionNotification): Promise<void> {
      dWire("sessionUpdate %s", params.update.sessionUpdate)
      if (params.update.sessionUpdate === "config_option_update") {
        configOptions = params.update.configOptions
      }
      try {
        const mapped = mapSessionUpdateToLegacyEvents(params, sessionId, turnIdForUpdate(), {
          inPromptTurn: currentTurnId !== null,
        })
        for (const ev of mapped) {
          if (
            currentTurnId !== null &&
            (ev.kind === "text-delta" || ev.kind === "tool-use") &&
            ev.turnId !== currentTurnId
          ) {
            lastMessageTurnId = ev.turnId
          }
        }
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
      const scReq = acpRequestPermissionToSilvercode(req)
      const requestId = String(scReq.toolCall.toolCallId) as PermissionRequestId
      const emitDecision = (response: acp.RequestPermissionResponse): void => {
        emit({
          kind: "permission-decision",
          sessionId,
          requestId,
          approved: response.outcome.outcome === "selected",
          ts: Date.now(),
        })
      }
      // Surface a legacy permission-request event so existing UI sees it.
      emit({
        kind: "permission-request",
        sessionId,
        requestId,
        tool: scReq.toolCall.title ?? "",
        args: scReq.toolCall.rawInput,
        options: scReq.options,
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
        const cancelled = { outcome: { outcome: "cancelled" } } satisfies acp.RequestPermissionResponse
        emitDecision(cancelled)
        return cancelled
      }
      let handled: acp.RequestPermissionResponse | null
      try {
        handled = await opts.permissionHandler(req)
      } catch (err) {
        const cancelled = { outcome: { outcome: "cancelled" } } satisfies acp.RequestPermissionResponse
        emitDecision(cancelled)
        emit({
          kind: "error",
          sessionId,
          message: `acp permissionHandler failed: ${(err as Error).message}`,
          ts: Date.now(),
        })
        throw err
      }
      if (!handled) {
        const cancelled = { outcome: { outcome: "cancelled" } } satisfies acp.RequestPermissionResponse
        emitDecision(cancelled)
        return cancelled
      }
      emitDecision(handled)
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
    if (closed) return undefined
    closed = true
    emit({ kind: "session-lifecycle", sessionId, state: "ended", ts: Date.now() })
    emit({ kind: "session-end", sessionId, ts: Date.now() })
    return undefined
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
      const loadSessionResult = await agent.loadSession({
        sessionId: opts.resume.sessionId as acp.SessionId,
        cwd: sessionCwd,
        mcpServers: opts.mcpServers ?? [],
      })
      configOptions = loadSessionResult.configOptions ?? []
      await applyInitialConfigOptions()
      dSpawn("loadSession ok sessionId=%s", sessionId)
    } else {
      const newSessionResult = await agent.newSession({
        cwd: sessionCwd,
        mcpServers: opts.mcpServers ?? [],
      })
      sessionId = newSessionResult.sessionId as SessionId
      configOptions = newSessionResult.configOptions ?? []
      await applyInitialConfigOptions()
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
    get configOptions(): acp.SessionConfigOption[] {
      return configOptions
    },
    protocolVersion: init.protocolVersion,

    send(text: string): void {
      // Fire-and-forget wrapper around the typed prompt() path so this stays
      // synchronous like the legacy AgentSession contract. All lifecycle
      // bookkeeping happens inside withTurnLifecycle — the caller can't
      // forget to fire turn-end because there's only one place to put it.
      void withTurnLifecycle(
        () =>
          agent.prompt({
            sessionId,
            prompt: [{ type: "text", text }],
          }),
        (response) => response.stopReason,
      ).catch(() => {
        /* errors surface as `error` AgentEvents inside the helper */
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
      // Clear the watchdog so it doesn't fire after teardown and try to
      // emit on a closed bus, and so the timer doesn't pin the event loop.
      clearWatchdog()
      // Self-heal a turn that was in flight when the user quit so any
      // listener still draining sees a clean status=idle final event.
      if (currentTurnId !== null) selfHealStuckTurn("session closed mid-turn")
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
      // Single source of truth for turn lifecycle — see withTurnLifecycle
      // header for why this can't live at the call sites.
      return withTurnLifecycle(
        () => agent.prompt({ sessionId, prompt: content }),
        (response) => response.stopReason,
      )
    },

    async cancel(): Promise<void> {
      await agent.cancel({ sessionId })
    },

    async authenticate(methodId: string): Promise<acp.AuthenticateResponse | void> {
      return agent.authenticate({ methodId })
    },

    async setSessionConfigOption(params: AcpSetSessionConfigOptionParams): Promise<acp.SetSessionConfigOptionResponse> {
      const result = await agent.setSessionConfigOption({
        ...params,
        sessionId,
      } as acp.SetSessionConfigOptionRequest)
      configOptions = result.configOptions
      return result
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
      configOptions = result.configOptions ?? []
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
  options: { readonly inPromptTurn?: boolean } = {},
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
  const messageTurnId =
    "messageId" in scUpdate && typeof scUpdate.messageId === "string" && scUpdate.messageId.length > 0
      ? (`acp-message:${scUpdate.messageId}` as TurnId)
      : turnId

  switch (scUpdate.sessionUpdate) {
    case "user_message_chunk": {
      if (options.inPromptTurn) return events
      if (scUpdate.content.type === "text") {
        events.push({
          kind: "user-message",
          sessionId,
          turnId: messageTurnId,
          text: scUpdate.content.text,
          ts,
        })
      } else {
        events.push({
          kind: "status",
          sessionId,
          status: `acp:${scUpdate.sessionUpdate}:${scUpdate.content.type}`,
          ts,
        })
      }
      return events
    }
    case "agent_message_chunk": {
      if (scUpdate.content.type === "text") {
        events.push({
          kind: "text-delta",
          sessionId,
          turnId: messageTurnId,
          blockIndex: 0,
          text: scUpdate.content.text,
          ts,
        })
      } else {
        events.push({
          kind: "status",
          sessionId,
          status: `acp:${scUpdate.sessionUpdate}:${scUpdate.content.type}`,
          ts,
        })
      }
      return events
    }

    case "agent_thought_chunk": {
      if (scUpdate.content.type === "text") {
        events.push({
          kind: "thinking-delta",
          sessionId,
          turnId: messageTurnId,
          blockIndex: 0,
          text: scUpdate.content.text,
          ts,
        })
      } else {
        events.push({
          kind: "status",
          sessionId,
          status: `acp:${scUpdate.sessionUpdate}:${scUpdate.content.type}`,
          ts,
        })
      }
      return events
    }

    case "tool_call": {
      events.push({
        kind: "tool-use",
        sessionId,
        turnId: messageTurnId,
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
          output: toolCallOutput(scUpdate),
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

    case "available_commands_update": {
      // Mirror what session-init's `slash_commands` does for the stream-json
      // transport: surface the full list of names so SessionState.slash
      // Commands populates and AvailableCommandsPalette can show vault-local
      // + plugin commands. ACP's AvailableCommand carries `description` too,
      // but the legacy path is name-only — `mergeRemoteCommands` synthesizes
      // a generic description. When the canonical ACP-shaped UI lands, it
      // can subscribe to the typed SessionUpdate directly and use the rich
      // shape. Bead: km-silvercode.slash-command-vault-discovery.
      events.push({
        kind: "slash-commands-update",
        sessionId,
        slashCommands: scUpdate.availableCommands.map((c) => c.name),
        ts,
      })
      return events
    }

    case "plan":
      events.push({
        kind: "plan-update",
        sessionId,
        source: "acp-plan",
        entries: scUpdate.entries.map((entry, i) => ({
          id: `acp-plan:${i}:${entry.content}`,
          content: entry.content,
          status: entry.status,
          priority: entry.priority,
        })),
        ts,
      })
      return events

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

function toolCallOutput(
  update: Extract<import("./acp-types.ts").SessionUpdate, { sessionUpdate: "tool_call_update" }>,
): unknown {
  if (update.rawOutput !== undefined) return update.rawOutput
  const text = update.content
    ?.flatMap((item) => (item.type === "content" && item.content.type === "text" ? [item.content.text] : []))
    .join("")
  return text && text.length > 0 ? text : ""
}
