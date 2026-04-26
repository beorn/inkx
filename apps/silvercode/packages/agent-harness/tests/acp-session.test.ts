/**
 * Tests for `createAcpSession(scope, agentSession)` — drains the legacy
 * AgentEvent stream into silvercode's canonical ACP-shaped signals,
 * projections, and tree.
 *
 * Bead: `km-silvercode.acp-session`.
 */

import { describe, expect, it } from "vitest"
import { createScope } from "@silvery/scope"

import {
  createAcpSession,
  createFakeAcpSession,
  loadFixture,
  type AcpSessionStatus,
  type FakeFixtureName,
  type ManualFakeSession,
  type ScriptStep,
} from "../src/index.ts"
import type { AgentEvent, PermissionRequestId, SessionId, ToolUseId, TurnId } from "../src/events.ts"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function manualFakeFromFixture(name: FakeFixtureName): ManualFakeSession {
  const script = loadFixture(name)
  return createFakeAcpSession({ script, manual: true })
}

function manualFakeFromScript(script: ScriptStep[]): ManualFakeSession {
  return createFakeAcpSession({ script, manual: true })
}

const TEST_SESSION = "fake-session" as SessionId

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createAcpSession — basic state", () => {
  it("starts idle with empty messages / toolCalls / pending", async () => {
    await using scope = createScope("test")
    const fake = manualFakeFromScript([])
    const acp = createAcpSession(scope, fake)

    expect(acp.status()).toBe("idle" satisfies AcpSessionStatus)
    expect(acp.messages()).toEqual([])
    expect(acp.toolCalls()).toEqual([])
    expect(acp.pendingPermissions()).toEqual([])
    expect(acp.plan()).toBeNull()
    expect(acp.usage()).toBeNull()
    expect(acp.mode()).toBeNull()
  })

  it("seeds capabilities from opts", async () => {
    await using scope = createScope("test")
    const fake = manualFakeFromScript([])
    const acp = createAcpSession(scope, fake, {
      capabilities: { loadSession: true, promptCapabilities: { image: true } },
    })

    expect(acp.capabilities()).toEqual({ loadSession: true, promptCapabilities: { image: true } })
  })

  it("updates id from session-init", async () => {
    await using scope = createScope("test")
    const fake = manualFakeFromScript([
      {
        delayMs: 0,
        event: {
          kind: "session-init",
          sessionId: "real-id" as SessionId,
          cwd: "/tmp",
          model: "claude-sonnet",
          mode: "act",
          tools: [],
          mcp_servers: [],
          slashCommands: [],
          skills: [],
          plugins: [],
          claudeCodeVersion: "2.1.119",
          apiKeySource: "OAuth",
          ts: 1,
        },
      },
    ])
    const acp = createAcpSession(scope, fake)
    fake.drain()

    expect(acp.id()).toBe("real-id")
    expect(acp.capabilities()).toEqual({})
  })
})

