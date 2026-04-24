/**
 * Controller — owns N sessions, routes events into per-session stores, and
 * wires subscriptions back out to React.
 *
 * Keeps the UI declarative: React components never call spawn directly, they
 * call controller methods. The controller is the bridge between the silvery
 * render tree and the headless agent-harness.
 */

import {
  type AgentEvent,
  type AgentSession,
  type EventLog,
  type Injector,
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
import { bdPrimeOutput, readActiveBead } from "./bd-prime.ts"

type Track = "claude" | "sdk" | "codex"

export type SessionHandle = {
  readonly id: string
  readonly name: string
  readonly store: SessionStore
  readonly session: AgentSession
  readonly unsubscribe: () => void
  readonly log?: EventLog
}

export type ControllerOptions = {
  cwd: string
  model?: string
  resume?: string
  bare: boolean
  track: Track
  logDir?: string
  initialSessions: number
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
}

export type SpawnSessionOptions = {
  id: string
  name: string
  track: Track
  cwd: string
  model?: string
  resume?: string
  bare: boolean
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
        const maybe = (tribe as TribeBackend & { drain?: (n: string) => Array<{ from: string; text: string }> })
          .drain
        if (maybe) return maybe(sessionName)
        return []
      }),
    )
    return list
  }

  async function defaultSpawn(s: SpawnSessionOptions): Promise<AgentSession> {
    const injectors = makeInjectors(s.name)
    if (s.track === "codex") {
      return spawnCodex({ cwd: s.cwd, injectors })
    }
    if (s.track === "sdk") {
      return spawnSdk({ cwd: s.cwd, model: s.model, injectors })
    }
    return spawnClaude({
      cwd: s.cwd,
      model: s.model,
      resume: s.resume,
      bare: s.bare,
      injectors,
    })
  }

  const factory = opts.spawnFactory ?? defaultSpawn

  async function spawnSession(name?: string): Promise<SessionHandle> {
    const id = `s${nextId++}`
    const givenName = name ?? `session-${id}`
    const store = createSessionStore()
    const session = await Promise.resolve(
      factory({
        id,
        name: givenName,
        track: opts.track,
        cwd: opts.cwd,
        model: opts.model,
        resume: opts.resume,
        bare: opts.bare,
      }),
    )

    let log: EventLog | undefined
    if (opts.logDir) log = createFileEventLog(opts.logDir)

    const unsub = session.subscribe((event: AgentEvent) => {
      store.apply(event)
      if (log) log.append(event)
    })

    const handle: SessionHandle = { id, name: givenName, store, session, unsubscribe: unsub, log }

    // Intro message — synthesize a local assistant turn so the session card
    // isn't empty on first render. Not sent to the subprocess; purely UI.
    const introTurnId = `intro-${id}` as never
    const introText = [
      "**Welcome to silvercode.**",
      "",
      "Type a message and press Enter to send. Type `/` to open the command palette:",
      "",
      "- `/inbox`             — cross-session permission triage",
      "- `/todos`             — toggle todo panel",
      "- `/history`           — replay + search past sessions",
      "- `/mode [name]`       — cycle plan / accept-edits / auto / bypass",
      "- `/handoff <prompt>`  — move task+context to another session",
      "- `/fork`              — spawn a seeded sibling",
      "- `/spawn [name]`      — open another session in the grid",
      "",
      "Click any tool block to expand it. Click a mode label to switch.",
    ].join("\n")
    store.apply({
      kind: "turn-start",
      sessionId: "silvercode-intro" as never,
      turnId: introTurnId,
      role: "assistant",
      ts: Date.now(),
    })
    store.apply({
      kind: "text-delta",
      sessionId: "silvercode-intro" as never,
      turnId: introTurnId,
      blockIndex: 0,
      text: introText,
      ts: Date.now(),
    })
    store.apply({
      kind: "turn-end",
      sessionId: "silvercode-intro" as never,
      turnId: introTurnId,
      ts: Date.now(),
    })

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
          const text = m.text || m.blocks?.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("") || ""
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
