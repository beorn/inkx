/**
 * Tests for `connectAcp(scope, opts)` — the scope-bound ACP client factory.
 *
 * Strategy: mock the spawn seam with a pair of in-memory streams, then run
 * a tiny in-process ACP **server** (`AgentSideConnection`) on the other end
 * of those streams. This exercises the real wire protocol end-to-end without
 * depending on any external binary (codex / gemini / copilot).
 */

import { Readable, Writable } from "node:stream"
import * as acp from "@agentclientprotocol/sdk"
import { createScope } from "@silvery/scope"
import { afterEach, describe, expect, test, vi } from "vitest"
import { __setAcpSpawnForTesting, type AcpSpawn, type AcpSpawnedChild, connectAcp } from "../src/acp-client.ts"
import type { AgentEvent } from "../src/events.ts"
import { createSessionStore } from "../src/session-store.ts"

// ---------------------------------------------------------------------------
// In-memory ACP server harness
// ---------------------------------------------------------------------------

interface FakeChildHandle {
  /** AbortController fired when `kill()` is called on the fake child. */
  killed: AbortController
  /** Resolves with the kill signal once kill() runs. */
  killSignal: Promise<NodeJS.Signals | null>
  /** Hook for triggering an unsolicited exit. */
  triggerExit(code: number | null, signal: NodeJS.Signals | null): void
}

interface ServerWiring {
  /** The Agent implementation to run on the server side of the wire. */
  agent: (conn: acp.AgentSideConnection) => acp.Agent
}

function createFakeAcpServer(opts: ServerWiring): { spawn: AcpSpawn; child: FakeChildHandle } {
  // Two duplex pipes — child stdin/stdout viewed from the parent side.
  // - The parent writes to childStdin (which feeds the server).
  // - The server writes to childStdout (which feeds the parent).
  const parentToServer = new PassThroughDuplex() // parent's stdin (server reads)
  const serverToParent = new PassThroughDuplex() // parent's stdout (server writes)

  // Build server-side AgentSideConnection. From the server's POV:
  //   - it READS what the parent WROTE (parentToServer)
  //   - it WRITES what the parent will READ (serverToParent)
  const serverWritable = Writable.toWeb(serverToParent.writable as Writable) as WritableStream<Uint8Array>
  const serverReadable = Readable.toWeb(parentToServer.readable as Readable) as ReadableStream<Uint8Array>
  const serverStream = acp.ndJsonStream(serverWritable, serverReadable)
  const serverConn = new acp.AgentSideConnection(opts.agent, serverStream)
  void serverConn // hold reference

  const killed = new AbortController()
  const exitListeners: Array<(code: number | null, signal: NodeJS.Signals | null) => void> = []
  const errorListeners: Array<(err: Error) => void> = []
  let killSignalResolve: (s: NodeJS.Signals | null) => void = () => {}
  const killSignal = new Promise<NodeJS.Signals | null>((resolve) => {
    killSignalResolve = resolve
  })

  const child = {
    pid: 99999,
    // Parent's stdin → server reads from it.
    stdin: parentToServer.writable,
    // Parent's stdout → server writes to it.
    stdout: serverToParent.readable,
    // Stderr empty.
    stderr: new Readable({
      read() {
        this.push(null)
      },
    }),
    kill(signal?: NodeJS.Signals | number): boolean {
      const s = typeof signal === "string" ? signal : signal != null ? null : ("SIGTERM" as NodeJS.Signals)
      killed.abort()
      killSignalResolve(s)
      // End streams so the connection stream observers shut down.
      try {
        parentToServer.writable.end()
      } catch {
        /* ignore */
      }
      try {
        serverToParent.writable.end()
      } catch {
        /* ignore */
      }
      // Emit exit asynchronously on the next tick.
      process.nextTick(() => {
        for (const fn of exitListeners) fn(0, s)
      })
      return true
    },
    on(event: string, listener: (...args: unknown[]) => void): unknown {
      if (event === "exit") {
        exitListeners.push(listener as (code: number | null, signal: NodeJS.Signals | null) => void)
      } else if (event === "error") errorListeners.push(listener as (err: Error) => void)
      return child
    },
  }

  const spawn: AcpSpawn = () => child as unknown as AcpSpawnedChild

  return {
    spawn,
    child: {
      killed,
      killSignal,
      triggerExit(code, signal) {
        for (const fn of exitListeners) fn(code, signal)
      },
    },
  }
}

// Minimal Node Duplex pair backed by a buffered queue. Deliberately tiny —
// avoids depending on `node:stream` PassThrough's internal scheduling
// quirks during tests.
class PassThroughDuplex {
  readable: Readable
  writable: Writable