describe("createAcpSession — messages signal", () => {
  it("grows the messages signal across one turn (minimal-prompt fixture)", async () => {
    await using scope = createScope("test")
    const fake = manualFakeFromFixture("minimal-prompt")
    const acp = createAcpSession(scope, fake)
    fake.drain()

    const msgs = acp.messages()
    expect(msgs.length).toBe(1)
    expect(msgs[0]!.role).toBe("assistant")
    expect(msgs[0]!.content).toEqual([{ type: "text", text: "Hello, world." }])
  })

  it("merges sequential text-deltas into a single text block", async () => {
    await using scope = createScope("test")
    const turnId = "t1" as TurnId
    const fake = manualFakeFromScript([
      {
        delayMs: 0,
        event: { kind: "turn-start", sessionId: TEST_SESSION, turnId, role: "assistant", ts: 1 },
      },
      {
        delayMs: 0,
        event: {
          kind: "text-delta",
          sessionId: TEST_SESSION,
          turnId,
          blockIndex: 0,
          text: "Hello",
          ts: 2,
        },
      },
      {
        delayMs: 0,
        event: {
          kind: "text-delta",
          sessionId: TEST_SESSION,
          turnId,
          blockIndex: 0,
          text: ", world",
          ts: 3,
        },
      },
      {
        delayMs: 0,
        event: {
          kind: "text-delta",
          sessionId: TEST_SESSION,
          turnId,
          blockIndex: 0,
          text: ".",
          ts: 4,
        },
      },
    ])
    const acp = createAcpSession(scope, fake)
    fake.drain()

    const msgs = acp.messages()
    expect(msgs).toHaveLength(1)
    expect(msgs[0]!.content).toEqual([{ type: "text", text: "Hello, world." }])
  })

  it("supports multiple turns (user → assistant → user → assistant)", async () => {
    await using scope = createScope("test")
    const t1 = "turn-1" as TurnId
    const t2 = "turn-2" as TurnId
    const t3 = "turn-3" as TurnId
    const t4 = "turn-4" as TurnId

    const fake = manualFakeFromScript([
      {
        delayMs: 0,
        event: {
          kind: "user-message",
          sessionId: TEST_SESSION,
          turnId: t1,
          text: "First prompt",
          ts: 1,
        },
      },
      {
        delayMs: 0,
        event: { kind: "turn-start", sessionId: TEST_SESSION, turnId: t2, role: "assistant", ts: 2 },
      },
      {
        delayMs: 0,
        event: {
          kind: "text-delta",
          sessionId: TEST_SESSION,
          turnId: t2,
          blockIndex: 0,
          text: "First reply",
          ts: 3,
        },
      },
      {
        delayMs: 0,
        event: {
          kind: "turn-end",
          sessionId: TEST_SESSION,
          turnId: t2,
          stopReason: "end_turn",
          ts: 4,
        },
      },
      {
        delayMs: 0,
        event: {
          kind: "user-message",
          sessionId: TEST_SESSION,
          turnId: t3,
          text: "Second prompt",
          ts: 5,
        },
      },
      {
        delayMs: 0,
        event: { kind: "turn-start", sessionId: TEST_SESSION, turnId: t4, role: "assistant", ts: 6 },
      },
      {
        delayMs: 0,
        event: {
          kind: "text-delta",
          sessionId: TEST_SESSION,
          turnId: t4,
          blockIndex: 0,
          text: "Second reply",
          ts: 7,
        },
      },
      {
        delayMs: 0,
        event: {
          kind: "turn-end",
          sessionId: TEST_SESSION,
          turnId: t4,
          stopReason: "end_turn",
          ts: 8,
        },
      },
    ])
    const acp = createAcpSession(scope, fake)
    fake.drain()

    const msgs = acp.messages()
    expect(msgs).toHaveLength(4)
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant"])
    expect(msgs[1]!.content[0]).toEqual({ type: "text", text: "First reply" })
    expect(msgs[3]!.content[0]).toEqual({ type: "text", text: "Second reply" })
  })
})

describe("createAcpSession — toolCalls projection", () => {
  it("upserts on tool-use and patches on tool-result", async () => {
    await using scope = createScope("test")
    const fake = manualFakeFromFixture("tool-call-with-permission")
    const acp = createAcpSession(scope, fake)
    fake.drain()

    const calls = acp.toolCalls()
    expect(calls).toHaveLength(1)
    const call = calls[0]!
    expect(call.toolCallId).toBe("tool-1")
    expect(call.title).toBe("Edit")
    expect(call.status).toBe("completed")
    expect(call.rawInput).toEqual({ path: "src/auth.ts", old: "foo", new: "bar" })
    expect(call.rawOutput).toEqual({ ok: true })
    // Final output is appended as ACP-shaped content.
    expect(call.content).toBeDefined()
    expect(call.content!.length).toBeGreaterThan(0)
  })

  it("marks failed tool calls with status=failed", async () => {
    await using scope = createScope("test")
    const id = "tool-x" as ToolUseId
    const turnId = "t1" as TurnId
    const fake = manualFakeFromScript([
      {
        delayMs: 0,
        event: { kind: "turn-start", sessionId: TEST_SESSION, turnId, role: "assistant", ts: 1 },
      },
      {
        delayMs: 0,
        event: {
          kind: "tool-use",
          sessionId: TEST_SESSION,
          turnId,
          id,
          name: "Bash",
          input: { command: "ls" },
          ts: 2,
        },
      },
      {
        delayMs: 0,
        event: {
          kind: "tool-result",
          sessionId: TEST_SESSION,
          id,
          output: "boom",
          is_error: true,
          ts: 3,
        },
      },
    ])
    const acp = createAcpSession(scope, fake)
    fake.drain()

    expect(acp.toolCalls()[0]!.status).toBe("failed")
  })

  it("multiple tool calls are independently tracked (multi-tool-with-fs)", async () => {
    await using scope = createScope("test")
    const fake = manualFakeFromFixture("multi-tool-with-fs")
    const acp = createAcpSession(scope, fake)
    fake.drain()

    const calls = acp.toolCalls()
    expect(calls.length).toBeGreaterThan(1)
    // Each entry has a distinct id.
    const ids = new Set(calls.map((c) => c.toolCallId))
    expect(ids.size).toBe(calls.length)
  })
})

