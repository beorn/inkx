/**
 * Controller — owns N sessions, routes events into per-session stores, and
 * wires subscriptions back out to React.
 *
 * Keeps the UI declarative: React components never call spawn directly, they
 * call controller methods. The controller is the bridge between the silvery
 * render tree and the headless agent-harness.
 */

import { resolve as resolvePath } from "node:path"
import createDebug from "debug"
import {
  type AgentEvent,
  type AgentSession,
  type EventLog,
  type Injector,
  type McpServerSpec,
  type PermissionRequestId,
  type SessionStore,
  channelDigestInjector,
  createFileEventLog,
  createSessionStore,
  cwdInjector,
  spawnClaude,
  spawnCodex,
  spawnSdk,
  activeBeadInjector,
} from "@km/agent-harness"
import { createInMemoryTribe, type TribeBackend } from "@km/tribe-mcp"
import { resolveAccountDir } from "./accounts.ts"
import { bdPrimeOutput, readActiveBead } from "./bd-prime.ts"
import { replaySessionFromDisk } from "./resume.ts"

// Queue diagnostics — enable with `DEBUG=silvercode:queue` (combined with
// `DEBUG_LOG=<path>` when running the TUI so the alt-screen UI isn't
// polluted). Traces every send/setQueuedText/tryFlush and the decision the
// controller made. Loaded when investigating "queue items stay there"
// reports — auto-flush should fire on `turn-end`.
const dQueue = createDebug("silvercode:queue")

/**
 * Resolve stdio MCP server specs for a spawned session. Each session gets:
 *   - km-mcp-server (km_search / km_get_node / km_get_board / km_render_path)
 *   - km-tribe-mcp (tribe_send / tribe_history / tribe_members / tribe_broadcast)
 *
 * Both run via `bun run` against the workspace package src so they resolve
 * workspace deps the same way the host does. TRIBE_SESSION_NAME keys the
 * tribe backend to this session's identity.
 */
function defaultMcpServers(sessionName: string, workspaceRoot: string, kmDbPath: string | null): McpServerSpec[] {
  const tribeBin = resolvePath(workspaceRoot, "apps/silvercode/packages/tribe-mcp/src/bin.ts")
  const specs: McpServerSpec[] = [
    {
      name: "tribe",
      command: "bun",
      args: ["run", tribeBin],
      env: { TRIBE_SESSION_NAME: sessionName },
    },
  ]
  // Declare km MCP ONLY when the bin can start (db exists). claude is
  // launched with --strict-mcp-config so any declared server that fails
  // to init blocks the session. The bin itself throws on missing db per
  // principles.md (fail fast, fail loud); the controller's job is to
  // decide not to declare it in the first place. Absence of km tools
  // surfaces in the session-init event (mcp_servers list) and in the
  // UI's meta block, which is honest about what's mounted.
  if (kmDbPath) {
    const kmBin = resolvePath(workspaceRoot, "apps/silvercode/packages/km-mcp-server/src/bin.ts")
    specs.push({
      name: "km",
      command: "bun",
      args: ["run", kmBin],
      env: { KM_DB_PATH: kmDbPath },
    })
  }
  return specs
}

/** Locate .km/state.db for the km MCP. Returns null if not found. */
function findKmDb(cwd: string): string | null {
  const envPath = process.env.KM_DB_PATH
  if (envPath && envPath.length > 0) return resolvePath(envPath)
  const candidate = resolvePath(cwd, ".km", "state.db")
  try {
    const fs = require("node:fs") as { existsSync(p: string): boolean }
    if (fs.existsSync(candidate)) return candidate
  } catch {
    /* require failure is a hard error handled by Node — won't reach here */
  }
  return null
}

type Track = "claude" | "sdk" | "codex"

export type SessionHandle = {
  readonly id: string
  readonly name: string
  readonly store: SessionStore
  readonly session: AgentSession
  readonly unsubscribe: () => void
  readonly log?: EventLog
  /** Anthropic account bound to this session (multi-account). */
  readonly account?: string
}

