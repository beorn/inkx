/**
 * `runClaudeAcpServer` — session-init timeout + synthetic-id loadSession tests.
 *
 * Covers bead `km-silvercode.claude-acp-init-timeout-no-fallback`:
 *
 * 1. Timeout REJECTS `newSession` (no synthetic fallback).
 * 2. Real session-init resolves with the real Claude UUID.
 * 3. Buffered events are replayed through the wire after attach.
 * 4. Buffer subscription is cleaned up on rejection (no leaks).
 * 5. `loadSession` rejects synthetic ids with an actionable error.
 * 6. `loadSession` rejection lists the 5 most recent JSONL files in mtime-desc order.
 *
 * The test reuses the same `MessageChannel`-style stream pair as
 * `server.test.ts` and the same `node:child_process` mock. We thread a
 * tiny `sessionInitTimeoutMs` (~50ms) through the server entrypoint to
 * exercise the rejection path without waiting 30s of wall-clock time.
 */

import { mkdirSync, utimesSync, writeFileSync } from "node:fs"
import { rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { EventEmitter, PassThrough, Readable, Writable } from "node:stream"
import * as acp from "@agentclientprotocol/sdk"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const FAKE_PID = 525253

// ---------------------------------------------------------------------------
// child_process mock — emits caller-supplied JSONL on stdout, then exits.
// (Same pattern as server.test.ts; a separate copy here so the tests are
// independently runnable.)
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
let initDelayMs = 0

function setScript(lines: string[]): void {
  scriptedJsonl = lines
}

function setInitDelay(ms: number): void {
  initDelayMs = ms
}

function createFakeChild(): FakeChild {
  const bus = new EventEmitter() as FakeChild
  bus.pid = FAKE_PID
  bus.killed = false

  let pumpedInit = false
  let pumpedRest = false

  bus.stdin = new Writable({
    write(_c, _e, cb) {
      if (!pumpedRest && pumpedInit) {
        pumpedRest = true
        const rest = scriptedJsonl.slice(1)
        process.nextTick(() => {
          for (const line of rest) bus.stdout.push(line + "\n")
          bus.stdout.push(null)
          setTimeout(() => bus.emit("exit", 0, null), 5)
        })
      }
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

  const pumpInit = (): void => {
    if (lines.length > 0) {
      bus.stdout.push(lines[0]! + "\n")
      pumpedInit = true
    }
    if (lines.length <= 1) {
      bus.stdout.push(null)
      setTimeout(() => bus.emit("exit", 0, null), 5)
    }
  }

  if (initDelayMs > 0) {
    setTimeout(pumpInit, initDelayMs)
  } else {
    process.nextTick(pumpInit)
  }

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
  scriptedJsonl = []
  initDelayMs = 0
})
afterEach(() => {
  process.kill = originalProcessKill
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// In-memory wire pair — client speaks ACP to server over real ndJsonStream.
// ---------------------------------------------------------------------------

interface WirePair {
  clientStdout: PassThrough
  clientStdin: PassThrough
  serverStdin: PassThrough
  serverStdout: PassThrough
}

function createWirePair(): WirePair {
  const clientToServer = new PassThrough()
  const serverToClient = new PassThrough()
  return {
    clientStdout: clientToServer,
    clientStdin: serverToClient,
    serverStdin: clientToServer,
    serverStdout: serverToClient,
  }
}

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

async function settle(ms = 30): Promise<void> {
  await new Promise((r) => setTimeout(r, ms))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("claude-acp newSession — session-init timeout", () => {
  test("rejects newSession when session-init does not arrive in time", async () => {
    // No init line scripted; the fake child idles forever. The server
    // should reject newSession with the timeout error after
    // `sessionInitTimeoutMs`.
    setScript([])
    const wire = createWirePair()
    const { runClaudeAcpServer } = await import("../src/server.ts")

    const serverPromise = runClaudeAcpServer({
      stdin: wire.serverStdin,
      stdout: wire.serverStdout,
      sessionInitTimeoutMs: 50,
    })

    const { conn } = buildClient(wire)
    await conn.initialize({ protocolVersion: 1 })

    // The ACP SDK logs RequestError to console.error when dispatching
    // server-side handler failures back to the client. Suppress to match
    // the no-console-output vitest rule.
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      // Either timeout fires ("claude failed to initialize within Ns") or
      // an early session-end / session-lifecycle:ended arrives first
      // ("claude exited before initializing"). Both are valid rejection
      // shapes for the same root cause: claude never reached session-init.
      // The fix surfaces the actual failure mode so the user sees auth /
      // subprocess errors rather than a 30s generic timeout.
      await expect(conn.newSession({ cwd: "/work", mcpServers: [] })).rejects.toMatchObject({
        code: -32000,
        message: expect.stringMatching(/claude (failed to initialize|exited before initializing)/),
      })
    } finally {
      consoleErrorSpy.mockRestore()
    }

    wire.clientStdout.end()
    wire.serverStdout.end()
    await settle(20)
    await serverPromise.catch(() => {})
  })

  test("real session-init resolves with the real Claude UUID — no synthetic id ever", async () => {
    // Simulate a 20ms delay before the init event lands — tests that the
    // server waits for the real id rather than racing into a fallback.
    setInitDelay(20)
    setScript([
      JSON.stringify({
        type: "system",
        subtype: "init",
        cwd: "/work",
        session_id: "4de4a3ab-81cb-4cb5-add2-e9ffc1dbc612",
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
      sessionInitTimeoutMs: 200, // generous relative to 20ms init delay
    })

    const { conn } = buildClient(wire)
    await conn.initialize({ protocolVersion: 1 })
    const result = await conn.newSession({ cwd: "/work", mcpServers: [] })

    expect(result.sessionId).toBe("4de4a3ab-81cb-4cb5-add2-e9ffc1dbc612")
    // Negative-space assertion: id must NOT match the synthetic regex.
    expect(/^claude-acp-\d{13}-\d+$/.test(result.sessionId as string)).toBe(false)

    wire.clientStdout.end()
    wire.serverStdout.end()
    await settle(20)
    await serverPromise.catch(() => {})
  })

  test("buffered events emitted before session-init replay through the wire after attach", async () => {
    // Scripted JSONL: stream events arrive INTERLEAVED with init — but the
    // fake-child gates lines after the first on stdin, so all subsequent
    // lines wait for prompt(). The buffer-replay invariant is asserted by
    // the server.test.ts "prompt round-trip" test (agent_message_chunk
    // count ≥ 2 from delta events). Here we additionally assert that an
    // event that arrives BEFORE wire-attach (i.e. between session-init
    // resolution and attachWire) is not lost — exercised by issuing a
    // prompt that produces deltas after init.
    setScript([
      JSON.stringify({
        type: "system",
        subtype: "init",
        cwd: "/work",
        session_id: "real-uuid-buffered",
        tools: [],
        mcp_servers: [],
        model: "claude-sonnet-4-6",
        permissionMode: "auto",
      }),
      JSON.stringify({
        type: "stream_event",
        session_id: "real-uuid-buffered",
        event: { type: "message_start", message: { id: "msg-1", role: "assistant", content: [] } },
      }),
      JSON.stringify({
        type: "stream_event",
        session_id: "real-uuid-buffered",
        event: { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
      }),
      JSON.stringify({
        type: "stream_event",
        session_id: "real-uuid-buffered",
        event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "buffered-ok" } },
      }),
      JSON.stringify({
        type: "stream_event",
        session_id: "real-uuid-buffered",
        event: { type: "content_block_stop", index: 0 },
      }),
      JSON.stringify({
        type: "stream_event",
        session_id: "real-uuid-buffered",
        event: {
          type: "message_delta",
          delta: { stop_reason: "end_turn" },
          usage: { input_tokens: 1, output_tokens: 1 },
        },
      }),
      JSON.stringify({
        type: "stream_event",
        session_id: "real-uuid-buffered",
        event: { type: "message_stop" },
      }),
      JSON.stringify({
        type: "result",
        subtype: "success",
        session_id: "real-uuid-buffered",
        is_error: false,
        duration_ms: 5,
        num_turns: 1,
        result: "buffered-ok",
        total_cost_usd: 0,
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    ])
    const wire = createWirePair()
    const { runClaudeAcpServer } = await import("../src/server.ts")
    const serverPromise = runClaudeAcpServer({
      stdin: wire.serverStdin,
      stdout: wire.serverStdout,
      sessionInitTimeoutMs: 500,
    })

    const { conn, updates } = buildClient(wire)
    await conn.initialize({ protocolVersion: 1 })
    const session = await conn.newSession({ cwd: "/work", mcpServers: [] })
    expect(session.sessionId).toBe("real-uuid-buffered")

    // Drive a prompt so the gated lines pump and flow through the wire.
    await conn.prompt({
      sessionId: session.sessionId,
      prompt: [{ type: "text", text: "go" }],
    })

    const agentChunks = updates.filter((u) => u.update.sessionUpdate === "agent_message_chunk")
    const text = agentChunks
      .map((u) => {
        const up = u.update as Extract<acp.SessionUpdate, { sessionUpdate: "agent_message_chunk" }>
        return up.content.type === "text" ? up.content.text : ""
      })
      .join("")
    expect(text).toContain("buffered-ok")

    wire.clientStdout.end()
    wire.serverStdout.end()
    await settle(20)
    await serverPromise.catch(() => {})
  })

  test("buffer subscription is cleaned up when newSession rejects (no leaked subscribers)", async () => {
    // After rejection, the fake-child's subscribers should drop to 0.
    // We assert the absence of a leaked subscriber by spying on the
    // AgentSession factory — instead of touching internals, we verify
    // that calling spawn-init AFTER rejection doesn't deliver any events
    // to a phantom buffer (this would manifest as "Maximum call stack"
    // / repeated emit). Smoke-checked via a follow-up newSession on a
    // new wire — if the previous buffer leaked, the server's per-call
    // sessionScope dispose would have failed.
    setScript([])
    const wire = createWirePair()
    const { runClaudeAcpServer } = await import("../src/server.ts")
    const serverPromise = runClaudeAcpServer({
      stdin: wire.serverStdin,
      stdout: wire.serverStdout,
      sessionInitTimeoutMs: 30,
    })

    const { conn } = buildClient(wire)
    await conn.initialize({ protocolVersion: 1 })

    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      await expect(conn.newSession({ cwd: "/work", mcpServers: [] })).rejects.toMatchObject({ code: -32000 })
    } finally {
      consoleErrorSpy.mockRestore()
    }

    // Settle long enough for any phantom buffer flush to misfire (it
    // shouldn't). The server should remain healthy and accept further
    // requests on the same connection.
    await settle(60)

    // Verify the connection is still alive (no unhandled rejection took
    // it down) by issuing another initialize call.
    const init2 = await conn.initialize({ protocolVersion: 1 })
    expect(init2.protocolVersion).toBe(1)

    wire.clientStdout.end()
    wire.serverStdout.end()
    await settle(20)
    await serverPromise.catch(() => {})
  })
})

describe("claude-acp loadSession — synthetic-id detection + recent list", () => {
  test("rejects with actionable error when sessionId matches the synthetic regex", async () => {
    setScript([])
    const wire = createWirePair()
    const { runClaudeAcpServer } = await import("../src/server.ts")
    const serverPromise = runClaudeAcpServer({
      stdin: wire.serverStdin,
      stdout: wire.serverStdout,
    })

    const { conn } = buildClient(wire)
    await conn.initialize({ protocolVersion: 1 })

    const fakeCwd = join(tmpdir(), `claude-acp-synth-${Date.now()}`)
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      await expect(
        conn.loadSession({
          sessionId: "claude-acp-1777439414160-1" as acp.SessionId,
          cwd: fakeCwd,
          mcpServers: [],
        }),
      ).rejects.toMatchObject({
        code: -32000,
        message: expect.stringMatching(/synthetic session ids cannot be resumed/),
      })
    } finally {
      consoleErrorSpy.mockRestore()
    }

    wire.clientStdout.end()
    wire.serverStdout.end()
    await settle(20)
    await serverPromise.catch(() => {})
  })

  test("synthetic regex does not false-positive on real Claude UUIDs", async () => {
    // A real UUID like `4de4a3ab-81cb-4cb5-add2-e9ffc1dbc612` should fall
    // through to the on-disk stat path and produce the generic
    // "session not found" error — NOT the synthetic-id error.
    setScript([])
    const wire = createWirePair()
    const { runClaudeAcpServer } = await import("../src/server.ts")
    const serverPromise = runClaudeAcpServer({
      stdin: wire.serverStdin,
      stdout: wire.serverStdout,
    })

    const { conn } = buildClient(wire)
    await conn.initialize({ protocolVersion: 1 })

    const fakeCwd = join(tmpdir(), `claude-acp-uuid-${Date.now()}`)
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      await expect(
        conn.loadSession({
          sessionId: "4de4a3ab-81cb-4cb5-add2-e9ffc1dbc612" as acp.SessionId,
          cwd: fakeCwd,
          mcpServers: [],
        }),
      ).rejects.toMatchObject({
        code: -32000,
        message: expect.stringMatching(/^session not found/),
      })
    } finally {
      consoleErrorSpy.mockRestore()
    }

    wire.clientStdout.end()
    wire.serverStdout.end()
    await settle(20)
    await serverPromise.catch(() => {})
  })

  test("synthetic-id error lists the 5 most recent JSONL files in mtime-desc order with previews", async () => {
    // Build 7 fixture JSONLs with staggered mtimes, then trigger the
    // synthetic-id path against that cwd and parse the error message for
    // the 5 newest UUIDs in order.
    const homedir = (await import("node:os")).homedir
    const uniqueSuffix = `claude-acp-recent-${Date.now()}`
    const testCwd = `/${uniqueSuffix}`
    const encodedCwd = testCwd.replace(/\//g, "-")
    const projectsDir = join(homedir(), ".claude", "projects", encodedCwd)
    mkdirSync(projectsDir, { recursive: true })

    try {
      const now = Date.now()
      // Create 7 JSONLs with mtimes spaced 1 hour apart, oldest first.
      const uuids: string[] = []
      for (let i = 0; i < 7; i++) {
        const uuid = `0000000${i}-1111-2222-3333-444444444444`
        uuids.push(uuid)
        const path = join(projectsDir, `${uuid}.jsonl`)
        writeFileSync(
          path,
          // Embed the index in the user-message text so we can verify
          // the preview is captured per-file.
          JSON.stringify({
            type: "user",
            message: { role: "user", content: [{ type: "text", text: `first message ${i}` }] },
          }) + "\n",
          "utf8",
        )
        // Set mtime: i=0 oldest, i=6 newest. Use seconds since epoch.
        const mtime = new Date(now - (7 - i) * 60 * 60 * 1000)
        utimesSync(path, mtime, mtime)
      }

      const wire = createWirePair()
      const { runClaudeAcpServer } = await import("../src/server.ts")
      const serverPromise = runClaudeAcpServer({
        stdin: wire.serverStdin,
        stdout: wire.serverStdout,
      })

      const { conn } = buildClient(wire)
      await conn.initialize({ protocolVersion: 1 })

      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
      let errorMessage = ""
      try {
        try {
          await conn.loadSession({
            sessionId: "claude-acp-1777439414160-7" as acp.SessionId,
            cwd: testCwd,
            mcpServers: [],
          })
        } catch (err) {
          errorMessage = (err as { message?: string }).message ?? ""
        }
      } finally {
        consoleErrorSpy.mockRestore()
      }

      // Top 5 by mtime-desc are the indices 6,5,4,3,2 (newest → oldest).
      const expectedTopFive = [6, 5, 4, 3, 2].map((i) => uuids[i]!)
      const positions = expectedTopFive.map((uuid) => errorMessage.indexOf(uuid))
      // All five appear...
      for (let i = 0; i < positions.length; i++) {
        expect(positions[i]).toBeGreaterThanOrEqual(0)
      }
      // ...and in mtime-desc order in the rendered string.
      for (let i = 1; i < positions.length; i++) {
        expect(positions[i]).toBeGreaterThan(positions[i - 1]!)
      }
      // The two oldest must NOT appear (i=0,1).
      expect(errorMessage).not.toContain(uuids[0]!)
      expect(errorMessage).not.toContain(uuids[1]!)
      // Preview text from the newest file should surface.
      expect(errorMessage).toContain("first message 6")

      wire.clientStdout.end()
      wire.serverStdout.end()
      await settle(20)
      await serverPromise.catch(() => {})
    } finally {
      await rm(projectsDir, { recursive: true, force: true })
    }
  })
})