describe("createAcpSession — plan signal + tree", () => {
  it("derives a Plan from a TodoWrite tool-use", async () => {
    await using scope = createScope("test")
    const turnId = "t1" as TurnId
    const id = "todo-1" as ToolUseId
    const fake = manualFakeFromScript([
      {
        delayMs: 0,
        event: { kind: "turn-start", sessionId: TEST_SESSION, turnId, role: "assistant", ts: 1 },
      },
      {
        delayMs: 0,
        event: {
          kind: "tool-use",
          sessionId: TEST_SESSION,
          turnId,
          id,
          name: "TodoWrite",
          input: {
            todos: [
              { content: "First task", status: "pending" },
              { content: "Second task", status: "in_progress" },
              { content: "Third task", status: "completed" },
            ],
          },
          ts: 2,
        },
      },
    ])
    const acp = createAcpSession(scope, fake)
    fake.drain()

    const plan = acp.plan()
    expect(plan).not.toBeNull()
    expect(plan!.entries).toHaveLength(3)
    expect(plan!.entries[0]!.content).toBe("First task")
    expect(plan!.entries[0]!.status).toBe("pending")
    expect(plan!.entries[1]!.status).toBe("in_progress")
    expect(plan!.entries[2]!.status).toBe("completed")
  })

  it("plan tree mirrors plan entries", async () => {
    await using scope = createScope("test")
    const turnId = "t1" as TurnId
    const id = "todo-1" as ToolUseId
    const fake = manualFakeFromScript([
      {
        delayMs: 0,
        event: { kind: "turn-start", sessionId: TEST_SESSION, turnId, role: "assistant", ts: 1 },
      },
      {
        delayMs: 0,
        event: {
          kind: "tool-use",
          sessionId: TEST_SESSION,
          turnId,
          id,
          name: "TodoWrite",
          input: { todos: [{ content: "alpha" }, { content: "beta" }] },
          ts: 2,
        },
      },
    ])
    const acp = createAcpSession(scope, fake)
    fake.drain()

    expect(acp.planTree.size).toBeGreaterThanOrEqual(2)
    const node0 = acp.planTree.get("plan-0")
    const node1 = acp.planTree.get("plan-1")
    expect((node0.data as () => unknown)()).toMatchObject({ content: "alpha", status: "pending" })
    expect((node1.data as () => unknown)()).toMatchObject({ content: "beta", status: "pending" })
  })
})

describe("createAcpSession — usage signal", () => {
  it("updates usage from turn-end usage payload", async () => {
    await using scope = createScope("test")
    const turnId = "t1" as TurnId
    const fake = manualFakeFromScript([
      {
        delayMs: 0,
        event: { kind: "turn-start", sessionId: TEST_SESSION, turnId, role: "assistant", ts: 1 },
      },
      {
        delayMs: 0,
        event: {
          kind: "turn-end",
          sessionId: TEST_SESSION,
          turnId,
          stopReason: "end_turn",
          usage: { input_tokens: 10, output_tokens: 25 },
          ts: 2,
        },
      },
    ])
    const acp = createAcpSession(scope, fake)
    fake.drain()

    const usage = acp.usage()
    expect(usage).not.toBeNull()
    expect(usage!.used).toBe(35)
  })

  it("populates cost on session-end", async () => {
    await using scope = createScope("test")
    const fake = manualFakeFromScript([
      {
        delayMs: 0,
        event: {
          kind: "session-end",
          sessionId: TEST_SESSION,
          stopReason: "end_turn",
          usage: { input_tokens: 5, output_tokens: 5 },
          costUsd: 0.0123,
          ts: 1,
        },
      },
    ])
    const acp = createAcpSession(scope, fake)
    fake.drain()

    const usage = acp.usage()
    expect(usage!.cost).toEqual({ amount: 0.0123, currency: "USD" })
  })
})

