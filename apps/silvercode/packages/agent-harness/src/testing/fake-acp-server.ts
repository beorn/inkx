/**
 * In-process fake ACP backends for contract tests.
 *
 * This is intentionally one layer lower than `createFakeAcpSession` in
 * `../fake.ts`: it returns a fake `AcpSpawn` whose stdio streams are wired to
 * a real `AgentSideConnection`. Tests can run `connectAcp` unchanged and
 * exercise the same JSON-RPC methods used by real ACP backends.
 */

import { EventEmitter } from "node:events"
import { PassThrough, Readable, Writable } from "node:stream"
import * as acp from "@agentclientprotocol/sdk"
import type { AcpRegistryId, AcpSpawn, AcpSpawnedChild } from "../acp-client.ts"

export interface FakeAcpPromptContext {
  readonly conn: acp.AgentSideConnection
  readonly params: acp.PromptRequest
  readonly backend: FakeAcpBackendController
  readonly configOptions: acp.SessionConfigOption[]
  emitText(text: string): Promise<void>
}

export type FakeAcpPromptHandler = (
  ctx: FakeAcpPromptContext,
) => Promise<acp.PromptResponse | void> | acp.PromptResponse | void

export interface FakeAcpBackendProfile {
  /** Stable provider id, e.g. `codex` or `gemini`. */
  id: string
  /** Prefix used when minting session ids for this fake backend. */
  sessionIdPrefix?: string
  /** Capabilities advertised during ACP initialize. */
  agentCapabilities?: acp.AgentCapabilities
  /** Auth methods advertised during ACP initialize. */
  authMethods?: acp.AuthMethod[]
  /** Initial config options copied into every new or loaded session. */
  configOptions?: acp.SessionConfigOption[]
  /** Text chunk emitted for prompt calls. Defaults to a deterministic echo. */
  promptText?: string | ((params: acp.PromptRequest) => string)
  /** Full prompt script. Use when a scenario needs permissions, fs, tools, etc. */
  onPrompt?: FakeAcpPromptHandler
  /** Built-in prompt scenario used when neither `onPrompt` nor `promptText` is set. */
  promptScenario?: "basic" | "comprehensive"
}

export interface FakeAcpSessionSnapshot {
  sessionId: acp.SessionId
  cwd?: string | null
  configOptions: acp.SessionConfigOption[]
}

export interface FakeAcpBackendController {
  readonly profile: FakeAcpBackendProfile
  getSession(sessionId: string): FakeAcpSessionSnapshot | undefined
  getSessionConfigOptions(sessionId: string): acp.SessionConfigOption[]
}

export interface FakeAcpSpawnHandle {
  spawn: AcpSpawn
  backend: FakeAcpBackendController
}

export interface FakeCodexAcpSpawnOptions {
  sessionIdPrefix?: string
  configOptions?: acp.SessionConfigOption[]
}

export interface FakeAcpRegistrySpawnOptions {
  sessionIdPrefix?: string
  configOptions?: acp.SessionConfigOption[]
  promptText?: FakeAcpBackendProfile["promptText"]
  onPrompt?: FakeAcpPromptHandler
  promptScenario?: FakeAcpBackendProfile["promptScenario"]
}

export const codexAcpProfile: FakeAcpBackendProfile = {
  id: "codex",
  sessionIdPrefix: "fake-codex",
  agentCapabilities: { loadSession: true },
  authMethods: [],
  configOptions: [
    {
      type: "select",
      id: "model",
      name: "Model",
      category: "model",
      currentValue: "gpt-5.2-codex",
      options: [
        { value: "gpt-5.2-codex", name: "GPT-5.2 Codex" },
        { value: "gpt-5.2", name: "GPT-5.2" },
      ],
    },
    {
      type: "select",
      id: "reasoning_effort",
      name: "Reasoning Effort",
      category: "thought_level",
      currentValue: "medium",
      options: [
        { value: "low", name: "Low" },
        { value: "medium", name: "Medium" },
        { value: "high", name: "High" },
        { value: "xhigh", name: "Extra High" },
      ],
    },
    {
      type: "boolean",
      id: "web_search",
      name: "Web Search",
      category: "_codex",
      currentValue: false,
    },
    {
      type: "select",
      id: "permission_policy",
      name: "Permission Policy",
      category: "mode",
      currentValue: "on-request",
      options: [
        { value: "untrusted", name: "Untrusted" },
        { value: "on-failure", name: "On Failure" },
        { value: "on-request", name: "On Request" },
        { value: "never", name: "Never" },
      ],
    },
    {
      type: "select",
      id: "sandbox",
      name: "Sandbox",
      category: "_codex",
      currentValue: "workspace-write",
      options: [
        { value: "read-only", name: "Read Only" },
        { value: "workspace-write", name: "Workspace Write" },
        { value: "danger-full-access", name: "Danger Full Access" },
      ],
    },
  ],
}

