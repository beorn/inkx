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
const dBackground = createDebug("silvercode:background")

/**
 * Prefix that marks a synthetic "background result" system message stuffed
 * into the conversation by `completeTask`. MessageList recognises this
 * prefix and renders the row with a distinct (system) treatment instead of
 * the default user-message styling. Exported so test + UI code stays in
 * lockstep with the controller — the prefix is the contract.
 *
 * Pure ASCII (no fancy unicode chevrons): emoji-leaning code points like
 * U+25B6 BLACK RIGHT-POINTING TRIANGLE silently get the VS16 selector
 * applied by terminals that prefer emoji presentation, breaking the
 * contains-substring contract for tests that live below the rendering
 * layer.
 */
export const BACKGROUND_MESSAGE_PREFIX = "[bg] "

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

/**
 * Per-turn background task — see `Controller.backgroundActiveTurn`.
 *
 * When the user presses Ctrl-B during a running turn, the turn's events keep
 * flowing into the SessionStore (the foreground UI sees its outcome) AND get
 * mirrored into a BackgroundTask so the SidePanel + BackgroundPane can show
 * "this turn is running in the background — you can keep typing".
 *
 * `events` accumulates a snapshot of every harness event seen for this turn
 * after backgrounding. On `turn-end`, the task's `status` flips to
 * `completed` (or `cancelled` if the user explicitly cancelled) and a
 * "background-result" message is emitted into the conversation as a SYSTEM
 * message — not as an assistant message — so the user can see what came
 * back without confusing the UI's notion of "whose turn was that".
 */
export type BackgroundTaskStatus = "running" | "completed" | "cancelled" | "failed"