export type ControllerOptions = {
  cwd: string
  model?: string
  resume?: string
  /**
   * When true, spawn Claude with `--bare` for deterministic subprocess
   * behavior (disables hooks/plugins/skills/CLAUDE.md). Default (false) runs
   * the full Claude Code setup so sessions mirror what a real user sees.
   * Propagated verbatim through SpawnSessionOptions → spawnClaude.
   */
  bare: boolean
  track: Track
  logDir?: string
  initialSessions: number
  /**
   * Anthropic account name for per-session credential isolation (v1.1
   * multi-account). Resolves to `~/.silvercode/accounts/<account>/` which the
   * harness exposes via `CLAUDE_CONFIG_DIR`. Undefined → use the user's main
   * `~/.claude/` (current behavior, unchanged).
   */
  account?: string
  /** Hook for tests to swap spawn behavior. */
  spawnFactory?: (opts: SpawnSessionOptions) => AgentSession | Promise<AgentSession>
  /**
   * Provide the active-bead injector data at each turn. Default returns empty
   * (no injection). M3 wires this to bd show output.
   */
  getActiveBead?: () => { beadId?: string; title?: string; worktree?: string }
  /**
   * Drain pending channel messages for a session (M4 wiring). Default returns
   * empty; silvercode consumers can pass the tribe-mcp drain here.
   */
  drainChannel?: (sessionId: string) => Array<{ from: string; text: string }>
  /** Tribe backend for M4 channel integration. Defaults to in-memory. */
  tribe?: TribeBackend
  /**
   * MCP servers to mount for every spawned session. Defaults to km + tribe
   * stdio bins shipped with silvercode. Pass [] to disable MCP mounting.
   */
  mcpServers?: McpServerSpec[]
  /**
   * Root of the workspace (used to resolve bundled MCP bin paths). Defaults
   * to process.cwd().
   */
  workspaceRoot?: string
}

export type SpawnSessionOptions = {
  id: string
  name: string
  track: Track
  cwd: string
  model?: string
  resume?: string
  bare: boolean
  /** Anthropic account name — pass-through from ControllerOptions.account. */
  account?: string
}

export type Controller = {
  snapshot(): SessionHandle[]
  focusedId(): string
  focus(id: string): void
  subscribe(handler: (sessions: SessionHandle[]) => void): () => void
  onFocusChange(handler: (id: string) => void): () => void
  /**
   * Send a user message. If the session is currently NOT idle (Claude is
   * thinking / running a tool / waiting for permission), the text is
   * appended to a queue buffer and the whole buffer is submitted as ONE
   * user message when Claude returns to idle — matches Claude Code's
   * batching behaviour.
   */
  send(sessionId: string, text: string): void
  /** Current queue buffer for a session. Empty string when none. */
  queuedText(sessionId: string): string
  /** Replace the whole queue buffer — used by the on-screen queue editor. */
  setQueuedText(sessionId: string, text: string): void
  /** Subscribe to queue-text changes (payload: the new buffer). */
  onQueueChange(handler: (sessionId: string, text: string) => void): () => void
  /** Drop the queue (Esc-to-cancel on empty input). */
  clearQueue(sessionId: string): void
  /**
   * Force-flush the queue buffer NOW, regardless of idle status. Used by
   * the queue editor when the user explicitly submits (Enter in the queue
   * region). Bypasses the `status === "idle"` gate that the ambient
   * auto-flush path uses, because the user's explicit submit is its own
   * signal — Claude Code's CLI buffers stdin if Claude is mid-turn, so
   * sending a queued user message during a turn is safe and lands as the
   * next turn's input. No-op if the queue is empty.
   */
  flushQueue(sessionId: string): void
  respondPermission(sessionId: string, requestId: string, approved: boolean): void
  runSlashCommand(sessionId: string, text: string): void
  spawnSession(name?: string): Promise<SessionHandle>
  /** Move task+context from source → destination session. */
  handoff(fromId: string, toId: string, prompt: string): void
  /** Fork a session — spawn a new one pre-seeded with the source's context. */
  fork(fromId: string): Promise<SessionHandle>
  /**
   * Send SIGTERM to every session's child and unsubscribe. Synchronous —
   * the children shut down gracefully (flushing their pending output +
   * tearing down their own MCP subprocesses) in the background; we return
   * immediately. Listen on session.subscribe('session-end') to wait.
   */
  closeAll(): void
}

let nextId = 1

