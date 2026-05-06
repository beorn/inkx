import { computed, signal } from "alien-signals"
import type { Scope } from "@silvery/scope"
import type {
  AgentBackend,
  AgentBackendConnectOptions,
  AgentBackendId,
  AgentBackendInput,
  AgentBackends,
  AgentConnection,
} from "./agent-backends.ts"
import type { AgentEvent, SessionId } from "./events.ts"
import { createSessionStore, type MessageEntry, type SessionState, type SessionStatus } from "./session-store.ts"
import { createAgentBackends } from "./agent-backends.ts"

export type WritableSignal<T> = (() => T) & ((value: T) => void)

export type AgentSelection = {
  readonly backendId: AgentBackendId
  readonly modelId?: string
  readonly label?: string
}

export type ChatSessionStore = {
  readonly id: SessionId
  readonly agent: WritableSignal<AgentSelection | null>
  readonly conn: WritableSignal<AgentConnection | null>
  readonly state: () => SessionState
  readonly entries: () => readonly MessageEntry[]
  readonly status: () => SessionStatus
  readonly lastError: () => SessionState["lastError"]
  apply(event: AgentEvent): void
  bind(conn: AgentConnection, agent?: AgentSelection): void
  send(args: { text: string }): void
  close(): Promise<void>
}

export type ChatStore = {
  readonly sessions: WritableSignal<readonly ChatSessionStore[]>
  readonly selectedSessionId: WritableSignal<SessionId | null>
  readonly session: () => ChatSessionStore | null
  backends?: AgentBackends
  addSession(session: ChatSessionStore): ChatSessionStore
  select(args: { sessionId: SessionId | null }): void
  open(args: {
    scope: Scope
    backendId?: AgentBackendId
    cwd?: string
    connect?: AgentBackendConnectOptions
    session?: ChatSessionStore
  }): Promise<ChatSessionStore>
  send(args: { text: string; sessionId?: SessionId }): void
  close(args?: { sessionId?: SessionId }): Promise<void>
}

export type ChatOptions = {
  readonly session?: ChatSessionStore
  readonly sessions?: readonly ChatSessionStore[]
  readonly backends?: AgentBackendInput | AgentBackends
}

export function createChatSessionStore(opts: { id: SessionId; agent?: AgentSelection | null }): ChatSessionStore {
  const legacy = createSessionStore()
  const state = signal<SessionState>(legacy.state.get())
  const agent = signal<AgentSelection | null>(opts.agent ?? null)
  const conn = signal<AgentConnection | null>(null)
  let unbind: (() => void) | null = null

  function refresh(): void {
    state(legacy.state.get())
  }

  return {
    id: opts.id,
    agent: agent as WritableSignal<AgentSelection | null>,
    conn: conn as WritableSignal<AgentConnection | null>,
    state: state as () => SessionState,
    entries: computed(() => state().messages),
    status: computed(() => state().status),
    lastError: computed(() => state().lastError),

    apply(event): void {
      legacy.apply(event)
      refresh()
    },

    bind(nextConn, nextAgent): void {
      unbind?.()
      conn(nextConn)
      if (nextAgent) agent(nextAgent)
      unbind = nextConn.subscribe((event) => {
        legacy.apply(event)
        refresh()
      })
    },

    send(args): void {
      const active = conn()
      if (active == null) throw new Error(`chat session ${opts.id}: cannot send without a backend connection`)
      active.send(args.text)
    },

    async close(): Promise<void> {
      const active = conn()
      unbind?.()
      unbind = null
      conn(null)
      if (active != null) await active.close()
    },
  }
}