describe("createAcpSession — pendingPermissions projection", () => {
  it("adds pending permission on permission-request and clears on permission-decision", async () => {
    await using scope = createScope("test")
    const reqId = "perm-1" as PermissionRequestId
    const fake = manualFakeFromScript([
      {
        delayMs: 0,
        event: {
          kind: "permission-request",
          sessionId: TEST_SESSION,
          requestId: reqId,
          tool: "Edit",
          args: { path: "src/auth.ts" },
          ts: 1,
        },
      },
    ])
    const acp = createAcpSession(scope, fake)
    fake.drain()

    let pending = acp.pendingPermissions()
    expect(pending).toHaveLength(1)
    expect(pending[0]!.id).toBe(reqId)
    expect(pending[0]!.request.toolCall.title).toBe("Edit")
    expect(pending[0]!.request.options.length).toBeGreaterThan(0)
    expect(acp.status()).toBe("awaiting-permission" satisfies AcpSessionStatus)

    // Now respond — should clear.
    acp.respondToPermission(reqId, true)
    pending = acp.pendingPermissions()
    expect(pending).toHaveLength(0)
  })
})

describe("createAcpSession — prompt() / cancel()", () => {
  it("prompt() resolves when the turn ends with a stopReason", async () => {
    await using scope = createScope("test")
    const turnId = "t1" as TurnId
    const fake = manualFakeFromScript([
      {
        delayMs: 0,
        event: { kind: "turn-start", sessionId: TEST_SESSION, turnId, role: "assistant", ts: 1 },
      },
      {
        delayMs: 0,
        event: {
          kind: "text-delta",
          sessionId: TEST_SESSION,
          turnId,
          blockIndex: 0,
          text: "ok",
          ts: 2,
        },
      },
      {
        delayMs: 0,
        event: {
          kind: "turn-end",
          sessionId: TEST_SESSION,
          turnId,
          stopReason: "end_turn",
          ts: 3,
        },
      },
    ])
    const acp = createAcpSession(scope, fake)

    const promptPromise = acp.prompt([{ type: "text", text: "hi" }])
    fake.drain()
    const result = await promptPromise
    expect(result.stopReason).toBe("end_turn")
  })

  it("cancel() aborts an in-flight prompt with stopReason=cancelled", async () => {
    await using scope = createScope("test")
    const fake = manualFakeFromScript([])
    const acp = createAcpSession(scope, fake)

    const promptPromise = acp.prompt([{ type: "text", text: "long task" }])
    acp.cancel()
    const result = await promptPromise
    expect(result.stopReason).toBe("cancelled")
  })

  it("scope dispose aborts an in-flight prompt", async () => {
    const scope = createScope("test")
    const fake = manualFakeFromScript([])
    const acp = createAcpSession(scope, fake)

    const promptPromise = acp.prompt([{ type: "text", text: "long task" }])
    await scope[Symbol.asyncDispose]()
    const result = await promptPromise
    expect(result.stopReason).toBe("cancelled")
  })

  it("non-text content with no text falls back to cancelled", async () => {
    await using scope = createScope("test")
    const fake = manualFakeFromScript([])
    const acp = createAcpSession(scope, fake)

    const result = await acp.prompt([{ type: "image", data: "xxx", mimeType: "image/png" }])
    expect(result.stopReason).toBe("cancelled")
  })
})

