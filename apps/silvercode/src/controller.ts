/**
 * Controller — owns N sessions, routes events into per-session stores, and
 * wires subscriptions back out to React.
 *
 * Keeps the UI declarative: React components never call spawn directly, they
 * call controller methods. The controller is the bridge between the silvery
 * render tree and the headless agent-harness.
 */

import { resolve as resolvePath } from "node:path"
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

/**
 * Resolve stdio MCP server specs for a spawned session. Each session gets:
 *   - km-mcp-server (km_search / km_get_node / km_get_board / km_render_path)
 *   - km-tribe-mcp (tribe_send / tribe_history / tribe_members / tribe_broadcast)
 *
 * Both run via `bun run` against the workspace package src so they resolve
 * workspace deps the same way the host does. TRIBE_SESSION_NAME keys the
 * tribe backend to this session's identity.
 */
function defaultMcpServers(sessionName: string, workspaceRoot: string): McpServerSpec[] {
  const kmBin = resolvePath(workspaceRoot, "apps/silvercode/packages/km-mcp-server/src/bin.ts")
  const tribeBin = resolvePath(workspaceRoot, "apps/silvercode/packages/tribe-mcp/src/bin.ts")
  return [
    { name: "km", command: "bun", args: ["run", kmBin] },
    {
      name: "tribe",
      command: "bun",
      args: ["run", tribeBin],
      env: { TRIBE_SESSION_NAME: sessionName },
    },
  ]
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
  send(sessionId: string, text: string): void
  respondPermission(sessionId: string, requestId: string, approved: boolean): void
  runSlashCommand(sessionId: string, text: string): void
  spawnSession(name?: string): Promise<SessionHandle>
  /** Move task+context from source → destination session. */
  handoff(fromId: string, toId: string, prompt: string): void
  /** Fork a session — spawn a new one pre-seeded with the source's context. */
  fork(fromId: string): Promise<SessionHandle>
  closeAll(): Promise<void>
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
    const mcpServers = opts.mcpServers ?? defaultMcpServers(s.name, workspaceRoot)
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
    const id = `s${nextId++}`
    const givenName = name ?? `session-${id}`
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
      // Synthesize the user-message locally so the card echoes it immediately.
      // Claude's stream-json only re-emits user turns for tool_results, not
      // plain user messages, so without this the typed text never appears.
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
    async closeAll(): Promise<void> {
      await Promise.all(sessions.map((s) => s.session.close()))
      for (const s of sessions) s.unsubscribe()
    },
  }
}
