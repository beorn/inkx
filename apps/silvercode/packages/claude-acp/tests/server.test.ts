/**
 * `runClaudeAcpServer({ stdin, stdout })` — end-to-end ACP wire test.
 *
 * Strategy: instead of spawning a real `claude` binary, we mock
 * `node:child_process` so that `spawnClaude` (inside `@km/agent-harness`)
 * receives canned JSONL bytes on stdout. The mock pattern matches what
 * `agent-harness/tests/acp-adapter-claude.test.ts` uses — same fake child,
 * same JSONL fixtures.
 *
 * On the ACP wire side, we use a `MessageChannel`-style pair of streams:
 * the test acts as the **client** (`ClientSideConnection`) and the server
 * (`AgentSideConnection`, built by `runClaudeAcpServer`) is on the other
 * end. This exercises the real ACP JSON-RPC framing end-to-end without
 * touching disk or network.
 *
 * Bead: `km-silvercode.acp-claude-server`.
 */

import { EventEmitter, PassThrough, Readable, Writable } from "node:stream"
import * as acp from "@agentclientprotocol/sdk"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const FAKE_PID = 525252

// ---------------------------------------------------------------------------
// child_process mock — emits caller-supplied JSONL on stdout, then exits.
// ---------------------------------------------------------------------------

type FakeChild = EventEmitter & {
  stdin: Writable
  stdout: Readable
  stderr: Readable
  pid: number
  kill: (signal?: NodeJS.Signals | number) => boolean
  killed: boolean
}

let scriptedJsonl: string[] = []

function setScript(lines: string[]): void {
  scriptedJsonl = lines
}

function createFakeChild(): FakeChild {
  const bus = new EventEmitter() as FakeChild
  bus.pid = FAKE_PID
  bus.killed = false

  bus.stdin = new Writable({
    write(_c, _e, cb) {
      cb()
    },
  })

  const lines = [...scriptedJsonl]
  bus.stdout = new Readable({
    read() {
      // pull-driven; data pushed below
    },
  })
  bus.stderr = new Readable({
    read() {
      this.push(null)
    },
  })

  // Defer JSONL push so the parent (spawnClaude) has time to attach
  // its `data` listener.
  process.nextTick(() => {
    for (const line of lines) {
      bus.stdout.push(line + "\n")
    }
    bus.stdout.push(null)
    setTimeout(() => {
      bus.emit("exit", 0, null)
    }, 5)
  })

  bus.kill = () => {
    if (bus.killed) return true
    bus.killed = true
    process.nextTick(() => bus.emit("exit", null, "SIGTERM"))
    return true
  }
  return bus
}

vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process")
  return {
    ...actual,
    spawn: () => createFakeChild() as unknown as ReturnType<typeof actual.spawn>,
  }
})