  constructor() {
    const pending: Buffer[] = []
    let waiter: ((b: Buffer | null) => void) | null = null
    let writableEnded = false

    this.readable = new Readable({
      read() {
        // pull-driven; data arrives via writable.write below
      },
    })

    this.writable = new Writable({
      write: (chunk: Buffer, _enc, cb) => {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        if (waiter) {
          const w = waiter
          waiter = null
          w(buf)
        } else {
          pending.push(buf)
          this.readable.push(buf)
        }
        cb()
      },
      final: (cb) => {
        writableEnded = true
        this.readable.push(null)
        cb()
      },
    })

    // Fast-path: any pre-queued chunks already pushed in `write`.
    void pending
    void waiter
    void writableEnded
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

afterEach(() => {
  __setAcpSpawnForTesting(null)
})

describe("connectAcp", () => {
  test("initialize + newSession round-trip; capabilities surface in handle", async () => {
    const { spawn } = createFakeAcpServer({
      agent: () => ({
        async initialize() {
          return {
            protocolVersion: 1,
            agentCapabilities: {
              loadSession: true,
              promptCapabilities: { image: true, audio: false, embeddedContext: true },
            },
            authMethods: [
              {
                id: "test-oauth",
                name: "Test OAuth",
                type: "agent" as const,
              },
            ],
          }
        },
        async newSession({ cwd }) {
          return { sessionId: `sess-for-${cwd}` }
        },
        async authenticate() {
          return {}
        },
        async prompt() {
          return { stopReason: "end_turn" as const }
        },
        async cancel() {
          /* no-op */
        },
      }),
    })
    __setAcpSpawnForTesting(spawn)

    await using scope = createScope("test-acp")
    const session = await connectAcp(scope, {
      command: "fake-acp",
      cwd: "/tmp",
      sessionCwd: "/tmp/work",
    })

    expect(session.sessionId).toBe("sess-for-/tmp/work")
    expect(session.protocolVersion).toBe(1)
    expect(session.capabilities.loadSession).toBe(true)
    expect(session.capabilities.promptCapabilities?.image).toBe(true)
    expect(session.authMethods).toHaveLength(1)
    expect(session.authMethods[0]?.id).toBe("test-oauth")
  })

  test("scope.dispose() kills the child process", async () => {
    const { spawn, child } = createFakeAcpServer({
      agent: () => ({
        async initialize() {
          return { protocolVersion: 1, agentCapabilities: {}, authMethods: [] }
        },
        async newSession() {
          return { sessionId: "s1" }
        },
        async authenticate() {
          return {}
        },
        async prompt() {
          return { stopReason: "end_turn" as const }
        },
        async cancel() {
          /* no-op */
        },
      }),
    })
    __setAcpSpawnForTesting(spawn)

    const scope = createScope("test-dispose")
    await connectAcp(scope, { command: "fake-acp" })
    expect(child.killed.signal.aborted).toBe(false)

    await scope[Symbol.asyncDispose]()
    expect(child.killed.signal.aborted).toBe(true)
    const sig = await child.killSignal
    expect(sig).toBe("SIGTERM")
  })

  test("sessionUpdate notifications trigger AgentEvent subscribers", async () => {
    let serverConn: acp.AgentSideConnection | null = null
    const { spawn } = createFakeAcpServer({
      agent: (conn) => {
        serverConn = conn
        return {
          async initialize() {
            return { protocolVersion: 1, agentCapabilities: {}, authMethods: [] }
          },
          async newSession() {
            return { sessionId: "session-A" }
          },
          async authenticate() {
            return {}
          },
          async prompt() {
            return { stopReason: "end_turn" as const }
          },
          async cancel() {
            /* no-op */
          },
        }
      },
    })
    __setAcpSpawnForTesting(spawn)

    await using scope = createScope("test-updates")
    const session = await connectAcp(scope, { command: "fake-acp" })

    const events: AgentEvent[] = []
    session.subscribe((e) => events.push(e))

    // Server pushes an agent text chunk + a tool call.
    await serverConn!.sessionUpdate({
      sessionId: "session-A",
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "Hello" },
      },
    })
    await serverConn!.sessionUpdate({
      sessionId: "session-A",
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "tc-1",
        title: "Reading config",
        kind: "read",
        status: "pending",
      },
    })

    // Yield a tick so the receiver drains.
    await new Promise<void>((resolve) => setImmediate(resolve))

    const textDelta = events.find((e) => e.kind === "text-delta")
    expect(textDelta).toBeTruthy()
    if (textDelta?.kind === "text-delta") expect(textDelta.text).toBe("Hello")

    const toolUse = events.find((e) => e.kind === "tool-use")
    expect(toolUse).toBeTruthy()
    if (toolUse?.kind === "tool-use") {
      expect(toolUse.id).toBe("tc-1")
      expect(toolUse.name).toBe("Reading config")
    }
  })

  test("keeps distinct ACP messageIds as distinct assistant messages", async () => {
    let serverConn: acp.AgentSideConnection | null = null
    const { spawn } = createFakeAcpServer({
      agent: (conn) => {
        serverConn = conn
        return {
          async initialize() {
            return { protocolVersion: 1, agentCapabilities: {}, authMethods: [] }
          },
          async newSession() {
            return { sessionId: "session-message-boundaries" }
          },
          async authenticate() {
            return {}
          },
          async prompt() {
            await serverConn!.sessionUpdate({
              sessionId: "session-message-boundaries",
              update: {
                sessionUpdate: "agent_message_chunk",
                content: { type: "text", text: "The underlying bug is likely" },
                messageId: "msg-progress",
              },
            })
            await serverConn!.sessionUpdate({
              sessionId: "session-message-boundaries",
              update: {
                sessionUpdate: "agent_message_chunk",
                content: { type: "text", text: "Yes, if the missing space is caused by concatenation." },
                messageId: "msg-final",
              },
            })
            return { stopReason: "end_turn" as const }
          },
          async cancel() {
            /* no-op */
          },
        }
      },
    })
    __setAcpSpawnForTesting(spawn)

    await using scope = createScope("test-message-boundaries")
    const session = await connectAcp(scope, { command: "fake-acp" })
    const store = createSessionStore()
    store.bind(session)

    session.send("check boundaries")
    await new Promise<void>((resolve) => setImmediate(resolve))
    await new Promise<void>((resolve) => setImmediate(resolve))

    const messages = store.state.get().messages.filter((m) => m.role === "assistant" && m.text.length > 0)
    expect(messages.map((m) => m.text)).toEqual([
      "The underlying bug is likely",
      "Yes, if the missing space is caused by concatenation.",
    ])
  })