export const geminiAcpProfile: FakeAcpBackendProfile = {
  id: "gemini",
  sessionIdPrefix: "fake-gemini",
  agentCapabilities: { loadSession: true },
  authMethods: [],
}

export const copilotAcpProfile: FakeAcpBackendProfile = {
  id: "github-copilot-cli",
  sessionIdPrefix: "fake-github-copilot-cli",
  agentCapabilities: { loadSession: true },
  authMethods: [],
}

export const piAcpProfile: FakeAcpBackendProfile = {
  id: "pi-acp",
  sessionIdPrefix: "fake-pi-acp",
  agentCapabilities: { loadSession: true },
  authMethods: [],
}

export const claudeAcpProfile: FakeAcpBackendProfile = {
  id: "claude",
  sessionIdPrefix: "fake-claude",
  agentCapabilities: { loadSession: true },
  authMethods: [],
}

export const claudeCodeAcpProfile: FakeAcpBackendProfile = {
  id: "claude-code",
  sessionIdPrefix: "fake-claude-code",
  agentCapabilities: { loadSession: true },
  authMethods: [],
}

const ACP_REGISTRY_PROFILES: Record<AcpRegistryId, FakeAcpBackendProfile> = {
  codex: codexAcpProfile,
  gemini: geminiAcpProfile,
  "github-copilot-cli": copilotAcpProfile,
  "pi-acp": piAcpProfile,
  claude: claudeAcpProfile,
  "claude-code": claudeCodeAcpProfile,
}

export function createFakeCodexAcpSpawn(opts: FakeCodexAcpSpawnOptions = {}): FakeAcpSpawnHandle {
  return createFakeAcpSpawn({
    ...codexAcpProfile,
    sessionIdPrefix: opts.sessionIdPrefix ?? codexAcpProfile.sessionIdPrefix,
    configOptions: opts.configOptions ?? codexAcpProfile.configOptions,
  })
}

export function createFakeAcpRegistrySpawn(
  registryId: AcpRegistryId,
  opts: FakeAcpRegistrySpawnOptions = {},
): FakeAcpSpawnHandle {
  const profile = ACP_REGISTRY_PROFILES[registryId]
  return createFakeAcpSpawn({
    ...profile,
    sessionIdPrefix: opts.sessionIdPrefix ?? profile.sessionIdPrefix,
    configOptions: opts.configOptions ?? profile.configOptions,
    promptText: opts.promptText ?? profile.promptText,
    onPrompt: opts.onPrompt ?? profile.onPrompt,
    promptScenario: opts.promptScenario ?? profile.promptScenario,
  })
}

export function createFakeAcpSpawn(profile: FakeAcpBackendProfile): FakeAcpSpawnHandle {
  const backend = new FakeAcpBackend(profile)

  return {
    backend,
    spawn: () => createFakeAcpChild((conn) => backend.createAgent(conn)),
  }
}

class FakeAcpBackend implements FakeAcpBackendController {
  readonly profile: FakeAcpBackendProfile
  #nextSession = 1
  #sessions = new Map<string, FakeAcpSessionSnapshot>()

  constructor(profile: FakeAcpBackendProfile) {
    this.profile = profile
  }

  getSession(sessionId: string): FakeAcpSessionSnapshot | undefined {
    const session = this.#sessions.get(sessionId)
    return session ? cloneSession(session) : undefined
  }

  getSessionConfigOptions(sessionId: string): acp.SessionConfigOption[] {
    const session = this.#sessions.get(sessionId)
    if (!session) throw new Error(`fake ACP ${this.profile.id}: unknown session ${sessionId}`)
    return cloneConfigOptions(session.configOptions)
  }