export type BackgroundTask = {
  readonly id: string
  readonly turnId: string
  readonly startedAt: number
  /** `completedAt` is set on the terminal status flip. */
  readonly completedAt?: number
  readonly status: BackgroundTaskStatus
  /** Snapshot of harness events seen for this turn since it was backgrounded. */
  readonly events: ReadonlyArray<AgentEvent>
  /** Snippet preview built from the last assistant text-delta seen — for the SidePanel + system message. */
  readonly snippet: string
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
  /**
   * Background the in-flight turn for `sessionId`. Idempotent + safe to call
   * when no turn is running (no-op). After this returns:
   *   - the SessionStore is forced to `idle` so the UI immediately accepts
   *     new input,
   *   - subsequent harness events for the backgrounded turn keep streaming
   *     into a BackgroundTask (mirrored from the original subscribe path)
   *     until `turn-end` or `session-end`,
   *   - on terminal event, a SYSTEM message is appended to the SessionStore
   *     summarising the result so the user sees what came back.
   */
  backgroundActiveTurn(sessionId: string): void
  /**
   * Re-foreground a completed (or running) background task. v1 semantics:
   * inject the captured snippet as a system message into the conversation
   * if it isn't already there (running tasks get a "still running" hint).
   * Future: full state-restore.
   */
  foregroundTask(sessionId: string, taskId: string): void
  /**
   * Cancel a backgrounded task. v1 semantics: marks the task as `cancelled`
   * + emits a system message; the underlying subprocess turn keeps running
   * because `AgentSession` does not yet expose per-turn cancellation. The
   * cancellation is recorded so the eventual `turn-end` is dropped (no
   * stale "result arrived" message). See bead
   * `km-agent-harness.per-turn-abort` for the upstream gap.
   */
  cancelBackgroundTask(sessionId: string, taskId: string): void
  /** Snapshot of background tasks for one session, newest first. */
  backgroundTasks(sessionId: string): ReadonlyArray<BackgroundTask>
  /** Subscribe to background-task list changes (per session). */
  onBackgroundTasksChange(handler: (sessionId: string, tasks: ReadonlyArray<BackgroundTask>) => void): () => void
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

  // ───── Background tasks ─────
  // Per-session list of backgrounded turns. A turn enters this map when the
  // user presses Ctrl-B; it leaves the "running" state when its turn-end
  // event arrives. Completed tasks remain in the list (so the user can
  // foreground / re-inspect them) but are GC'd after BACKGROUND_TASK_TTL_MS.
  //
  // The set is keyed by sessionId so each card maintains its own
  // independent background-task list. `tasksBySession.get(id)!` is mutated
  // in place + then notifyBackground() is called — keeps the wiring
  // identical to the queue store above.
  const BACKGROUND_TASK_TTL_MS = 10 * 60 * 1000
  const tasksBySession = new Map<string, BackgroundTask[]>()
  const backgroundedTurnIds = new Map<string, Set<string>>() // sessionId → Set<turnId>
  /** Tasks that the user explicitly cancelled — drop the eventual turn-end result. */
  const cancelledTaskIds = new Map<string, Set<string>>()
  const backgroundSubs = new Set<(sessionId: string, tasks: ReadonlyArray<BackgroundTask>) => void>()

  function getTasks(sessionId: string): BackgroundTask[] {
    let list = tasksBySession.get(sessionId)
    if (!list) {
      list = []
      tasksBySession.set(sessionId, list)
    }
    return list
  }
  function notifyBackground(sessionId: string): void {
    const tasks = tasksBySession.get(sessionId) ?? []
    for (const fn of backgroundSubs) fn(sessionId, tasks)
  }
  function isBackgroundedTurn(sessionId: string, turnId: string): boolean {
    return backgroundedTurnIds.get(sessionId)?.has(turnId) === true
  }
  function markBackgrounded(sessionId: string, turnId: string): void {
    let s = backgroundedTurnIds.get(sessionId)
    if (!s) {
      s = new Set()
      backgroundedTurnIds.set(sessionId, s)
    }
    s.add(turnId)
  }
  function findActiveTurnId(handle: SessionHandle): string | null {
    const state = handle.store.state.get()
    // The most recent assistant message that hasn't ended is our active turn.
    // We scan from the end because turns are append-only.
    for (let i = state.messages.length - 1; i >= 0; i--) {
      const m = state.messages[i]!
      if (m.role !== "assistant") continue
      if (m.stopReason) continue // turn-end already arrived
      return m.id as string
    }
    return null
  }

  /**
   * Build a one-line snippet from a task's accumulated events. Prefers the
   * most recent text-delta or the assistant-message content; falls back to
   * the active tool name when no text is available yet.
   */
  function buildSnippet(events: ReadonlyArray<AgentEvent>): string {
    let text = ""
    let lastTool = ""
    for (const e of events) {
      if (e.kind === "text-delta") text += e.text
      else if (e.kind === "assistant-message") {
        for (const b of e.content) {
          if (b.type === "text") text += b.text
        }
      } else if (e.kind === "tool-use") lastTool = e.name
    }
    const trimmed = text.trim().split(/\r?\n/)[0] ?? ""
    if (trimmed.length > 0) return trimmed.slice(0, 120)
    if (lastTool) return `(running ${lastTool})`
    return "(no output yet)"
  }

  /**
   * Update a task in place. Returns true if found.
   */
  function updateTask(sessionId: string, taskId: string, fn: (t: BackgroundTask) => BackgroundTask): boolean {
    const list = getTasks(sessionId)
    const idx = list.findIndex((t) => t.id === taskId)
    if (idx < 0) return false
    list[idx] = fn(list[idx]!)
    return true
  }

  function appendBackgroundEvent(sessionId: string, turnId: string, event: AgentEvent): void {
    const list = getTasks(sessionId)
    const idx = list.findIndex((t) => t.turnId === turnId && t.status === "running")
    if (idx < 0) return
    const task = list[idx]!
    const events = [...task.events, event]
    const fresh = buildSnippet(events)
    // Prefer fresh content from events that arrived AFTER backgrounding;
    // fall back to the seed snippet (captured pre-backgrounding) when the
    // post-background events are still toolless / textless. This keeps the
    // SidePanel + system message useful even when the turn was already
    // most-of-the-way through emitting text when the user pressed Ctrl-B.
    const hasFresh = fresh && fresh !== "(no output yet)"
    const snippet = hasFresh ? fresh : task.snippet
    list[idx] = { ...task, events, snippet }
    notifyBackground(sessionId)
  }

  /**
   * Mark a task terminal + surface a system message in the conversation.
   * The system message is intentionally short — full output is preserved in
   * task.events for the BackgroundPane / foregroundTask flow.
   */
  function completeTask(sessionId: string, turnId: string, status: BackgroundTaskStatus): void {
    const list = getTasks(sessionId)
    const idx = list.findIndex((t) => t.turnId === turnId && t.status === "running")
    if (idx < 0) return
    const task = list[idx]!
    const fresh = buildSnippet(task.events)
    const hasFresh = fresh && fresh !== "(no output yet)"
    const completed: BackgroundTask = {
      ...task,
      status,
      completedAt: Date.now(),
      snippet: hasFresh ? fresh : task.snippet,
    }
    list[idx] = completed
    notifyBackground(sessionId)

    // Schedule GC. The handle is a NodeJS.Timeout in node + bun (not the
    // browser DOM `number`); .unref() lets the process exit even when the
    // timer is still pending.
    const gcHandle: unknown = setTimeout(() => {
      const cur = tasksBySession.get(sessionId)
      if (!cur) return
      const filtered = cur.filter((t) => t.id !== completed.id)
      tasksBySession.set(sessionId, filtered)
      notifyBackground(sessionId)
    }, BACKGROUND_TASK_TTL_MS)
    if (gcHandle && typeof gcHandle === "object" && "unref" in gcHandle) {
      ;(gcHandle as { unref: () => void }).unref()
    }

    // Surface as a system message in the conversation. We send the text
    // through the regular user-message apply path with a `bg-` prefixed
    // turnId — MessageList recognises the prefix and renders a distinct
    // system-style row. This keeps us from having to extend AgentEvent
    // with a new kind (which would touch @km/agent-harness — out of scope
    // for this bead). See `BACKGROUND_MESSAGE_PREFIX` below.
    const handle = sessions.find((h) => h.id === sessionId)
    if (!handle) return
    const elapsedMs = (completed.completedAt ?? Date.now()) - completed.startedAt
    const elapsed = formatElapsed(elapsedMs)
    const verb = status === "cancelled" ? "cancelled" : status === "failed" ? "failed" : "completed"
    const text = `${BACKGROUND_MESSAGE_PREFIX}${verb} (${elapsed}): ${completed.snippet}`
    const sysTurnId = `bg-${completed.id}` as never
    handle.store.apply({
      kind: "user-message",
      sessionId: handle.session.sessionId,
      turnId: sysTurnId,
      text,
      ts: Date.now(),
    })
  }

  function formatElapsed(ms: number): string {
    if (ms < 1000) return `${ms}ms`
    if (ms < 60_000) return `${Math.round(ms / 1000)}s`
    return `${Math.round(ms / 60_000)}m`
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
      // Route to the SessionStore first so the foreground UI keeps animating
      // even while a turn is backgrounded — the background pane is a
      // SHADOW, not a replacement.
      store.apply(event)
      if (log) log.append(event)

      // Mirror events for any backgrounded turn into its BackgroundTask
      // event buffer. We match by turnId (events that don't carry a turnId
      // can't be associated with a specific background task and are
      // skipped). turn-end / error events also flip task status.
      const turnId = "turnId" in event ? (event.turnId as string | undefined) : undefined
      if (turnId && isBackgroundedTurn(id, turnId)) {
        dBackground("mirror %s/%s event=%s", id, turnId, event.kind)
        appendBackgroundEvent(id, turnId, event)
        if (event.kind === "turn-end") {
          // If the user already cancelled this task, suppress the surfaced
          // result message — we already showed "cancelled" — but still flip
          // the running flag so the indicator decrements.
          const cancelled = cancelledTaskIds.get(id)
          const tasks = getTasks(id)
          const runningTask = tasks.find((t) => t.turnId === turnId && t.status === "running")
          if (runningTask && cancelled?.has(runningTask.id)) {
            const idx = tasks.findIndex((t) => t.id === runningTask.id)
            if (idx >= 0) {
              tasks[idx] = { ...runningTask, status: "cancelled", completedAt: Date.now() }
              notifyBackground(id)
            }
          } else {
            completeTask(id, turnId, "completed")
          }
          backgroundedTurnIds.get(id)?.delete(turnId)
        } else if (event.kind === "error") {
          // Don't terminate the task on every error — the harness emits
          // recoverable errors too. Only flip if the next event is turn-end
          // (handled above). For now record the error and let turn-end take
          // over; failed terminal status is reserved for future use.
        }
      }

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
    backgroundActiveTurn(sessionId: string): void {
      const handle = sessions.find((h) => h.id === sessionId)
      if (!handle) return
      const status = handle.store.state.get().status
      if (status === "idle" || status === "ended") {
        dBackground("backgroundActiveTurn %s — no active turn (status=%s)", sessionId, status)
        return
      }
      const turnId = findActiveTurnId(handle)
      if (!turnId) {
        dBackground("backgroundActiveTurn %s — no active turn id (status=%s)", sessionId, status)
        return
      }
      // Idempotent: if we've already backgrounded this turn, no-op.
      if (isBackgroundedTurn(sessionId, turnId)) {
        dBackground("backgroundActiveTurn %s/%s — already backgrounded", sessionId, turnId)
        return
      }
      markBackgrounded(sessionId, turnId)
      const list = getTasks(sessionId)
      // Capture any events ALREADY in the store for this turn (text deltas,
      // tool calls etc.) so the background task starts with the partial
      // output as its snippet baseline.
      const state = handle.store.state.get()
      const existing = state.messages.find((m) => m.id === turnId)
      const seedSnippet = existing?.text.trim().split(/\r?\n/)[0]?.slice(0, 120) ?? "(running)"
      const task: BackgroundTask = {
        id: `bg-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        turnId,
        startedAt: existing?.ts ?? Date.now(),
        status: "running",
        events: [],
        snippet: seedSnippet,
      }
      list.unshift(task)
      notifyBackground(sessionId)
      dBackground("backgroundActiveTurn %s/%s — task %s", sessionId, turnId, task.id)
      // Force the foreground UI to "idle" so the user can keep typing.
      // The store's status field is internally a signal; we apply a
      // synthetic session-lifecycle "resumed" event which the store treats
      // as a no-op (only "ended" affects status), so we instead surface a
      // synthetic turn-end-style state nudge by emitting a status event
      // with `requesting` does the wrong thing. Cleanest: emit a synthetic
      // user-message which the store handles WITHOUT changing status, then
      // immediately clear via a short queue pass — but actually status is
      // ONLY flipped to idle by `turn-end`. To keep the foreground UI
      // responsive without faking a turn-end (which would also fire the
      // queue auto-flush), we apply a synthetic turn-end for the
      // backgrounded turn. The original turn-end will arrive later but is
      // a no-op against the same turnId in the store (stopReason just gets
      // overwritten).
      handle.store.apply({
        kind: "turn-end",
        sessionId: handle.session.sessionId,
        turnId: turnId as never,
        stopReason: "backgrounded",
        ts: Date.now(),
      })
    },
    foregroundTask(sessionId: string, taskId: string): void {
      const handle = sessions.find((h) => h.id === sessionId)
      if (!handle) return
      const list = getTasks(sessionId)
      const task = list.find((t) => t.id === taskId)
      if (!task) return
      // v1: inject a status note into the conversation so the user sees
      // the snippet again as a reminder + receives a fresh anchor for the
      // foregrounded task. The full event log is in `task.events` for
      // future state-restore work.
      const verb = task.status === "running" ? "still running" : task.status
      const text = `${BACKGROUND_MESSAGE_PREFIX}${verb} (foregrounded): ${task.snippet}`
      const sysTurnId = `bg-fg-${task.id}-${Date.now()}` as never
      handle.store.apply({
        kind: "user-message",
        sessionId: handle.session.sessionId,
        turnId: sysTurnId,
        text,
        ts: Date.now(),
      })
      dBackground("foregroundTask %s/%s — surfaced", sessionId, taskId)
    },
    cancelBackgroundTask(sessionId: string, taskId: string): void {
      const list = getTasks(sessionId)
      const idx = list.findIndex((t) => t.id === taskId)
      if (idx < 0) return
      const task = list[idx]!
      // Already terminal? no-op.
      if (task.status !== "running") return
      // Record the cancellation so the eventual turn-end is treated as a
      // no-op (don't surface "completed" after the user already saw
      // "cancelled"). The underlying subprocess turn keeps running because
      // AgentSession does not yet expose per-turn cancellation —
      // `session.close()` would kill the WHOLE session and lose all other
      // state. Tracked upstream in km-agent-harness.per-turn-abort.
      let cancelled = cancelledTaskIds.get(sessionId)
      if (!cancelled) {
        cancelled = new Set()
        cancelledTaskIds.set(sessionId, cancelled)
      }
      cancelled.add(task.id)
      list[idx] = { ...task, status: "cancelled", completedAt: Date.now() }
      notifyBackground(sessionId)
      // Surface a short cancellation message in the conversation.
      const handle = sessions.find((h) => h.id === sessionId)
      if (handle) {
        const sysTurnId = `bg-cancel-${task.id}` as never
        handle.store.apply({
          kind: "user-message",
          sessionId: handle.session.sessionId,
          turnId: sysTurnId,
          text: `${BACKGROUND_MESSAGE_PREFIX}cancelled: ${task.snippet}`,
          ts: Date.now(),
        })
      }
      dBackground("cancelBackgroundTask %s/%s", sessionId, taskId)
    },
    backgroundTasks(sessionId: string): ReadonlyArray<BackgroundTask> {
      return tasksBySession.get(sessionId) ?? []
    },
    onBackgroundTasksChange(handler: (sessionId: string, tasks: ReadonlyArray<BackgroundTask>) => void): () => void {
      backgroundSubs.add(handler)
      // Replay current state for every session so the subscriber sees an
      // initial snapshot.
      for (const [sid, tasks] of tasksBySession) handler(sid, tasks)
      return () => backgroundSubs.delete(handler)
    },
  }
}