  test("merges ACP chunks that share a messageId", async () => {
    let serverConn: acp.AgentSideConnection | null = null
    const { spawn } = createFakeAcpServer({
      agent: (conn) => {
        serverConn = conn
        return {
          async initialize() {
            return { protocolVersion: 1, agentCapabilities: {}, authMethods: [] }
          },
          async newSession() {
            return { sessionId: "session-message-merge" }
          },
          async authenticate() {
            return {}
          },
          async prompt() {
            for (const text of ["Hello, ", "world"]) {
              await serverConn!.sessionUpdate({
                sessionId: "session-message-merge",
                update: {
                  sessionUpdate: "agent_message_chunk",
                  content: { type: "text", text },
                  messageId: "msg-one",
                },
              })
            }
            return { stopReason: "end_turn" as const }
          },
          async cancel() {
            /* no-op */
          },
        }
      },
    })
    __setAcpSpawnForTesting(spawn)

    await using scope = createScope("test-message-merge")
    const session = await connectAcp(scope, { command: "fake-acp" })
    const store = createSessionStore()
    store.bind(session)

    session.send("check merge")
    await new Promise<void>((resolve) => setImmediate(resolve))
    await new Promise<void>((resolve) => setImmediate(resolve))

    const messages = store.state.get().messages.filter((m) => m.role === "assistant" && m.text.length > 0)
    expect(messages.map((m) => m.text)).toEqual(["Hello, world"])
  })

  test("prompt round-trip — handle.prompt() returns stop reason", async () => {
    let lastPromptText = ""
    const { spawn } = createFakeAcpServer({
      agent: () => ({
        async initialize() {
          return { protocolVersion: 1, agentCapabilities: {}, authMethods: [] }
        },
        async newSession() {
          return { sessionId: "session-prompt" }
        },
        async authenticate() {
          return {}
        },
        async prompt({ prompt }) {
          const first = prompt[0]
          if (first?.type === "text") lastPromptText = first.text
          return { stopReason: "end_turn" as const }
        },
        async cancel() {
          /* no-op */
        },
      }),
    })
    __setAcpSpawnForTesting(spawn)

    await using scope = createScope("test-prompt")
    const session = await connectAcp(scope, { command: "fake-acp" })

    const result = await session.prompt([{ type: "text", text: "fix the bug" }])
    expect(result.stopReason).toBe("end_turn")
    expect(lastPromptText).toBe("fix the bug")
  })

  test("permissionHandler is invoked for requestPermission and outcome flows back", async () => {
    let serverConn: acp.AgentSideConnection | null = null
    const { spawn } = createFakeAcpServer({
      agent: (conn) => {
        serverConn = conn
        return {
          async initialize() {
            return { protocolVersion: 1, agentCapabilities: {}, authMethods: [] }
          },
          async newSession() {
            return { sessionId: "session-perm" }
          },
          async authenticate() {
            return {}
          },
          async prompt() {
            return { stopReason: "end_turn" as const }
          },
          async cancel() {
            /* no-op */
          },
        }
      },
    })
    __setAcpSpawnForTesting(spawn)

    await using scope = createScope("test-perm")
    const session = await connectAcp(scope, {
      command: "fake-acp",
      permissionHandler: async (req) => ({
        outcome: { outcome: "selected", optionId: req.options[0]!.optionId },
      }),
    })

    // Server-initiated permission request.
    const resp = await serverConn!.requestPermission({
      sessionId: session.sessionId,
      toolCall: {
        toolCallId: "tc-perm-1",
        title: "Run npm install",
        kind: "execute",
        status: "pending",
      },
      options: [
        { optionId: "allow", name: "Allow", kind: "allow_once" },
        { optionId: "deny", name: "Deny", kind: "reject_once" },
      ],
    })

    expect(resp.outcome.outcome).toBe("selected")
    if (resp.outcome.outcome === "selected") expect(resp.outcome.optionId).toBe("allow")
  })

  test("missing permissionHandler defaults to cancelled outcome with error event", async () => {
    let serverConn: acp.AgentSideConnection | null = null
    const { spawn } = createFakeAcpServer({
      agent: (conn) => {
        serverConn = conn
        return {
          async initialize() {
            return { protocolVersion: 1, agentCapabilities: {}, authMethods: [] }
          },
          async newSession() {
            return { sessionId: "session-perm-missing" }
          },
          async authenticate() {
            return {}
          },
          async prompt() {
            return { stopReason: "end_turn" as const }
          },
          async cancel() {
            /* no-op */
          },
        }
      },
    })
    __setAcpSpawnForTesting(spawn)

    await using scope = createScope("test-perm-missing")
    const session = await connectAcp(scope, { command: "fake-acp" })
    const events: AgentEvent[] = []
    session.subscribe((e) => events.push(e))

    const resp = await serverConn!.requestPermission({
      sessionId: session.sessionId,
      toolCall: {
        toolCallId: "tc-perm-2",
        title: "rm -rf /",
        kind: "execute",
        status: "pending",
      },
      options: [{ optionId: "allow", name: "Allow", kind: "allow_once" }],
    })

    expect(resp.outcome.outcome).toBe("cancelled")
    // We should have seen both a permission-request and an error event.
    expect(events.some((e) => e.kind === "permission-request")).toBe(true)
    expect(events.some((e) => e.kind === "error")).toBe(true)
  })