describe("createAcpSession — status transitions", () => {
  it("transitions idle → thinking → tool-running → idle → ended", async () => {
    await using scope = createScope("test")
    const turnId = "t1" as TurnId
    const id = "t-1" as ToolUseId
    const fake = manualFakeFromScript([
      // Phase 1: thinking
      {
        delayMs: 0,
        event: { kind: "turn-start", sessionId: TEST_SESSION, turnId, role: "assistant", ts: 1 },
      },
      {
        delayMs: 0,
        event: {
          kind: "text-delta",
          sessionId: TEST_SESSION,
          turnId,
          blockIndex: 0,
          text: "thinking…",
          ts: 2,
        },
      },
      // Phase 2: tool-running
      {
        delayMs: 0,
        event: {
          kind: "tool-use",
          sessionId: TEST_SESSION,
          turnId,
          id,
          name: "Read",
          input: {},
          ts: 3,
        },
      },
      // Phase 3: tool completed -> back to thinking-then-idle
      {
        delayMs: 0,
        event: {
          kind: "tool-result",
          sessionId: TEST_SESSION,
          id,
          output: "ok",
          ts: 4,
        },
      },
      // Phase 4: turn-end -> idle
      {
        delayMs: 0,
        event: {
          kind: "turn-end",
          sessionId: TEST_SESSION,
          turnId,
          stopReason: "end_turn",
          ts: 5,
        },
      },
      // Phase 5: session-end -> ended
      {
        delayMs: 0,
        event: { kind: "session-end", sessionId: TEST_SESSION, ts: 6 },
      },
    ])
    const acp = createAcpSession(scope, fake)
    expect(acp.status()).toBe("idle" satisfies AcpSessionStatus)

    // tick: turn-start → thinking
    fake.tick()
    expect(acp.status()).toBe("thinking" satisfies AcpSessionStatus)

    // tick: text-delta → still thinking
    fake.tick()
    expect(acp.status()).toBe("thinking" satisfies AcpSessionStatus)

    // tick: tool-use → tool-running
    fake.tick()
    expect(acp.status()).toBe("tool-running" satisfies AcpSessionStatus)

    // tick: tool-result → thinking (still in turn, no active tool)
    fake.tick()
    expect(acp.status()).toBe("thinking" satisfies AcpSessionStatus)

    // tick: turn-end → idle
    fake.tick()
    expect(acp.status()).toBe("idle" satisfies AcpSessionStatus)

    // tick: session-end → ended
    fake.tick()
    expect(acp.status()).toBe("ended" satisfies AcpSessionStatus)
  })

  it("status flips to awaiting-permission while a request is pending", async () => {
    await using scope = createScope("test")
    const turnId = "t1" as TurnId
    const id = "t-1" as ToolUseId
    const reqId = "perm-1" as PermissionRequestId
    const fake = manualFakeFromScript([
      {
        delayMs: 0,
        event: { kind: "turn-start", sessionId: TEST_SESSION, turnId, role: "assistant", ts: 1 },
      },
      {
        delayMs: 0,
        event: {
          kind: "tool-use",
          sessionId: TEST_SESSION,
          turnId,
          id,
          name: "Edit",
          input: {},
          ts: 2,
        },
      },
      {
        delayMs: 0,
        event: {
          kind: "permission-request",
          sessionId: TEST_SESSION,
          requestId: reqId,
          tool: "Edit",
          args: {},
          ts: 3,
        },
      },
    ])
    const acp = createAcpSession(scope, fake)
    fake.drain()

    expect(acp.status()).toBe("awaiting-permission" satisfies AcpSessionStatus)
  })
})

describe("createAcpSession — fixture replay", () => {
  // Coverage check: every fixture in fake-fixtures/ should drain without
  // throwing and leave the session in a consistent terminal state.
  const fixtures: FakeFixtureName[] = [
    "minimal-prompt",
    "tool-call-with-permission",
    "multi-tool-with-fs",
    "rejection-flow",
    "error-flow",
    "streaming-text",
  ]

  for (const name of fixtures) {
    it(`drains fixture ${name} without throwing`, async () => {
      await using scope = createScope("test")
      const fake = manualFakeFromFixture(name)
      const acp = createAcpSession(scope, fake)
      expect(() => fake.drain()).not.toThrow()
      // Status is one of the canonical values.
      expect(["idle", "thinking", "tool-running", "awaiting-permission", "ended"]).toContain(acp.status())
    })
  }
})