export function createSilvercodeController(opts: ControllerOptions): Controller {
  const sessions: SessionHandle[] = []
  let focusedId = ""
  const sessionSubs = new Set<(s: SessionHandle[]) => void>()
  const focusSubs = new Set<(id: string) => void>()

  function notifySessions(): void {
    for (const fn of sessionSubs) fn(sessions)
  }

  // Per-session message queue — single string buffer so the on-screen
  // queue editor can bind a TextArea to it directly. While Claude is
  // mid-turn (status != idle), new user messages are appended (separated
  // by "\n\n"). On idle, the whole buffer is flushed as ONE user message
  // — matches Claude Code's batching behaviour.
  //
  // Option B model: the queue TextArea is ALWAYS live (no editor mode,
  // no "hold" state). Auto-flush waits for `turn-end`; explicit submit
  // (Enter in queue region) calls `flushQueue` to bypass the idle gate.
  const queues = new Map<string, string>()
  const queueSubs = new Set<(sessionId: string, text: string) => void>()
  function notifyQueue(sessionId: string): void {
    const t = queues.get(sessionId) ?? ""
    for (const fn of queueSubs) fn(sessionId, t)
  }
  /**
   * Flush the queue buffer to Claude as one user turn, then clear.
   *
   * Two callers, two semantics:
   *  - Auto-flush (`force=false`): no-op unless session is idle. Used by
   *    the turn-end subscriber.
   *  - Force-flush (`force=true`): bypasses the idle gate. Used by the
   *    queue editor's explicit submit (Enter in queue region). Claude
   *    Code's CLI buffers stdin while mid-turn, so sending a user-message
   *    during a turn is safe — it lands as the next turn's input.
   *
   * Always no-op if the queue is empty.
   */
  function tryFlush(sessionId: string, force = false): void {
    const s = sessions.find((h) => h.id === sessionId)
    if (!s) {
      dQueue("tryFlush %s force=%s — no handle", sessionId, force)
      return
    }
    if (!force) {
      const status = s.store.state.get().status
      if (status !== "idle") {
        dQueue("tryFlush %s — status=%s, skip", sessionId, status)
        return
      }
    }
    const text = queues.get(sessionId) ?? ""
    if (text.length === 0) {
      dQueue("tryFlush %s force=%s — queue empty, skip", sessionId, force)
      return
    }
    dQueue("tryFlush %s force=%s — FLUSHING %d chars", sessionId, force, text.length)
    queues.set(sessionId, "")
    notifyQueue(sessionId)
    const turnId = `u-${Date.now()}` as never
    s.store.apply({
      kind: "user-message",
      sessionId: s.session.sessionId,
      turnId,
      text,
      ts: Date.now(),
    })
    s.session.send(text)
  }
  function notifyFocus(): void {
    for (const fn of focusSubs) fn(focusedId)
  }

  // Default tribe backend — each controller has its own in-memory tribe so
  // sibling sessions can talk to each other. Real multi-workspace setups wire
  // to the bearly tribe daemon via SpawnSessionOptions.
  const tribe = opts.tribe ?? createInMemoryTribe()

  function makeInjectors(sessionName: string): Injector[] {
    const list: Injector[] = []
    list.push(cwdInjector())
    // Active bead injector — wraps bd data + the bd prime output so sessions
    // running under --bare still see the SessionStart context users depend on.
    list.push(
      activeBeadInjector(() => {
        const override = opts.getActiveBead?.() ?? {}
        if (override.beadId) return override
        return readActiveBead(opts.cwd)
      }),
    )
    const primeOutput = bdPrimeOutput(opts.cwd)
    if (primeOutput.length > 0) {
      list.push({
        name: "bd-prime",
        run() {
          return primeOutput
        },
      })
    }
    // Channel-digest injector: surface tribe messages addressed to this
    // session as [channel from peer] reminders on the next turn.
    list.push(
      channelDigestInjector((sid) => {
        if (opts.drainChannel) return opts.drainChannel(sid)
        const maybe = (tribe as TribeBackend & { drain?: (n: string) => Array<{ from: string; text: string }> }).drain
        if (maybe) return maybe(sessionName)
        return []
      }),
    )
    return list
  }

  // Root of the silvercode host process (the km workspace). MCP servers are
  // resolved relative to this so `bun run <path>` inside the subprocess finds
  // the bin.ts files regardless of the session's own cwd.
  const workspaceRoot = opts.workspaceRoot ?? process.cwd()

  async function defaultSpawn(s: SpawnSessionOptions): Promise<AgentSession> {
    const injectors = makeInjectors(s.name)
    const mcpServers = opts.mcpServers ?? defaultMcpServers(s.name, workspaceRoot, findKmDb(s.cwd))
    if (s.track === "codex") {
      return spawnCodex({ cwd: s.cwd, injectors })
    }
    if (s.track === "sdk") {
      return spawnSdk({ cwd: s.cwd, model: s.model, injectors })
    }
    // Multi-account: when an account is bound, the harness spawns claude
    // with CLAUDE_CONFIG_DIR pointing at ~/.silvercode/accounts/<name>/.
    // Undefined account → claude uses the user's main ~/.claude/ (unchanged).
    const configDir = s.account ? resolveAccountDir(s.account) : undefined
    return spawnClaude({
      cwd: s.cwd,
      model: s.model,
      resume: s.resume,
      bare: s.bare,
      injectors,
      mcpServers,
      configDir,
    })
  }

  const factory = opts.spawnFactory ?? defaultSpawn

  async function spawnSession(name?: string): Promise<SessionHandle> {
    const id = `s${nextId}`
    const givenName = name ?? `session ${nextId}`
    nextId++
    const store = createSessionStore()

    // --resume backfill: replay the on-disk JSONL transcript into the store
    // BEFORE spawning so the card shows prior turns immediately. Claude Code
    // will then --resume from server-side state, and new events stream in on
    // top of the replayed history.
    if (opts.resume) {
      replaySessionFromDisk(store, opts.cwd, opts.resume)
    }

    const session = await Promise.resolve(
      factory({
        id,
        name: givenName,
        track: opts.track,
        cwd: opts.cwd,
        model: opts.model,
        resume: opts.resume,
        bare: opts.bare,
        account: opts.account,
      }),
    )

    let log: EventLog | undefined
    if (opts.logDir) log = createFileEventLog(opts.logDir)

    const unsub = session.subscribe((event: AgentEvent) => {
      store.apply(event)
      if (log) log.append(event)
      // Flush on every turn boundary — the whole queue goes as ONE turn.
      if (event.kind === "turn-end" || event.kind === "session-lifecycle") {
        dQueue("subscribe %s — event=%s, calling tryFlush", id, event.kind)
        tryFlush(id)
      }
    })

    const handle: SessionHandle = {
      id,
      name: givenName,
      store,
      session,
      unsubscribe: unsub,
      log,
      account: opts.account,
    }

    // Welcome UI — rendered as a React component (see Welcome.tsx) when the
    // message list is empty. That lets it read claudeCodeVersion / model /
    // apiKeySource live from the store after session-init arrives, instead
    // of baking a synthesized turn at spawn time (when those fields aren't
    // yet known).

    sessions.push(handle)
    if (!focusedId) {
      focusedId = id
      notifyFocus()
    }
    notifySessions()
    return handle
  }

  // Eagerly spawn the requested number of initial sessions.
  for (let i = 0; i < opts.initialSessions; i++) {
    void spawnSession().catch(() => {
      /* spawn errors surface via the session's error events */
    })
  }

  return {
    snapshot(): SessionHandle[] {
      return sessions.slice()
    },
    focusedId(): string {
      return focusedId
    },
    focus(id: string): void {
      if (id === focusedId) return
      if (!sessions.some((s) => s.id === id)) return
      focusedId = id
      notifyFocus()
    },
    subscribe(handler: (s: SessionHandle[]) => void): () => void {
      sessionSubs.add(handler)
      handler(sessions.slice())
      return () => sessionSubs.delete(handler)
    },
    onFocusChange(handler: (id: string) => void): () => void {
      focusSubs.add(handler)
      handler(focusedId)
      return () => focusSubs.delete(handler)
    },
    send(sessionId: string, text: string): void {
      const s = sessions.find((h) => h.id === sessionId)
      if (!s) return
      const status = s.store.state.get().status
      const idle = status === "idle" || status === "ended"
      // Non-idle → append to buffer and let tryFlush drain on turn-end.
      if (!idle) {
        const prev = queues.get(sessionId) ?? ""
        const next = prev ? `${prev}\n\n${text}` : text
        queues.set(sessionId, next)
        notifyQueue(sessionId)
        dQueue("send %s — queued (status=%s len=%d)", sessionId, status, next.length)
        return
      }
      // Idle + no hold → send immediately, but include any pending queue
      // text (edited or auto-queued earlier) as part of the same turn.
      const pending = queues.get(sessionId) ?? ""
      const combined = pending ? `${pending}\n\n${text}` : text
      queues.set(sessionId, "")
      notifyQueue(sessionId)
      const turnId = `u-${Date.now()}` as never
      s.store.apply({
        kind: "user-message",
        sessionId: s.session.sessionId,
        turnId,
        text: combined,
        ts: Date.now(),
      })
      s.session.send(combined)
    },
    queuedText(sessionId: string): string {
      return queues.get(sessionId) ?? ""
    },
    setQueuedText(sessionId: string, text: string): void {
      if (text === (queues.get(sessionId) ?? "")) return
      queues.set(sessionId, text)
      notifyQueue(sessionId)
    },
    onQueueChange(handler: (sessionId: string, text: string) => void): () => void {
      queueSubs.add(handler)
      for (const [sid, t] of queues) handler(sid, t)
      return () => queueSubs.delete(handler)
    },
    clearQueue(sessionId: string): void {
      if (!queues.get(sessionId)) return
      queues.set(sessionId, "")
      notifyQueue(sessionId)
    },
    flushQueue(sessionId: string): void {
      // Explicit user-initiated submit — bypasses the idle gate. Claude
      // Code's CLI buffers stdin while mid-turn, so the message lands as
      // the next turn's input.
      dQueue("flushQueue %s — explicit submit", sessionId)
      tryFlush(sessionId, true)
    },
    respondPermission(sessionId: string, requestId: string, approved: boolean): void {
      const s = sessions.find((h) => h.id === sessionId)
      if (!s) return
      s.session.respondToPermission(requestId as PermissionRequestId, approved)
    },
    runSlashCommand(sessionId: string, text: string): void {
      // Slash commands pass through verbatim — Claude Code interprets /compact, /clear, etc.
      // Silvercode-specific commands (/handoff, /inbox, /fork) are intercepted by listeners
      // registered above the controller.
      const s = sessions.find((h) => h.id === sessionId)
      if (!s) return
      const turnId = `u-${Date.now()}` as never
      s.store.apply({
        kind: "user-message",
        sessionId: s.session.sessionId,
        turnId,
        text,
        ts: Date.now(),
      })
      s.session.send(text)
    },
    spawnSession,
    handoff(fromId: string, toId: string, prompt: string): void {
      const from = sessions.find((h) => h.id === fromId)
      const to = sessions.find((h) => h.id === toId)
      if (!from || !to) return
      // Emit a synthetic handoff event into both stores for auditability, then
      // seed the destination with a brief summary of the source session's
      // recent context so the agent can pick up without re-reading.
      const fromState = from.store.state.get()
      const recent = fromState.messages.slice(-3)
      const summary = recent
        .map((m) => {
          if (m.role === "user") return `USER: ${m.text}`
          const text =
            m.text ||
            m.blocks
              ?.filter((b) => b.type === "text")
              .map((b) => (b as { text: string }).text)
              .join("") ||
            ""
          const tools = m.toolCalls.map((c) => `  ${c.name}(${JSON.stringify(c.input).slice(0, 80)})`).join("\n")
          return `ASSISTANT: ${text}${tools ? "\n" + tools : ""}`
        })
        .join("\n\n")
      const handoffText = `[Handed off from session "${from.name}"]\n\nRecent context:\n${summary}\n\nContinue with: ${prompt}`
      to.session.send(handoffText)
      from.store.apply({
        kind: "handoff",
        from: from.id as never,
        to: to.id as never,
        context: { prompt },
        ts: Date.now(),
      })
      to.store.apply({
        kind: "handoff",
        from: from.id as never,
        to: to.id as never,
        context: { prompt },
        ts: Date.now(),
      })
    },
    async fork(fromId: string): Promise<SessionHandle> {
      const from = sessions.find((h) => h.id === fromId)
      if (!from) throw new Error(`session ${fromId} not found`)
      return spawnSession(`${from.name}-fork`)
    },
    closeAll(): void {
      // Synchronous SIGTERM to every child, then unsubscribe. Children
      // shut down gracefully in the background; we don't wait. Listen on
      // session.subscribe('session-end') if a caller needs confirmation.
      for (const s of sessions) {
        s.session.close()
        s.unsubscribe()
      }
    },
  }
}