  // ---------------------------------------------------------------------------
  // Resume — `opts.resume.sessionId` calls loadSession, capability-gated.
  // ---------------------------------------------------------------------------

  test("opts.resume calls loadSession; sessionId reflects resumed id", async () => {
    let loadCallCount = 0
    let newCallCount = 0
    let lastLoadParams: acp.LoadSessionRequest | null = null as acp.LoadSessionRequest | null
    const { spawn } = createFakeAcpServer({
      agent: () => ({
        async initialize() {
          return {
            protocolVersion: 1,
            agentCapabilities: { loadSession: true },
            authMethods: [],
          }
        },
        async newSession() {
          newCallCount++
          return { sessionId: "newSess" }
        },
        async loadSession(params) {
          loadCallCount++
          lastLoadParams = params
          return {}
        },
        async authenticate() {
          return {}
        },
        async prompt() {
          return { stopReason: "end_turn" as const }
        },
        async cancel() {
          /* no-op */
        },
      }),
    })
    __setAcpSpawnForTesting(spawn)

    await using scope = createScope("test-resume")
    const session = await connectAcp(scope, {
      command: "fake-acp",
      cwd: "/tmp",
      sessionCwd: "/tmp/work",
      resume: { sessionId: "prior-session-123" },
    })

    expect(loadCallCount).toBe(1)
    expect(newCallCount).toBe(0)
    expect(session.sessionId).toBe("prior-session-123")
    expect(lastLoadParams?.sessionId).toBe("prior-session-123")
    expect(lastLoadParams?.cwd).toBe("/tmp/work")
    expect(lastLoadParams?.mcpServers).toEqual([])
  })

  test("opts.resume throws AcpResumeUnsupportedError when loadSession capability is false", async () => {
    const { AcpResumeUnsupportedError } = await import("../src/acp-client.ts")
    const { spawn } = createFakeAcpServer({
      agent: () => ({
        async initialize() {
          return {
            protocolVersion: 1,
            agentCapabilities: { loadSession: false },
            authMethods: [],
          }
        },
        async newSession() {
          return { sessionId: "newSess" }
        },
        async authenticate() {
          return {}
        },
        async prompt() {
          return { stopReason: "end_turn" as const }
        },
        async cancel() {
          /* no-op */
        },
      }),
    })
    __setAcpSpawnForTesting(spawn)

    await using scope = createScope("test-resume-unsupported")
    await expect(
      connectAcp(scope, {
        command: "fake-acp",
        cwd: "/tmp",
        resume: { sessionId: "x" },
      }),
    ).rejects.toBeInstanceOf(AcpResumeUnsupportedError)
  })

  test("session.loadSession() within an open connection swaps the active sessionId", async () => {
    let loadCallCount = 0
    const { spawn } = createFakeAcpServer({
      agent: () => ({
        async initialize() {
          return {
            protocolVersion: 1,
            agentCapabilities: { loadSession: true },
            authMethods: [],
          }
        },
        async newSession() {
          return { sessionId: "originalSess" }
        },
        async loadSession() {
          loadCallCount++
          return {}
        },
        async authenticate() {
          return {}
        },
        async prompt() {
          return { stopReason: "end_turn" as const }
        },
        async cancel() {
          /* no-op */
        },
      }),
    })
    __setAcpSpawnForTesting(spawn)

    await using scope = createScope("test-loadsession-method")
    const session = await connectAcp(scope, { command: "fake-acp", cwd: "/tmp" })
    expect(session.sessionId).toBe("originalSess")

    await session.loadSession("resumed-sess")
    expect(loadCallCount).toBe(1)
    expect(session.sessionId).toBe("resumed-sess")
  })

  // -------------------------------------------------------------------------
  // available_commands_update → SessionStore.slashCommands
  // (bead km-silvercode.slash-command-vault-discovery)
  //
  // The whole point of the autocomplete dropdown is to surface vault-local
  // and plugin-loaded slash commands that the spawned claude reports via
  // session-init's `slash_commands`. The ACP transport's analogue is the
  // `available_commands_update` SessionUpdate. Pre-fix, that update only
  // emitted a `status` AgentEvent — SessionState.slashCommands stayed [] so
  // the palette never saw `/file`, `/groom-docs`, etc.
  //
  // Post-fix, the update emits `slash-commands-update` and the session-store
  // applies it, mirroring what the legacy stream-json session-init path
  // does for the spawnClaude transport.
  // -------------------------------------------------------------------------