  createAgent(conn: acp.AgentSideConnection): acp.Agent {
    return {
      initialize: async () => ({
        protocolVersion: acp.PROTOCOL_VERSION,
        agentCapabilities: this.profile.agentCapabilities ?? { loadSession: true },
        authMethods: this.profile.authMethods ?? [],
      }),

      newSession: async (params) => {
        const sessionId = `${this.profile.sessionIdPrefix ?? `fake-${this.profile.id}`}-${this.#nextSession++}`
        const session = this.createSession(sessionId, params.cwd)
        return { sessionId: session.sessionId, configOptions: cloneConfigOptions(session.configOptions) }
      },

      loadSession: async (params) => {
        const session = this.#sessions.get(params.sessionId) ?? this.createSession(params.sessionId, params.cwd)
        session.cwd = params.cwd
        return { configOptions: cloneConfigOptions(session.configOptions) }
      },

      setSessionConfigOption: async (params) => {
        const session = this.requireSession(params.sessionId)
        this.applyConfigOption(session, params)
        const configOptions = cloneConfigOptions(session.configOptions)
        await conn.sessionUpdate({
          sessionId: params.sessionId,
          update: {
            sessionUpdate: "config_option_update",
            configOptions,
          },
        })
        return { configOptions }
      },

      authenticate: async () => ({}),

      prompt: async (params) => {
        if (this.profile.onPrompt) {
          const response = await this.profile.onPrompt({
            conn,
            params,
            backend: this,
            configOptions: cloneConfigOptions(this.requireSession(params.sessionId).configOptions),
            emitText: (text) => emitText(conn, params.sessionId, text),
          })
          return response ?? { stopReason: "end_turn" }
        }
        if (!this.profile.promptText && (this.profile.promptScenario ?? "comprehensive") === "comprehensive") {
          return emitComprehensivePrompt({
            conn,
            params,
            backend: this,
            configOptions: cloneConfigOptions(this.requireSession(params.sessionId).configOptions),
            emitText: (text) => emitText(conn, params.sessionId, text),
          })
        }
        const text =
          typeof this.profile.promptText === "function"
            ? this.profile.promptText(params)
            : (this.profile.promptText ?? `fake ${this.profile.id} response`)
        await emitText(conn, params.sessionId, text)
        return { stopReason: "end_turn" }
      },

      cancel: async () => {
        /* no-op */
      },
    }
  }

  private createSession(sessionId: string, cwd?: string | null): FakeAcpSessionSnapshot {
    const session = {
      sessionId,
      cwd,
      configOptions: cloneConfigOptions(this.profile.configOptions ?? []),
    }
    this.#sessions.set(sessionId, session)
    return session
  }

  private requireSession(sessionId: string): FakeAcpSessionSnapshot {
    const session = this.#sessions.get(sessionId)
    if (!session) throw new Error(`fake ACP ${this.profile.id}: unknown session ${sessionId}`)
    return session
  }

  private applyConfigOption(session: FakeAcpSessionSnapshot, params: acp.SetSessionConfigOptionRequest): void {
    const option = session.configOptions.find((item) => item.id === params.configId)
    if (!option) {
      throw invalidConfigParams(this.profile.id, params, `unknown config option ${params.configId}`)
    }

    if ("type" in params) {
      if (option.type !== "boolean") {
        throw invalidConfigParams(this.profile.id, params, `config option ${params.configId} expects select value`)
      }
      option.currentValue = params.value
      return
    }

    if (option.type === "boolean") {
      throw invalidConfigParams(this.profile.id, params, `config option ${params.configId} expects boolean`)
    }
    const value = params.value
    if (!selectValues(option).has(value)) {
      throw invalidConfigParams(
        this.profile.id,
        params,
        `invalid value ${String(value)} for config option ${params.configId}`,
      )
    }
    option.currentValue = value
  }
}

async function emitText(conn: acp.AgentSideConnection, sessionId: acp.SessionId, text: string): Promise<void> {
  await conn.sessionUpdate({
    sessionId,
    update: {
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text },
    },
  })
}

const FAKE_TOOL_KINDS = [
  "read",
  "edit",
  "delete",
  "move",
  "search",
  "execute",
  "think",
  "fetch",
  "switch_mode",
  "other",
] as const satisfies readonly acp.ToolKind[]

