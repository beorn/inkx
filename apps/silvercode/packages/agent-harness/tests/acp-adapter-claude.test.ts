/**
 * `spawnClaudeAcpSession(scope, opts)` — end-to-end composition test.
 *
 * The adapter is identity-by-composition: spawnClaude → AgentSession,
 * createAcpSession → AcpSession. We don't spawn a real `claude` binary
 * (not on PATH in CI, and would require a live subscription); instead we
 * mock `node:child_process` and feed canned stream-json bytes through
 * stdout. That exercises the full path:
 *
 *     canned JSONL bytes
 *       → createLineSplitter (in spawnClaude)
 *       → createStreamJsonParser (in spawnClaude)
 *       → AgentEvent emit (legacy)
 *       → createAcpSession.applyEvent (in adapter)
 *       → ACP-shaped signals/projections/trees
 *
 * The assertions cover every signal surface the adapter is expected to
 * drive: messages, toolCalls, plan, status transitions, usage, and the
 * scope-dispose cleanup contract.
 *
 * Bead: `km-silvercode.acp-adapter-claude`.
 */

import { EventEmitter, Readable, Writable } from "node:stream"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { createScope } from "@silvery/scope"

const FAKE_PID = 424242

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

/**
 * The script of JSONL lines the next spawned child should emit. We swap this
 * between tests so a single child_process mock can serve every scenario.
 */
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

  // Feed the scripted JSONL synchronously after a microtask, then close.
  // Using process.nextTick so the parent (spawnClaude) has time to attach
  // its `data` listener.
  const lines = [...scriptedJsonl]
  bus.stdout = new Readable({
    read() {
      // No-op; we push proactively below.
    },
  })
  bus.stderr = new Readable({
    read() {
      this.push(null)
    },
  })

  process.nextTick(() => {
    for (const line of lines) {
      bus.stdout.push(line + "\n")
    }
    bus.stdout.push(null)
    // Synthesize an exit slightly later so consumers can drain stdout first.
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

// `process.kill(-pid, ...)` is called from spawnClaude.close() to tear down
// the process group. In tests there is no real group; trap so it doesn't
// throw a real ESRCH up out of the test.
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
// Helper: drive the scripted child to exit, drain microtasks.
// ---------------------------------------------------------------------------

async function settle(): Promise<void> {
  // Allow the nextTick chain (stdout push → exit emit) to flush.
  await new Promise((r) => setTimeout(r, 20))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("spawnClaudeAcpSession — composition end-to-end", () => {
  test("returns an AcpSession with idle status and empty signals before any data", async () => {
    setScript([])
    const { spawnClaudeAcpSession } = await import("../src/acp-adapter-claude.ts")
    await using scope = createScope("test-empty")
    const acp = spawnClaudeAcpSession(scope, { silentStderr: true })

    expect(acp).toBeDefined()
    expect(typeof acp.prompt).toBe("function")
    expect(typeof acp.cancel).toBe("function")
    expect(acp.status()).toBe("idle")
    expect(acp.messages()).toEqual([])
    expect(acp.toolCalls()).toEqual([])
    expect(acp.pendingPermissions()).toEqual([])
    expect(acp.plan()).toBeNull()
  })

  test("session-init JSONL surfaces on the id signal", async () => {
    setScript([
      JSON.stringify({
        type: "system",
        subtype: "init",
        cwd: "/work",
        session_id: "sess-real-1",
        tools: ["Bash", "Edit"],
        mcp_servers: [],
        model: "claude-sonnet-4-6",
        permissionMode: "auto",
      }),
    ])
    const { spawnClaudeAcpSession } = await import("../src/acp-adapter-claude.ts")
    await using scope = createScope("test-init")
    const acp = spawnClaudeAcpSession(scope, { silentStderr: true })
    await settle()

    expect(acp.id()).toBe("sess-real-1")
    // ACP capabilities default to `{}` after session-init when no opts override.
    expect(acp.capabilities()).toEqual({})
  })

  test("seeds initial sessionId + capabilities from opts", async () => {
    setScript([])
    const { spawnClaudeAcpSession } = await import("../src/acp-adapter-claude.ts")
    await using scope = createScope("test-opts")
    const acp = spawnClaudeAcpSession(scope, {
      silentStderr: true,
      sessionId: "seeded" as never,
      capabilities: { loadSession: true, promptCapabilities: { image: true } },
    })

    expect(acp.id()).toBe("seeded")
    expect(acp.capabilities()).toEqual({ loadSession: true, promptCapabilities: { image: true } })
  })

  test("streaming text deltas accumulate into the messages signal", async () => {
    setScript([
      // session-init
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
      // assistant message_start
      JSON.stringify({
        type: "stream_event",
        session_id: "sess-1",
        event: { type: "message_start", message: { id: "msg-1", role: "assistant", content: [] } },
      }),
      // content_block_start (text)
      JSON.stringify({
        type: "stream_event",
        session_id: "sess-1",
        event: { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
      }),
      // text deltas
      JSON.stringify({
        type: "stream_event",
        session_id: "sess-1",
        event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hello, " } },
      }),
      JSON.stringify({
        type: "stream_event",
        session_id: "sess-1",
        event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "world." } },
      }),
      // content_block_stop
      JSON.stringify({
        type: "stream_event",
        session_id: "sess-1",
        event: { type: "content_block_stop", index: 0 },
      }),
      // message_delta with usage + stop_reason
      JSON.stringify({
        type: "stream_event",
        session_id: "sess-1",
        event: {
          type: "message_delta",
          delta: { stop_reason: "end_turn" },
          usage: { input_tokens: 10, output_tokens: 25 },
        },
      }),
      // message_stop
      JSON.stringify({
        type: "stream_event",
        session_id: "sess-1",
        event: { type: "message_stop" },
      }),
      // result
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
    const { spawnClaudeAcpSession } = await import("../src/acp-adapter-claude.ts")
    await using scope = createScope("test-text")
    const acp = spawnClaudeAcpSession(scope, { silentStderr: true })
    await settle()

    const msgs = acp.messages()
    // One assistant message, with a single merged text block.
    expect(msgs).toHaveLength(1)
    expect(msgs[0]!.role).toBe("assistant")
    expect(msgs[0]!.content).toEqual([{ type: "text", text: "Hello, world." }])

    // Usage surfaced from turn-end.
    const usage = acp.usage()
    expect(usage).not.toBeNull()
    expect(usage!.used).toBe(35)

    // Status reaches ended after the result line.
    expect(acp.status()).toBe("ended")
  })

  test("tool_use → tool_result drives the toolCalls projection", async () => {
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
      // tool_use block start
      JSON.stringify({
        type: "stream_event",
        session_id: "sess-1",
        event: {
          type: "content_block_start",
          index: 0,
          content_block: { type: "tool_use", id: "tool-1", name: "Bash", input: {} },
        },
      }),
      // streamed input as JSON fragments
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
      // user message echoing the tool_result
      JSON.stringify({
        type: "user",
        session_id: "sess-1",
        message: {
          role: "user",
          content: [{ type: "tool_result", tool_use_id: "tool-1", content: "file1.ts\nfile2.ts", is_error: false }],
        },
      }),
      // message_stop + result
      JSON.stringify({
        type: "stream_event",
        session_id: "sess-1",
        event: { type: "message_delta", delta: { stop_reason: "tool_use" } },
      }),
      JSON.stringify({
        type: "stream_event",
        session_id: "sess-1",
        event: { type: "message_stop" },
      }),
    ])
    const { spawnClaudeAcpSession } = await import("../src/acp-adapter-claude.ts")
    await using scope = createScope("test-tool")
    const acp = spawnClaudeAcpSession(scope, { silentStderr: true })
    await settle()

    const calls = acp.toolCalls()
    expect(calls).toHaveLength(1)
    const call = calls[0]!
    expect(call.toolCallId).toBe("tool-1")
    expect(call.title).toBe("Bash")
    // tool_result lands → completed.
    expect(call.status).toBe("completed")
    expect(call.rawInput).toEqual({ command: "ls" })
  })

  test("TodoWrite tool_use surfaces as the plan signal", async () => {
    setScript([
      JSON.stringify({
        type: "system",
        subtype: "init",
        cwd: "/work",
        session_id: "sess-1",
        tools: ["TodoWrite"],
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
          content_block: { type: "tool_use", id: "todo-1", name: "TodoWrite", input: {} },
        },
      }),
      JSON.stringify({
        type: "stream_event",
        session_id: "sess-1",
        event: {
          type: "content_block_delta",
          index: 0,
          delta: {
            type: "input_json_delta",
            partial_json: JSON.stringify({
              todos: [
                { content: "Write tests", status: "in_progress" },
                { content: "Update docs", status: "pending" },
              ],
            }),
          },
        },
      }),
      JSON.stringify({
        type: "stream_event",
        session_id: "sess-1",
        event: { type: "content_block_stop", index: 0 },
      }),
    ])
    const { spawnClaudeAcpSession } = await import("../src/acp-adapter-claude.ts")
    await using scope = createScope("test-plan")
    const acp = spawnClaudeAcpSession(scope, { silentStderr: true })
    await settle()

    const plan = acp.plan()
    expect(plan).not.toBeNull()
    expect(plan!.entries).toHaveLength(2)
    expect(plan!.entries[0]!.content).toBe("Write tests")
    expect(plan!.entries[0]!.status).toBe("in_progress")
    expect(plan!.entries[1]!.content).toBe("Update docs")
    expect(plan!.entries[1]!.status).toBe("pending")

    // Plan tree mirrors plan entries.
    expect(acp.planTree.size).toBeGreaterThanOrEqual(2)
  })

  test("scope dispose tears down the spawned subprocess", async () => {
    setScript([])
    const { spawnClaudeAcpSession } = await import("../src/acp-adapter-claude.ts")
    const scope = createScope("test-dispose")
    let exited = false
    const acp = spawnClaudeAcpSession(scope, {
      silentStderr: true,
      onExit: () => {
        exited = true
      },
    })
    expect(acp).toBeDefined()

    // Dispose scope → spawnClaude's close() runs → process.kill(-pid)
    // → mock's stdout was already pushed null → exit fires → onExit fires.
    await scope[Symbol.asyncDispose]()
    await settle()

    expect(exited).toBe(true)
  })

  test("subscription-auth env passthrough — process.env reaches the child", async () => {
    // The whole point of this adapter is that subscription auth env vars
    // (CLAUDE_CODE_OAUTH_TOKEN, ANTHROPIC_API_KEY, ~/.claude/auth.json fallback)
    // ride along automatically. Verify by spying on child_process.spawn and
    // inspecting the env object actually passed.
    let observedEnv: NodeJS.ProcessEnv | undefined
    vi.resetModules()
    vi.doMock("node:child_process", async () => {
      const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process")
      return {
        ...actual,
        spawn: ((_cmd: string, _args: readonly string[], opts?: { env?: NodeJS.ProcessEnv }) => {
          observedEnv = opts?.env
          return createFakeChild() as unknown as ReturnType<typeof actual.spawn>
        }) as unknown as typeof actual.spawn,
      }
    })

    const original = process.env.CLAUDE_CODE_OAUTH_TOKEN
    process.env.CLAUDE_CODE_OAUTH_TOKEN = "fake-oauth-for-test"
    try {
      setScript([])
      const { spawnClaudeAcpSession } = await import("../src/acp-adapter-claude.ts")
      await using scope = createScope("test-env")
      spawnClaudeAcpSession(scope, { silentStderr: true })
      await settle()

      expect(observedEnv).toBeDefined()
      expect(observedEnv!.CLAUDE_CODE_OAUTH_TOKEN).toBe("fake-oauth-for-test")
    } finally {
      if (original === undefined) delete process.env.CLAUDE_CODE_OAUTH_TOKEN
      else process.env.CLAUDE_CODE_OAUTH_TOKEN = original
      vi.doUnmock("node:child_process")
      vi.resetModules()
    }
  })

  test("explicit opts.env overlays without dropping process.env", async () => {
    let observedEnv: NodeJS.ProcessEnv | undefined
    vi.resetModules()
    vi.doMock("node:child_process", async () => {
      const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process")
      return {
        ...actual,
        spawn: ((_cmd: string, _args: readonly string[], opts?: { env?: NodeJS.ProcessEnv }) => {
          observedEnv = opts?.env
          return createFakeChild() as unknown as ReturnType<typeof actual.spawn>
        }) as unknown as typeof actual.spawn,
      }
    })

    const originalPath = process.env.PATH
    try {
      setScript([])
      const { spawnClaudeAcpSession } = await import("../src/acp-adapter-claude.ts")
      await using scope = createScope("test-env-overlay")
      spawnClaudeAcpSession(scope, {
        silentStderr: true,
        env: { CLAUDE_CODE_OAUTH_TOKEN: "explicit-override" },
      })
      await settle()

      expect(observedEnv).toBeDefined()
      // Explicit overlay won.
      expect(observedEnv!.CLAUDE_CODE_OAUTH_TOKEN).toBe("explicit-override")
      // process.env still bled through (PATH would not be set otherwise).
      expect(observedEnv!.PATH).toBe(originalPath)
    } finally {
      vi.doUnmock("node:child_process")
      vi.resetModules()
    }
  })
})