  test("available_commands_update populates SessionState.slashCommands", async () => {
    let serverConn: acp.AgentSideConnection | null = null
    const { spawn } = createFakeAcpServer({
      agent: (conn) => {
        serverConn = conn
        return {
          async initialize() {
            return { protocolVersion: 1, agentCapabilities: {}, authMethods: [] }
          },
          async newSession() {
            return { sessionId: "session-cmds" }
          },
          async authenticate() {
            return {}
          },
          async prompt() {
            return { stopReason: "end_turn" as const }
          },
          async cancel() {
            /* no-op */
          },
        }
      },
    })
    __setAcpSpawnForTesting(spawn)

    await using scope = createScope("test-slash-commands")
    const session = await connectAcp(scope, { command: "fake-acp" })

    const store = createSessionStore()
    const unsubscribe = store.bind(session)
    scope.use({
      [Symbol.asyncDispose]() {
        unsubscribe()
        return Promise.resolve()
      },
    })

    await serverConn!.sessionUpdate({
      sessionId: "session-cmds",
      update: {
        sessionUpdate: "available_commands_update",
        availableCommands: [
          { name: "file", description: "Open a file" },
          { name: "groom-docs", description: "Sweep through docs" },
          { name: "do", description: "" },
        ],
      },
    })

    // Yield a tick so the receiver drains.
    await new Promise<void>((resolve) => setImmediate(resolve))

    const state = store.state.get()
    expect(state.slashCommands).toEqual(["file", "groom-docs", "do"])
  })

  test("available_commands_update replaces (not appends) on subsequent updates", async () => {
    // ACP semantics: each update advertises the FULL current list of
    // available commands. A plugin reload that drops a command must result
    // in the dropped command disappearing from SessionState.slashCommands,
    // not lingering from the previous snapshot.
    let serverConn: acp.AgentSideConnection | null = null
    const { spawn } = createFakeAcpServer({
      agent: (conn) => {
        serverConn = conn
        return {
          async initialize() {
            return { protocolVersion: 1, agentCapabilities: {}, authMethods: [] }
          },
          async newSession() {
            return { sessionId: "session-replace" }
          },
          async authenticate() {
            return {}
          },
          async prompt() {
            return { stopReason: "end_turn" as const }
          },
          async cancel() {
            /* no-op */
          },
        }
      },
    })
    __setAcpSpawnForTesting(spawn)

    await using scope = createScope("test-slash-commands-replace")
    const session = await connectAcp(scope, { command: "fake-acp" })

    const store = createSessionStore()
    const unsubscribe = store.bind(session)
    scope.use({
      [Symbol.asyncDispose]() {
        unsubscribe()
        return Promise.resolve()
      },
    })

    await serverConn!.sessionUpdate({
      sessionId: "session-replace",
      update: {
        sessionUpdate: "available_commands_update",
        availableCommands: [
          { name: "file", description: "" },
          { name: "old", description: "" },
        ],
      },
    })
    await serverConn!.sessionUpdate({
      sessionId: "session-replace",
      update: {
        sessionUpdate: "available_commands_update",
        availableCommands: [
          { name: "file", description: "" },
          { name: "fresh", description: "" },
        ],
      },
    })

    await new Promise<void>((resolve) => setImmediate(resolve))

    const state = store.state.get()
    expect(state.slashCommands).toEqual(["file", "fresh"])
  })
})

// ---------------------------------------------------------------------------
// send() → turn-end propagation (bead km-silvercode.thinking-loop-after-bash)
// ---------------------------------------------------------------------------
//
// Bug: AcpAgentSession.send() fires agent.prompt() in fire-and-forget mode.
// The PromptResponse (stopReason: "end_turn") resolves but is discarded —
// no turn-end event is ever emitted on the bus. SessionStore stays in
// "thinking" forever → ActivityIndicator never clears → 98% CPU busy loop.
//
// Fix: after agent.prompt() resolves, emit a turn-end AgentEvent with the
// stopReason from the response. SessionStore.apply("turn-end") sets
// status = "idle" which clears the ActivityIndicator.