async function emitComprehensivePrompt(ctx: FakeAcpPromptContext): Promise<acp.PromptResponse> {
  const { conn, params } = ctx
  const sessionId = params.sessionId

  await sessionUpdate(conn, sessionId, {
    sessionUpdate: "agent_thought_chunk",
    messageId: "00000000-0000-4000-8000-000000000001",
    content: { type: "text", text: `fake ${ctx.backend.profile.id} reasoning trace` },
  })
  await sessionUpdate(conn, sessionId, {
    sessionUpdate: "agent_message_chunk",
    messageId: "00000000-0000-4000-8000-000000000002",
    content: { type: "text", text: `fake ${ctx.backend.profile.id} comprehensive response` },
  })
  await sessionUpdate(conn, sessionId, {
    sessionUpdate: "agent_message_chunk",
    messageId: "00000000-0000-4000-8000-000000000003",
    content: {
      type: "image",
      data: "iVBORw0KGgo=",
      mimeType: "image/png",
      uri: "file:///tmp/silvercode-fake/screenshot.png",
    },
  })
  await sessionUpdate(conn, sessionId, {
    sessionUpdate: "agent_message_chunk",
    messageId: "00000000-0000-4000-8000-000000000004",
    content: {
      type: "audio",
      data: "UklGRg==",
      mimeType: "audio/wav",
    },
  })
  await sessionUpdate(conn, sessionId, {
    sessionUpdate: "agent_message_chunk",
    messageId: "00000000-0000-4000-8000-000000000005",
    content: {
      type: "resource_link",
      name: "fixture.md",
      title: "Fake Fixture",
      description: "Synthetic resource link emitted by the fake ACP backend.",
      uri: "file:///tmp/silvercode-fake/fixture.md",
      mimeType: "text/markdown",
      size: 128,
    },
  })
  await sessionUpdate(conn, sessionId, {
    sessionUpdate: "agent_message_chunk",
    messageId: "00000000-0000-4000-8000-000000000006",
    content: {
      type: "resource",
      resource: {
        uri: "file:///tmp/silvercode-fake/context.txt",
        mimeType: "text/plain",
        text: "synthetic embedded context",
      },
    },
  })

  for (const kind of FAKE_TOOL_KINDS) {
    await emitToolScenario(conn, sessionId, kind)
  }

  await sessionUpdate(conn, sessionId, {
    sessionUpdate: "plan",
    entries: [
      { content: "Survey local agent transcript event families", priority: "high", status: "completed" },
      { content: "Exercise fake ACP provider stream", priority: "high", status: "in_progress" },
      { content: "Compare fakes against live backend specs", priority: "medium", status: "pending" },
    ],
  })
  await sessionUpdate(conn, sessionId, {
    sessionUpdate: "available_commands_update",
    availableCommands: [
      {
        name: "/fake-review",
        description: "Run the fake review command.",
        input: { hint: "optional scope" },
      },
      {
        name: "/fake-compact",
        description: "Run the fake compaction command.",
      },
    ],
  })
  await sessionUpdate(conn, sessionId, {
    sessionUpdate: "current_mode_update",
    currentModeId: "fake-act",
  })
  await sessionUpdate(conn, sessionId, {
    sessionUpdate: "config_option_update",
    configOptions: ctx.configOptions,
  })
  await sessionUpdate(conn, sessionId, {
    sessionUpdate: "session_info_update",
    title: `Fake ${ctx.backend.profile.id} session`,
    updatedAt: "2026-05-06T00:00:00.000Z",
  })
  await sessionUpdate(conn, sessionId, {
    sessionUpdate: "usage_update",
    size: 200_000,
    used: 1_024,
    cost: { amount: 0.01, currency: "USD" },
  })

  return { stopReason: "end_turn" }
}

async function emitToolScenario(
  conn: acp.AgentSideConnection,
  sessionId: acp.SessionId,
  kind: (typeof FAKE_TOOL_KINDS)[number],
): Promise<void> {
  const id = `fake-${kind}`
  const path = `/tmp/silvercode-fake/${kind}.txt`
  await sessionUpdate(conn, sessionId, {
    sessionUpdate: "tool_call",
    toolCallId: id,
    title: `Fake ${kind} tool`,
    kind,
    status: "pending",
    locations: [{ path, line: 1 }],
    rawInput: { kind, path, query: `synthetic ${kind} request` },
  })
  await sessionUpdate(conn, sessionId, {
    sessionUpdate: "tool_call_update",
    toolCallId: id,
    status: "pending",
  })

  if (kind === "execute") {
    await sessionUpdate(conn, sessionId, {
      sessionUpdate: "tool_call_update",
      toolCallId: id,
      status: "in_progress",
      content: [{ type: "terminal", terminalId: "fake-terminal-1" }],
    })
  }

  const failed = kind === "delete"
  await sessionUpdate(conn, sessionId, {
    sessionUpdate: "tool_call_update",
    toolCallId: id,
    status: failed ? "failed" : "completed",
    locations: [{ path, line: 2 }],
    content: toolContentFor(kind, path),
    rawOutput: failed ? { ok: false, error: "synthetic failure" } : { ok: true, kind, path },
  })
}

