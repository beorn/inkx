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
import { afterEach, describe, expect, test } from "vitest"
import { __setAcpSpawnForTesting, type AcpSpawn, type AcpSpawnedChild, connectAcp } from "../src/acp-client.ts"
import type { AgentEvent } from "../src/events.ts"

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

  const child: AcpSpawnedChild = {
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

  const spawn: AcpSpawn = () => child

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
})