describe("send() emits turn-end after prompt resolves", () => {
  test("send() emits a turn-end event with stopReason=end_turn after prompt completes", async () => {
    let promptResolve: (() => void) | null = null
    const promptFinished = new Promise<void>((resolve) => {
      promptResolve = resolve
    })

    const { spawn } = createFakeAcpServer({
      agent: () => ({
        async initialize() {
          return { protocolVersion: 1, agentCapabilities: {}, authMethods: [] }
        },
        async newSession() {
          return { sessionId: "session-send-turn-end" }
        },
        async authenticate() {
          return {}
        },
        async prompt() {
          await promptFinished
          return { stopReason: "end_turn" as const }
        },
        async cancel() {
          /* no-op */
        },
      }),
    })
    __setAcpSpawnForTesting(spawn)

    await using scope = createScope("test-send-turn-end")
    const session = await connectAcp(scope, { command: "fake-acp" })

    const events: AgentEvent[] = []
    session.subscribe((e) => events.push(e))

    // send() is fire-and-forget from the caller's perspective; prompt
    // hasn't resolved yet so no turn-end should have fired.
    session.send("ls")
    expect(events.some((e) => e.kind === "turn-end")).toBe(false)

    // Resolve the prompt — turn-end should now arrive on the bus.
    promptResolve!()
    // Wait a tick for the microtask / promise chain to settle.
    await new Promise<void>((resolve) => setImmediate(resolve))
    await new Promise<void>((resolve) => setImmediate(resolve))

    const turnEnd = events.find((e) => e.kind === "turn-end")
    expect(turnEnd, "turn-end event must arrive after prompt resolves").toBeTruthy()
    if (turnEnd?.kind === "turn-end") {
      expect(turnEnd.stopReason).toBe("end_turn")
    }
  })

  test("send() transitions SessionStore status to idle after prompt resolves", async () => {
    let promptResolve: (() => void) | null = null
    const promptFinished = new Promise<void>((resolve) => {
      promptResolve = resolve
    })

    let serverConn: acp.AgentSideConnection | null = null
    const { spawn } = createFakeAcpServer({
      agent: (conn) => {
        serverConn = conn
        return {
          async initialize() {
            return { protocolVersion: 1, agentCapabilities: {}, authMethods: [] }
          },
          async newSession() {
            return { sessionId: "session-status-idle" }
          },
          async authenticate() {
            return {}
          },
          async prompt() {
            // Simulate the agent doing work: emit an agent text chunk before completing.
            await serverConn!.sessionUpdate({
              sessionId: "session-status-idle",
              update: {
                sessionUpdate: "agent_message_chunk",
                content: { type: "text", text: "listing files" },
              },
            })
            await promptFinished
            return { stopReason: "end_turn" as const }
          },
          async cancel() {
            /* no-op */
          },
        }
      },
    })
    __setAcpSpawnForTesting(spawn)

    await using scope = createScope("test-status-idle")
    const session = await connectAcp(scope, { command: "fake-acp" })

    const store = createSessionStore()
    store.bind(session)

    // send() initiates the turn — store should flip to "thinking" after
    // the agent_message_chunk notification arrives.
    session.send("ls")

    // Yield for the sessionUpdate notification chain to fire.
    await new Promise<void>((resolve) => setImmediate(resolve))
    await new Promise<void>((resolve) => setImmediate(resolve))

    // Verify the store saw some activity (text-delta from the chunk).
    // Status may be "thinking" or "tool-running" depending on ordering.
    const statusBeforeEnd = store.state.get().status
    expect(["thinking", "tool-running", "idle"]).toContain(statusBeforeEnd)

    // Now resolve the prompt — status must return to idle.
    promptResolve!()
    await new Promise<void>((resolve) => setImmediate(resolve))
    await new Promise<void>((resolve) => setImmediate(resolve))

    const statusAfterEnd = store.state.get().status
    expect(
      statusAfterEnd,
      `SessionStore status must be "idle" after end_turn, got "${statusAfterEnd}". ` +
        "This is bead km-silvercode.thinking-loop-after-bash: send() discards the " +
        "PromptResponse so no turn-end event fires and the ActivityIndicator never clears.",
    ).toBe("idle")
  })
})

// ---------------------------------------------------------------------------
// Turn lifecycle robustness — see km-silvercode.claude-acp-wire-bugs
//
// Regression net for the recurring "stuck in 'doing' mode" bug. The wire
// has no native turn boundary, so a forgotten or skipped turn-end emission
// (on rejection, on cancellation, on a half-stuck prior turn) leaves the
// status FSM trapped. These tests pin every settle path.
// ---------------------------------------------------------------------------