function toolContentFor(kind: (typeof FAKE_TOOL_KINDS)[number], path: string): acp.ToolCallContent[] {
  if (kind === "edit") {
    return [
      {
        type: "diff",
        path,
        oldText: "before\n",
        newText: "after\n",
      },
    ]
  }
  if (kind === "execute") {
    return [
      { type: "terminal", terminalId: "fake-terminal-1" },
      { type: "content", content: { type: "text", text: "exit 0\n" } },
    ]
  }
  return [
    {
      type: "content",
      content: {
        type: "text",
        text: `synthetic ${kind} output`,
      },
    },
  ]
}

async function sessionUpdate(
  conn: acp.AgentSideConnection,
  sessionId: acp.SessionId,
  update: acp.SessionUpdate,
): Promise<void> {
  await conn.sessionUpdate({ sessionId, update })
}

function createFakeAcpChild(toAgent: (conn: acp.AgentSideConnection) => acp.Agent): AcpSpawnedChild {
  const parentToServer = new PassThrough()
  const serverToParent = new PassThrough()

  const serverWritable = Writable.toWeb(serverToParent) as WritableStream<Uint8Array>
  const serverReadable = Readable.toWeb(parentToServer) as unknown as ReadableStream<Uint8Array>
  const serverConn = new acp.AgentSideConnection(toAgent, acp.ndJsonStream(serverWritable, serverReadable))

  const events = new EventEmitter()
  const exitCode: number | null = null
  let signalCode: NodeJS.Signals | null = null

  const child = {
    pid: 900_001,
    stdin: parentToServer,
    stdout: serverToParent,
    stderr: new Readable({
      read() {
        this.push(null)
      },
    }),
    get exitCode() {
      return exitCode
    },
    get signalCode() {
      return signalCode
    },
    kill(signal?: NodeJS.Signals | number): boolean {
      if (exitCode !== null || signalCode !== null) return true
      signalCode = typeof signal === "string" ? signal : "SIGTERM"
      closeStreams(parentToServer, serverToParent)
      process.nextTick(() => events.emit("exit", 0, signalCode))
      return true
    },
    on(
      event: "exit" | "error",
      listener: ((code: number | null, signal: NodeJS.Signals | null) => void) | ((err: Error) => void),
    ): unknown {
      events.on(event, listener as (...args: unknown[]) => void)
      return child
    },
    once(event: "exit", listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown {
      events.once(event, listener)
      return child
    },
  } satisfies AcpSpawnedChild

  void serverConn
  return child
}

function closeStreams(parentToServer: PassThrough, serverToParent: PassThrough): void {
  parentToServer.destroy()
  serverToParent.destroy()
}

function selectValues(option: Extract<acp.SessionConfigOption, { type: "select" }>): Set<string> {
  const values = new Set<string>()
  for (const entry of option.options) {
    if ("options" in entry) {
      for (const child of entry.options) values.add(child.value)
    } else {
      values.add(entry.value)
    }
  }
  return values
}

function invalidConfigParams(
  profileId: string,
  params: acp.SetSessionConfigOptionRequest,
  message: string,
): acp.RequestError {
  return acp.RequestError.invalidParams(
    {
      configId: params.configId,
      value: params.value,
    },
    `fake ACP ${profileId}: ${message}`,
  )
}

function cloneSession(session: FakeAcpSessionSnapshot): FakeAcpSessionSnapshot {
  return {
    ...session,
    configOptions: cloneConfigOptions(session.configOptions),
  }
}

function cloneConfigOptions(options: acp.SessionConfigOption[]): acp.SessionConfigOption[] {
  return JSON.parse(JSON.stringify(options)) as acp.SessionConfigOption[]
}