const originalProcessKill = process.kill
beforeEach(() => {
  process.kill = ((pid: number, signal?: string | number): true => {
    if (pid === -FAKE_PID || pid === FAKE_PID) return true
    return originalProcessKill(pid, signal as NodeJS.Signals | number)
  }) as typeof process.kill
})
afterEach(() => {
  process.kill = originalProcessKill
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// In-memory wire pair — client speaks ACP to server over real ndJsonStream.
// ---------------------------------------------------------------------------

interface WirePair {
  /** What the test (client) writes — the server will read it. */
  clientStdout: PassThrough
  /** What the test (client) reads — the server has written it. */
  clientStdin: PassThrough
  /** What the server reads (= clientStdout). */
  serverStdin: PassThrough
  /** What the server writes (= clientStdin). */
  serverStdout: PassThrough
}

function createWirePair(): WirePair {
  // serverStdin = client → server pipe; serverStdout = server → client pipe.
  const clientToServer = new PassThrough()
  const serverToClient = new PassThrough()
  return {
    clientStdout: clientToServer,
    clientStdin: serverToClient,
    serverStdin: clientToServer,
    serverStdout: serverToClient,
  }
}

// ---------------------------------------------------------------------------
// Test client — minimal `acp.Client` impl that records sessionUpdate notifications.
// ---------------------------------------------------------------------------

interface ClientHarness {
  conn: acp.ClientSideConnection
  updates: acp.SessionNotification[]
}

function buildClient(wire: WirePair): ClientHarness {
  const updates: acp.SessionNotification[] = []
  const writable = Writable.toWeb(wire.clientStdout) as WritableStream<Uint8Array>
  const readable = Readable.toWeb(wire.clientStdin) as ReadableStream<Uint8Array>
  const stream = acp.ndJsonStream(writable, readable)

  const conn = new acp.ClientSideConnection(
    () => ({
      async sessionUpdate(params) {
        updates.push(params)
      },
      async requestPermission() {
        return { outcome: { outcome: "cancelled" as const } }
      },
    }),
    stream,
  )
  return { conn, updates }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function settle(ms = 30): Promise<void> {
  await new Promise((r) => setTimeout(r, ms))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runClaudeAcpServer — ACP wire end-to-end", () => {
  test("initialize round-trip — protocolVersion 1, auth methods exposed", async () => {
    setScript([])
    const wire = createWirePair()
    const { runClaudeAcpServer } = await import("../src/server.ts")

    // Run the server in the background — it resolves when the wire closes.
    const serverPromise = runClaudeAcpServer({
      stdin: wire.serverStdin,
      stdout: wire.serverStdout,
    })

    const { conn } = buildClient(wire)
    const init = await conn.initialize({ protocolVersion: 1 })

    expect(init.protocolVersion).toBe(1)
    expect(init.agentCapabilities).toBeDefined()
    expect(init.agentCapabilities?.loadSession).toBe(false)
    expect(init.authMethods).toBeDefined()
    expect(init.authMethods!.some((m) => m.id === "claude-login")).toBe(true)
    expect(init.authMethods!.some((m) => m.id === "anthropic-api-key")).toBe(true)

    // Tear down cleanly.
    wire.clientStdout.end()
    wire.serverStdout.end()
    await settle(20)
    await serverPromise.catch(() => {})
  })

  test("newSession spawns claude and returns an ACP session id", async () => {
    setScript([
      JSON.stringify({
        type: "system",
        subtype: "init",
        cwd: "/work",
        session_id: "claude-internal-1",
        tools: [],
        mcp_servers: [],
        model: "claude-sonnet-4-6",
        permissionMode: "auto",
      }),
    ])
    const wire = createWirePair()
    const { runClaudeAcpServer } = await import("../src/server.ts")

    const serverPromise = runClaudeAcpServer({
      stdin: wire.serverStdin,
      stdout: wire.serverStdout,
    })

    const { conn } = buildClient(wire)
    await conn.initialize({ protocolVersion: 1 })
    const result = await conn.newSession({ cwd: "/work", mcpServers: [] })

    expect(result.sessionId).toMatch(/^claude-acp-/)

    wire.clientStdout.end()
    wire.serverStdout.end()
    await settle(20)
    await serverPromise.catch(() => {})
  })

  test("prompt round-trip — text deltas surface as agent_message_chunk notifications", async () => {
    setScript([
      JSON.stringify({
        type: "system",
        subtype: "init",
        cwd: "/work",
        session_id: "sess-1",
        tools: [],
        mcp_servers: [],
        model: "claude-sonnet-4-6",
        permissionMode: "auto",
      }),
      JSON.stringify({
        type: "stream_event",
        session_id: "sess-1",
        event: { type: "message_start", message: { id: "msg-1", role: "assistant", content: [] } },
      }),
      JSON.stringify({
        type: "stream_event",
        session_id: "sess-1",
        event: { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
      }),
      JSON.stringify({
        type: "stream_event",
        session_id: "sess-1",
        event: {
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: "Hello, " },
        },
      }),
      JSON.stringify({
        type: "stream_event",
        session_id: "sess-1",
        event: {
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: "world." },
        },
      }),
      JSON.stringify({
        type: "stream_event",
        session_id: "sess-1",
        event: { type: "content_block_stop", index: 0 },
      }),
      JSON.stringify({
        type: "stream_event",
        session_id: "sess-1",
        event: {
          type: "message_delta",
          delta: { stop_reason: "end_turn" },
          usage: { input_tokens: 10, output_tokens: 25 },
        },
      }),
      JSON.stringify({
        type: "stream_event",
        session_id: "sess-1",
        event: { type: "message_stop" },
      }),
      JSON.stringify({
        type: "result",
        subtype: "success",
        session_id: "sess-1",
        is_error: false,
        duration_ms: 100,
        num_turns: 1,
        result: "Hello, world.",
        total_cost_usd: 0.0001,
        usage: { input_tokens: 10, output_tokens: 25 },
      }),
    ])
    const wire = createWirePair()
    const { runClaudeAcpServer } = await import("../src/server.ts")

    const serverPromise = runClaudeAcpServer({
      stdin: wire.serverStdin,
      stdout: wire.serverStdout,
    })

    const { conn, updates } = buildClient(wire)
    await conn.initialize({ protocolVersion: 1 })
    const session = await conn.newSession({ cwd: "/work", mcpServers: [] })

    const result = await conn.prompt({
      sessionId: session.sessionId,
      prompt: [{ type: "text", text: "Say hello" }],
    })

    expect(result.stopReason).toBe("end_turn")

    // The server should have echoed the user message + emitted agent message chunks.
    const userChunks = updates.filter((u) => u.update.sessionUpdate === "user_message_chunk")
    const agentChunks = updates.filter((u) => u.update.sessionUpdate === "agent_message_chunk")

    expect(userChunks.length).toBeGreaterThan(0)
    expect(agentChunks.length).toBeGreaterThanOrEqual(2) // "Hello, " + "world."

    // Concatenate all assistant chunk texts; should equal "Hello, world."
    const combinedText = agentChunks
      .map((u) => {
        const update = u.update as Extract<acp.SessionUpdate, { sessionUpdate: "agent_message_chunk" }>
        return update.content.type === "text" ? update.content.text : ""
      })
      .join("")
    expect(combinedText).toBe("Hello, world.")

    wire.clientStdout.end()
    wire.serverStdout.end()
    await settle(20)
    await serverPromise.catch(() => {})
  })

  test("tool_use → tool_result drives tool_call + tool_call_update notifications", async () => {
    setScript([
      JSON.stringify({
        type: "system",
        subtype: "init",
        cwd: "/work",
        session_id: "sess-1",
        tools: ["Bash"],
        mcp_servers: [],
        model: "claude-sonnet-4-6",
        permissionMode: "auto",
      }),
      JSON.stringify({
        type: "stream_event",
        session_id: "sess-1",
        event: { type: "message_start", message: { id: "msg-1", role: "assistant", content: [] } },
      }),
      JSON.stringify({
        type: "stream_event",
        session_id: "sess-1",
        event: {
          type: "content_block_start",
          index: 0,
          content_block: { type: "tool_use", id: "tool-1", name: "Bash", input: {} },
        },
      }),
      JSON.stringify({
        type: "stream_event",
        session_id: "sess-1",
        event: {
          type: "content_block_delta",
          index: 0,
          delta: { type: "input_json_delta", partial_json: '{"command":"ls"}' },
        },
      }),
      JSON.stringify({
        type: "stream_event",
        session_id: "sess-1",
        event: { type: "content_block_stop", index: 0 },
      }),
      JSON.stringify({
        type: "user",
        session_id: "sess-1",
        message: {
          role: "user",
          content: [{ type: "tool_result", tool_use_id: "tool-1", content: "file1.ts\nfile2.ts", is_error: false }],
        },
      }),
      JSON.stringify({
        type: "stream_event",
        session_id: "sess-1",
        event: { type: "message_delta", delta: { stop_reason: "end_turn" } },
      }),
      JSON.stringify({
        type: "stream_event",
        session_id: "sess-1",
        event: { type: "message_stop" },
      }),
      JSON.stringify({
        type: "result",
        subtype: "success",
        session_id: "sess-1",
        is_error: false,
        duration_ms: 50,
        num_turns: 1,
        result: "",
        total_cost_usd: 0,
        usage: { input_tokens: 5, output_tokens: 5 },
      }),
    ])
    const wire = createWirePair()
    const { runClaudeAcpServer } = await import("../src/server.ts")

    const serverPromise = runClaudeAcpServer({
      stdin: wire.serverStdin,
      stdout: wire.serverStdout,
    })

    const { conn, updates } = buildClient(wire)
    await conn.initialize({ protocolVersion: 1 })
    const session = await conn.newSession({ cwd: "/work", mcpServers: [] })
    await conn.prompt({
      sessionId: session.sessionId,
      prompt: [{ type: "text", text: "List files" }],
    })

    const toolCallUpdates = updates.filter(
      (u) => u.update.sessionUpdate === "tool_call" || u.update.sessionUpdate === "tool_call_update",
    )
    expect(toolCallUpdates.length).toBeGreaterThanOrEqual(2)

    const toolCallStart = updates.find((u) => u.update.sessionUpdate === "tool_call")
    expect(toolCallStart).toBeDefined()
    const startUpdate = toolCallStart!.update as Extract<acp.SessionUpdate, { sessionUpdate: "tool_call" }>
    expect(startUpdate.title).toBe("Bash")
    expect(startUpdate.toolCallId).toBe("tool-1")

    const toolCallEnd = updates.find((u) => u.update.sessionUpdate === "tool_call_update")
    expect(toolCallEnd).toBeDefined()
    const endUpdate = toolCallEnd!.update as Extract<acp.SessionUpdate, { sessionUpdate: "tool_call_update" }>
    expect(endUpdate.status).toBe("completed")

    wire.clientStdout.end()
    wire.serverStdout.end()
    await settle(20)
    await serverPromise.catch(() => {})
  })

  test("cancel notification settles the in-flight prompt", async () => {
    // Empty script — no result line means the spawned 'claude' would hang
    // waiting for more input. cancel() should settle the prompt.
    setScript([
      JSON.stringify({
        type: "system",
        subtype: "init",
        cwd: "/work",
        session_id: "sess-1",
        tools: [],
        mcp_servers: [],
        model: "claude-sonnet-4-6",
        permissionMode: "auto",
      }),
    ])
    const wire = createWirePair()
    const { runClaudeAcpServer } = await import("../src/server.ts")

    const serverPromise = runClaudeAcpServer({
      stdin: wire.serverStdin,
      stdout: wire.serverStdout,
    })

    const { conn } = buildClient(wire)
    await conn.initialize({ protocolVersion: 1 })
    const session = await conn.newSession({ cwd: "/work", mcpServers: [] })

    // Start a prompt, then cancel. The prompt should resolve with cancelled
    // (or end_turn if the spawned-process exit fires first). Either way it
    // resolves rather than hanging.
    const promptPromise = conn.prompt({
      sessionId: session.sessionId,
      prompt: [{ type: "text", text: "Will be cancelled" }],
    })
    await settle(10)
    await conn.cancel({ sessionId: session.sessionId })

    const result = await promptPromise
    expect(["cancelled", "end_turn"]).toContain(result.stopReason)

    wire.clientStdout.end()
    wire.serverStdout.end()
    await settle(20)
    await serverPromise.catch(() => {})
  })
})