describe("turn lifecycle: turn-end fires on every settle path", () => {
  test("prompt() emits turn-end after successful resolve", async () => {
    const { spawn } = createFakeAcpServer({
      agent: () => ({
        async initialize() {
          return { protocolVersion: 1, agentCapabilities: {}, authMethods: [] }
        },
        async newSession() {
          return { sessionId: "session-prompt-success" }
        },
        async authenticate() {
          return {}
        },
        async prompt() {
          return { stopReason: "end_turn" as const }
        },
        async cancel() {
          /* no-op */
        },
      }),
    })
    __setAcpSpawnForTesting(spawn)

    await using scope = createScope("test-prompt-success")
    const session = await connectAcp(scope, { command: "fake-acp" })

    const events: AgentEvent[] = []
    session.subscribe((e) => events.push(e))

    await session.prompt([{ type: "text", text: "ping" }])
    await new Promise<void>((resolve) => setImmediate(resolve))

    const turnEnd = events.find((e) => e.kind === "turn-end")
    expect(turnEnd, "prompt() must synthesize turn-end on resolve").toBeTruthy()
  })

  test("prompt() emits turn-end even when agent.prompt() rejects", async () => {
    // The ACP SDK logs handler rejections to console.error; suppress that
    // so the global no-stray-console guard doesn't trip on a deliberate
    // failure path.
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const { spawn } = createFakeAcpServer({
      agent: () => ({
        async initialize() {
          return { protocolVersion: 1, agentCapabilities: {}, authMethods: [] }
        },
        async newSession() {
          return { sessionId: "session-prompt-reject" }
        },
        async authenticate() {
          return {}
        },
        async prompt(): Promise<acp.PromptResponse> {
          throw new Error("synthetic agent failure")
        },
        async cancel() {
          /* no-op */
        },
      }),
    })
    __setAcpSpawnForTesting(spawn)

    await using scope = createScope("test-prompt-reject")
    const session = await connectAcp(scope, { command: "fake-acp" })

    const events: AgentEvent[] = []
    session.subscribe((e) => events.push(e))

    try {
      // The SDK transforms thrown errors into JSON-RPC "Internal error"
      // responses; what propagates to the caller is the framed message,
      // not the original `synthetic agent failure` text.
      await expect(session.prompt([{ type: "text", text: "boom" }])).rejects.toThrow()
      // Wait for the SDK's internal error-logging chain to settle so the
      // spy (still active) absorbs all of it.
      await new Promise<void>((resolve) => setImmediate(resolve))
      await new Promise<void>((resolve) => setImmediate(resolve))
      await new Promise<void>((resolve) => setImmediate(resolve))

      const turnEnd = events.find((e) => e.kind === "turn-end")
      expect(turnEnd, "rejected prompt MUST still synthesize turn-end so status can return to idle").toBeTruthy()
      if (turnEnd?.kind === "turn-end") {
        // Rejection maps to refusal stopReason — distinct from end_turn.
        expect(turnEnd.stopReason).toBe("refusal")
      }
    } finally {
      errSpy.mockRestore()
    }
  })

  test("send() emits turn-end on prompt rejection (not just success)", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const { spawn } = createFakeAcpServer({
      agent: () => ({
        async initialize() {
          return { protocolVersion: 1, agentCapabilities: {}, authMethods: [] }
        },
        async newSession() {
          return { sessionId: "session-send-reject" }
        },
        async authenticate() {
          return {}
        },
        async prompt(): Promise<acp.PromptResponse> {
          throw new Error("synthetic send failure")
        },
        async cancel() {
          /* no-op */
        },
      }),
    })
    __setAcpSpawnForTesting(spawn)

    await using scope = createScope("test-send-reject")
    const session = await connectAcp(scope, { command: "fake-acp" })

    const events: AgentEvent[] = []
    session.subscribe((e) => events.push(e))

    session.send("boom")
    // Wait for the rejection chain to settle.
    await new Promise<void>((resolve) => setImmediate(resolve))
    await new Promise<void>((resolve) => setImmediate(resolve))
    await new Promise<void>((resolve) => setImmediate(resolve))

    try {
      // Wait extra ticks for the rejection chain + SDK error logging to settle.
      await new Promise<void>((resolve) => setImmediate(resolve))
      const turnEnd = events.find((e) => e.kind === "turn-end")
      expect(turnEnd, "fire-and-forget send() must still emit turn-end on rejection").toBeTruthy()
    } finally {
      errSpy.mockRestore()
    }
  })

  test("self-heal: new prompt while prior turn unsettled fires turn-end for the prior", async () => {
    // Construct a stuck-prior scenario by holding the first prompt's
    // sessionUpdate stream open without ever resolving the RPC. A second
    // prompt arrives — the helper should emit turn-end for the stale turn
    // before starting the new one, so status doesn't pile up.
    let firstPromptResolve: (() => void) | null = null
    const firstFinished = new Promise<void>((resolve) => {
      firstPromptResolve = resolve
    })
    let promptCount = 0

    const { spawn } = createFakeAcpServer({
      agent: () => ({
        async initialize() {
          return { protocolVersion: 1, agentCapabilities: {}, authMethods: [] }
        },
        async newSession() {
          return { sessionId: "session-self-heal" }
        },
        async authenticate() {
          return {}
        },
        async prompt() {
          promptCount++
          if (promptCount === 1) await firstFinished
          return { stopReason: "end_turn" as const }
        },
        async cancel() {
          /* no-op */
        },
      }),
    })
    __setAcpSpawnForTesting(spawn)

    await using scope = createScope("test-self-heal")
    const session = await connectAcp(scope, { command: "fake-acp" })

    const events: AgentEvent[] = []
    session.subscribe((e) => events.push(e))

    // Fire the first prompt — it'll hang on firstFinished.
    const firstPromptPromise = session.prompt([{ type: "text", text: "first" }])

    // Fire a second prompt while the first is still hanging. The helper
    // should self-heal: emit turn-end for the stuck first turn before
    // starting the second.
    void session.prompt([{ type: "text", text: "second" }]).catch(() => {
      /* may or may not resolve depending on scheduling */
    })
    await new Promise<void>((resolve) => setImmediate(resolve))
    await new Promise<void>((resolve) => setImmediate(resolve))

    const turnEnds = events.filter((e) => e.kind === "turn-end")
    expect(turnEnds.length, "self-heal must emit turn-end for the stale prior turn").toBeGreaterThanOrEqual(1)
    const errors = events.filter((e) => e.kind === "error")
    expect(
      errors.some((e) => e.kind === "error" && /never settled|unsettled/i.test(e.message)),
      "self-heal must surface a diagnostic error so the cause is visible",
    ).toBe(true)

    // Cleanup: let the first prompt resolve so its promise doesn't leak.
    firstPromptResolve!()
    await firstPromptPromise.catch(() => {
      /* the synthetic turn-end already fired; the real resolve is bonus */
    })
  })

  test("late sessionUpdate after prompt() resolves merges into the same turnId (not a new MessageEntry)", async () => {
    // Repro for "session reply chunked into multiple sessions" — late
    // sessionUpdate notifications arriving AFTER prompt() resolves but
    // BEFORE the next prompt() starts must reuse the prior turnId. Without
    // the fallback, each late notification mints a fresh
    // `acp-turn-${Date.now()}` and the chat scrollback splits one logical
    // turn across multiple message cards.
    // Bead: km-silvercode.claude-acp-wire-bugs.
    let lateConn: acp.AgentSideConnection | null = null
    const { spawn } = createFakeAcpServer({
      agent: (conn) => {
        lateConn = conn
        return {
          async initialize() {
            return { protocolVersion: 1, agentCapabilities: {}, authMethods: [] }
          },
          async newSession() {
            return { sessionId: "session-late-straggler" }
          },
          async authenticate() {
            return {}
          },
          async prompt({ sessionId }) {
            // Emit one update during the turn — establishes the active turnId.
            await conn.sessionUpdate({
              sessionId,
              update: {
                sessionUpdate: "agent_message_chunk",
                content: { type: "text", text: "during-turn" },
              },
            })
            return { stopReason: "end_turn" as const }
          },
          async cancel() {
            /* no-op */
          },
        }
      },
    })
    __setAcpSpawnForTesting(spawn)

    await using scope = createScope("test-late-straggler")
    const session = await connectAcp(scope, { command: "fake-acp" })

    const events: AgentEvent[] = []
    session.subscribe((e) => events.push(e))

    // First (and only) prompt — turn ends, currentTurnId clears, but
    // lastMessageTurnId should remain so a late straggler glues onto it.
    await session.prompt([{ type: "text", text: "ping" }])
    await new Promise<void>((resolve) => setImmediate(resolve))

    // Capture the turnId of every text-delta + turn-end so we can compare
    // pre- and post-turn-end stragglers.
    const beforeTurnIds = events.filter((e) => e.kind === "text-delta").map((e) => (e as { turnId: string }).turnId)
    expect(beforeTurnIds.length).toBeGreaterThan(0)
    const liveTurnId = beforeTurnIds[0]!

    // Now the late straggler — fired AFTER prompt() resolved but before any
    // subsequent prompt. Without the fallback, this mints a fresh turnId.
    await lateConn!.sessionUpdate({
      sessionId: "session-late-straggler" as acp.SessionId,
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "post-turn-straggler" },
      },
    })
    await new Promise<void>((resolve) => setImmediate(resolve))
    await new Promise<void>((resolve) => setImmediate(resolve))

    const stragglerDeltas = events
      .filter((e) => e.kind === "text-delta")
      .filter((e) => (e as { text: string }).text === "post-turn-straggler")
    expect(stragglerDeltas, "the late straggler must surface as a text-delta").toHaveLength(1)
    const stragglerTurnId = (stragglerDeltas[0] as { turnId: string }).turnId
    expect(
      stragglerTurnId,
      "late straggler must reuse the just-ended turnId — otherwise the UI splits one turn across multiple MessageEntry cards",
    ).toBe(liveTurnId)
  })
})