export function createChatStore(opts: ChatOptions = {}): ChatStore {
  const initial = opts.sessions ?? (opts.session ? [opts.session] : [])
  const sessions = signal<readonly ChatSessionStore[]>(initial)
  const selectedSessionId = signal<SessionId | null>(initial[0]?.id ?? null)
  const session = computed(() => {
    const id = selectedSessionId()
    return sessions().find((item) => item.id === id) ?? null
  })
  const chat: ChatStore = {
    sessions: sessions as WritableSignal<readonly ChatSessionStore[]>,
    selectedSessionId: selectedSessionId as WritableSignal<SessionId | null>,
    session,

    addSession(nextSession): ChatSessionStore {
      const existing = sessions().find((item) => item.id === nextSession.id)
      if (existing) return existing
      sessions([...sessions(), nextSession])
      selectedSessionId(nextSession.id)
      return nextSession
    },

    select(args): void {
      selectedSessionId(args.sessionId)
    },

    async open(args): Promise<ChatSessionStore> {
      const backend = chooseBackend(chat.backends, args.backendId)
      const connect = {
        cwd: args.cwd,
        ...args.connect,
      } satisfies AgentBackendConnectOptions
      const conn = await backend.connect(args.scope, connect)
      const nextSession = args.session ?? createChatSessionStore({ id: conn.sessionId })
      if (nextSession.id !== conn.sessionId) {
        await conn.close()
        throw new Error(`chat.open session id ${nextSession.id} does not match backend session id ${conn.sessionId}`)
      }
      nextSession.bind(conn, { backendId: backend.id, label: backend.label })
      nextSession.apply(sessionInitEvent(conn, connect))
      chat.addSession(nextSession)
      chat.select({ sessionId: nextSession.id })
      return nextSession
    },

    send(args): void {
      const target = findSession(sessions(), args.sessionId ?? selectedSessionId())
      target.send({ text: args.text })
    },

    async close(args): Promise<void> {
      const target = findSession(sessions(), args?.sessionId ?? selectedSessionId())
      await target.close()
    },
  }
  if (opts.backends) installAgentBackends(chat, opts.backends)
  return chat
}

export function withChat(opts: ChatOptions = {}) {
  return function applyChat<App extends object>(app: App): App & { chat: ChatStore } {
    return { ...app, chat: createChatStore(opts) }
  }
}

export function withAgentBackends(opts: { backends: AgentBackendInput | AgentBackends }) {
  return function applyAgentBackends<App extends { chat: ChatStore }>(app: App): App {
    installAgentBackends(app.chat, opts.backends)
    return app
  }
}

function installAgentBackends(chat: ChatStore, input: AgentBackendInput | AgentBackends): void {
  const backends = isAgentBackends(input) ? input : createAgentBackends(input)
  chat.backends = backends
}

function isAgentBackends(value: AgentBackendInput | AgentBackends): value is AgentBackends {
  const maybe = value as Partial<AgentBackends>
  return typeof maybe.get === "function" && typeof maybe.values === "function"
}

function chooseBackend(backends: AgentBackends | undefined, id: AgentBackendId | undefined): AgentBackend {
  if (!backends) {
    throw new Error("chat.open requires agent backends; call withAgentBackends() or withChat({ backends })")
  }
  if (id) {
    const backend = backends.get(id)
    if (!backend) throw new Error(`unknown agent backend ${id}`)
    return backend
  }
  const backend = backends.values().next().value
  if (!backend) throw new Error("chat.open requires at least one agent backend")
  return backend
}

function sessionInitEvent(conn: AgentConnection, opts: AgentBackendConnectOptions): AgentEvent {
  const cwd = opts.sessionCwd ?? opts.cwd ?? process.cwd()
  return {
    kind: "session-init",
    sessionId: conn.sessionId,
    cwd,
    model: opts.model ?? "",
    mode: "",
    tools: [],
    mcp_servers: (opts.mcpServers ?? []).map((server) => server.name),
    slashCommands: [],
    skills: [],
    plugins: [],
    claudeCodeVersion: "",
    apiKeySource: "",
    ts: Date.now(),
  }
}

function findSession(sessions: readonly ChatSessionStore[], id: SessionId | null): ChatSessionStore {
  const session = id ? sessions.find((item) => item.id === id) : undefined
  if (!session) throw new Error(`unknown chat session ${String(id)}`)
  return session
}