// ---------------------------------------------------------------------------
// buildNonJsonLineFilter — stdout filter unit tests
// ---------------------------------------------------------------------------

import { buildNonJsonLineFilter } from "../src/acp-client.ts"

describe("buildNonJsonLineFilter", () => {
  function makeSource(chunks: string[]): Readable {
    const r = new Readable({ read() {} })
    process.nextTick(() => {
      for (const c of chunks) r.push(c)
      r.push(null)
    })
    return r
  }

  async function collect(source: Readable): Promise<{ passed: string[]; dropped: string[] }> {
    const dropped: string[] = []
    const filtered = buildNonJsonLineFilter(source, (l) => dropped.push(l))
    const passed: string[] = []
    for await (const chunk of filtered) {
      passed.push((chunk as Buffer).toString("utf8"))
    }
    return { passed, dropped }
  }

  test("passes JSON lines, drops non-JSON lines", async () => {
    const { passed, dropped } = await collect(
      makeSource(['{"a":1}\nSkipping project agents due to untrusted folder.\n{"b":2}\n']),
    )
    expect(passed.join("")).toBe('{"a":1}\n{"b":2}\n')
    expect(dropped).toEqual(["Skipping project agents due to untrusted folder."])
  })

  test("empty lines are silently dropped (not surfaced to onDropped)", async () => {
    const { passed, dropped } = await collect(makeSource(['{"a":1}\n\n{"b":2}\n']))
    expect(passed.join("")).toBe('{"a":1}\n{"b":2}\n')
    expect(dropped).toHaveLength(0)
  })

  test("all-JSON stream passes through unchanged", async () => {
    const { passed, dropped } = await collect(makeSource(['{"x":1}\n{"y":2}\n']))
    expect(passed.join("")).toBe('{"x":1}\n{"y":2}\n')
    expect(dropped).toHaveLength(0)
  })

  test("handles partial lines split across chunks", async () => {
    const { passed, dropped } = await collect(makeSource(['{"a":', "1}\nSkipp", "ing\n", '{"b":2}\n']))
    expect(passed.join("")).toBe('{"a":1}\n{"b":2}\n')
    expect(dropped).toEqual(["Skipping"])
  })

  test("non-JSON-only stream — everything dropped", async () => {
    const { passed, dropped } = await collect(
      makeSource(["Both GOOGLE_API_KEY and GEMINI_API_KEY are set. Using GOOGLE_API_KEY.\n"]),
    )
    expect(passed.join("")).toBe("")
    expect(dropped).toEqual(["Both GOOGLE_API_KEY and GEMINI_API_KEY are set. Using GOOGLE_API_KEY."])
  })

  test("gemini stdout-pollution scenario: info lines before first JSON", async () => {
    // Reproduces the actual failure: info lines emitted before newSession response.
    const noise =
      "Skipping project agents due to untrusted folder. To enable, ensure that the project root is trusted.\n"
    const json1 = '{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":1}}\n'
    const json2 = '{"jsonrpc":"2.0","id":2,"result":{"sessionId":"s1"}}\n'
    const { passed, dropped } = await collect(makeSource([noise, json1, json2]))
    expect(passed.join("")).toBe(json1 + json2)
    expect(dropped).toHaveLength(1)
    expect(dropped[0]).toContain("Skipping project agents")
  })
})
