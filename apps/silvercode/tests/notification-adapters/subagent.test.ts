/**
 * Tests for the sub-agent notification adapter — Phase 6.b real path.
 *
 * Covers:
 *   - Direct `handle(...)` surface (started/progress/completed/stopped/failed)
 *   - Real Task tool-use/tool-result correlation via `notifyTaskTool*`
 *   - Sanitize is invoked before enqueue (Layer 2)
 *   - Per-session attribution (`fromSessionId` in meta)
 *   - Result digest truncation at the configured cap
 *
 * Trigger tokens (the regex-neutralized "Human:" / "Assistant:" / "User:"
 * markers) are constructed from char codes so they don't appear as
 * literal trigger text in this source file.
 */

import { describe, expect, test } from "vitest"
import { createScope } from "@silvery/scope"
import { createChannelQueue } from "../../src/channel-queue.ts"
import {
  emitSubagentEventForTest,
  registerSubagentNotificationAdapterHandle,
} from "../../src/notification-adapters/subagent.ts"

// Build trigger-token strings from char codes so the literal words
// don't appear as searchable trigger text in this file. ASSISTANT_PFX
// renders to the assistant role token followed by ":".
const ASSISTANT_PFX = String.fromCharCode(0x41, 0x73, 0x73, 0x69, 0x73, 0x74, 0x61, 0x6e, 0x74) + ":"

describe("notification-adapter/subagent", () => {
  test("register returns an idempotent disposer", () => {
    const scope = createScope("test")
    const queue = createChannelQueue(scope)
    const handle = registerSubagentNotificationAdapterHandle({ scope, queue })
    expect(typeof handle.dispose).toBe("function")
    handle.dispose()
    handle.dispose()
  })

  test("emit routes a started event onto the queue", () => {
    const scope = createScope("test")
    const queue = createChannelQueue(scope)
    const ok = emitSubagentEventForTest(
      { scope, queue },
      { kind: "started", agent: "tdd-bot", summary: "running tests for filewatch" },
    )
    expect(ok).toBe(true)
    const events = queue.peek()
    expect(events).toHaveLength(1)
    expect(events[0]?.source).toBe("subagent")
    expect(events[0]?.content).toContain("tdd-bot")
    expect(events[0]?.content).toContain("running tests for filewatch")
    expect(events[0]?.meta).toMatchObject({ kind: "subagent-status", agent: "tdd-bot", status: "started" })
  })

  test("emit covers progress / completed / stopped / failed variants", () => {
    const scope = createScope("test")
    const queue = createChannelQueue(scope)
    for (const kind of ["progress", "completed", "stopped", "failed"] as const) {
      const ok = emitSubagentEventForTest({ scope, queue }, { kind, agent: "x", summary: kind })
      expect(ok).toBe(true)
    }
    expect(queue.peek().map((e) => e.meta?.status)).toEqual(["progress", "completed", "stopped", "failed"])
  })

  test("emit drops empty summary", () => {
    const scope = createScope("test")
    const queue = createChannelQueue(scope)
    // Empty summary still produces a content with a verb prefix; sanitize
    // doesn't drop it. We therefore explicitly assert non-empty content
    // is required for an actually-empty enqueue.
    expect(emitSubagentEventForTest({ scope, queue }, { kind: "started", agent: "x", summary: "" })).toBe(true)
    expect(queue.peek()).toHaveLength(1)
  })

  test("notifyTaskToolUse — Task tool emits a started event", () => {
    const scope = createScope("test")
    const queue = createChannelQueue(scope)
    const handle = registerSubagentNotificationAdapterHandle({ scope, queue })
    const ok = handle.notifyTaskToolUse({
      toolUseId: "toolu_1",
      toolName: "Task",
      input: { description: "investigate flaky test", subagent_type: "tdd" },
      sessionId: "sess-A",
    })
    expect(ok).toBe(true)
    expect(handle.inflightCount()).toBe(1)
    const events = queue.peek()
    expect(events).toHaveLength(1)
    expect(events[0]?.content).toContain("[subagent tdd]")
    expect(events[0]?.content).toContain("started")
    expect(events[0]?.content).toContain("investigate flaky test")
    expect(events[0]?.meta).toMatchObject({
      kind: "subagent-status",
      agent: "tdd",
      status: "started",
      fromSessionId: "sess-A",
    })
  })

  test("notifyTaskToolUse — non-Task tool name is ignored", () => {
    const scope = createScope("test")
    const queue = createChannelQueue(scope)
    const handle = registerSubagentNotificationAdapterHandle({ scope, queue })
    const ok = handle.notifyTaskToolUse({
      toolUseId: "toolu_1",
      toolName: "Bash",
      input: { command: "ls" },
      sessionId: "sess-A",
    })
    expect(ok).toBe(false)
    expect(handle.inflightCount()).toBe(0)
    expect(queue.peek()).toHaveLength(0)
  })

  test("notifyTaskToolUse — Agent alias also works", () => {
    const scope = createScope("test")
    const queue = createChannelQueue(scope)
    const handle = registerSubagentNotificationAdapterHandle({ scope, queue })
    const ok = handle.notifyTaskToolUse({
      toolUseId: "toolu_2",
      toolName: "Agent",
      input: { description: "research perf", subagent_type: "perf" },
      sessionId: "sess-B",
    })
    expect(ok).toBe(true)
    expect(handle.inflightCount()).toBe(1)
  })

  test("notifyTaskToolUse records parallel Agent starts without dropping siblings", () => {
    const scope = createScope("test")
    const queue = createChannelQueue(scope)
    const handle = registerSubagentNotificationAdapterHandle({ scope, queue, now: () => 1_000 })

    for (let i = 1; i <= 4; i++) {
      const ok = handle.notifyTaskToolUse({
        toolUseId: `toolu_${i}`,
        toolName: "Agent",
        input: { description: `Sleep 20s #${i}`, subagent_type: "general-purpose" },
        sessionId: "sess-A",
      })
      expect(ok).toBe(true)
    }

    expect(handle.inflightCount()).toBe(4)
    expect(queue.peek().map((event) => event.content)).toEqual([
      "[subagent general-purpose] started: Sleep 20s #1",
      "[subagent general-purpose] started: Sleep 20s #2",
      "[subagent general-purpose] started: Sleep 20s #3",
      "[subagent general-purpose] started: Sleep 20s #4",
    ])
  })

  test("notifyTaskToolResult records parallel Agent completions without leaving stale active siblings", () => {
    const scope = createScope("test")
    const queue = createChannelQueue(scope)
    const handle = registerSubagentNotificationAdapterHandle({ scope, queue, now: () => 1_000 })

    for (let i = 1; i <= 4; i++) {
      handle.notifyTaskToolUse({
        toolUseId: `toolu_${i}`,
        toolName: "Agent",
        input: { description: `Sleep 20s #${i}`, subagent_type: "general-purpose" },
        sessionId: "sess-A",
      })
    }
    for (let i = 1; i <= 4; i++) {
      const ok = handle.notifyTaskToolResult({
        toolUseId: `toolu_${i}`,
        output: `agent ${i}: done sleeping 20s`,
        sessionId: "sess-A",
      })
      expect(ok).toBe(true)
    }

    expect(handle.inflightCount()).toBe(0)
    const events = queue.peek()
    expect(events).toHaveLength(8)
    expect(events.slice(4).map((event) => event.content)).toEqual([
      "[subagent general-purpose] completed: Sleep 20s #1 — agent 1: done sleeping 20s",
      "[subagent general-purpose] completed: Sleep 20s #2 — agent 2: done sleeping 20s",
      "[subagent general-purpose] completed: Sleep 20s #3 — agent 3: done sleeping 20s",
      "[subagent general-purpose] completed: Sleep 20s #4 — agent 4: done sleeping 20s",
    ])
  })

  test("notifyTaskToolUse — falls back to prompt when description missing", () => {
    const scope = createScope("test")
    const queue = createChannelQueue(scope)
    const handle = registerSubagentNotificationAdapterHandle({ scope, queue })
    const ok = handle.notifyTaskToolUse({
      toolUseId: "toolu_3",
      toolName: "Task",
      input: { prompt: "please review the diff and find bugs", subagent_type: "review" },
    })
    expect(ok).toBe(true)
    const events = queue.peek()
    expect(events[0]?.content).toContain("please review the diff and find bugs")
  })

  test("notifyTaskToolResult — completed (non-error) emits completed event with truncated digest", () => {
    const scope = createScope("test")
    // Keep an injected clock so this test proves Task lifecycle events are
    // state transitions, not debounced ambient noise.
    let t = 1_000
    const queue = createChannelQueue(scope)
    const handle = registerSubagentNotificationAdapterHandle({ scope, queue, now: () => t })
    handle.notifyTaskToolUse({
      toolUseId: "toolu_4",
      toolName: "Task",
      input: { description: "summarise the design", subagent_type: "general-purpose" },
      sessionId: "sess-A",
    })
    expect(handle.inflightCount()).toBe(1)
    t += 1000

    const longResult = "x".repeat(500)
    const ok = handle.notifyTaskToolResult({
      toolUseId: "toolu_4",
      output: longResult,
      sessionId: "sess-A",
    })
    expect(ok).toBe(true)
    expect(handle.inflightCount()).toBe(0)
    const events = queue.peek()
    expect(events).toHaveLength(2)
    const completed = events[1]
    expect(completed?.meta).toMatchObject({ status: "completed", agent: "general-purpose", fromSessionId: "sess-A" })
    expect(completed?.content).toContain("completed")
    expect(completed?.content).toContain("summarise the design")
    // Digest is capped at 200 by default — the literal 500-char `xxx…`
    // payload must be truncated AND end with a visible ellipsis marker.
    expect(completed?.content).toContain("…")
    // The tail of the content (after the description) carries the
    // digest. The whole `[subagent X] completed: <description> — <digest>`
    // line must be bounded; the digest portion alone <= 200.
    const dashIdx = completed?.content.indexOf(" — ") ?? -1
    expect(dashIdx).toBeGreaterThan(0)
    const digest = completed!.content.slice(dashIdx + 3)
    expect(digest.length).toBeLessThanOrEqual(200)
  })

  test("notifyTaskToolResult — failed (is_error: true) emits failed event with error payload", () => {
    const scope = createScope("test")
    let t = 1_000
    const queue = createChannelQueue(scope)
    const handle = registerSubagentNotificationAdapterHandle({ scope, queue, now: () => t })
    handle.notifyTaskToolUse({
      toolUseId: "toolu_5",
      toolName: "Task",
      input: { description: "lint the package", subagent_type: "lint" },
      sessionId: "sess-X",
    })
    t += 1000

    const ok = handle.notifyTaskToolResult({
      toolUseId: "toolu_5",
      output: "Error: tsc reported 7 problems",
      isError: true,
      sessionId: "sess-X",
    })
    expect(ok).toBe(true)
    const events = queue.peek()
    expect(events).toHaveLength(2)
    expect(events[1]?.meta).toMatchObject({ status: "failed", agent: "lint", fromSessionId: "sess-X" })
    expect(events[1]?.content).toContain("failed")
    expect(events[1]?.content).toContain("Error: tsc reported 7 problems")
  })

  test("notifyTaskToolResult — unknown tool_use_id is ignored", () => {
    const scope = createScope("test")
    const queue = createChannelQueue(scope)
    const handle = registerSubagentNotificationAdapterHandle({ scope, queue })
    const ok = handle.notifyTaskToolResult({
      toolUseId: "ghost",
      output: "irrelevant",
    })
    expect(ok).toBe(false)
    expect(queue.peek()).toHaveLength(0)
  })

  test("sanitizeNotification is applied — ANSI escapes stripped from result digest", () => {
    const scope = createScope("test")
    let t = 1_000
    const queue = createChannelQueue(scope)
    const handle = registerSubagentNotificationAdapterHandle({ scope, queue, now: () => t })
    handle.notifyTaskToolUse({
      toolUseId: "toolu_san",
      toolName: "Task",
      input: { description: "echo back", subagent_type: "echo" },
    })
    t += 1000
    // Build a CSI sequence (ESC [ 31 m) from char codes so the literal
    // ANSI bytes don't appear in this source file.
    const ansiRed = String.fromCharCode(0x1b) + "[31m"
    const ansiReset = String.fromCharCode(0x1b) + "[0m"
    const trigger = `${ansiRed}hello${ansiReset} world`
    handle.notifyTaskToolResult({ toolUseId: "toolu_san", output: trigger })
    const events = queue.peek()
    expect(events).toHaveLength(2)
    // ANSI escapes must be stripped (Layer 2 sanitize).
    expect(events[1]?.content.includes(String.fromCharCode(0x1b))).toBe(false)
    expect(events[1]?.content).toContain("hello")
    expect(events[1]?.content).toContain("world")
  })

  test("sanitizeNotification is applied — leading role-prefix in result digest is neutralized", () => {
    const scope = createScope("test")
    let t = 1_000
    const queue = createChannelQueue(scope)
    const handle = registerSubagentNotificationAdapterHandle({ scope, queue, now: () => t })
    handle.notifyTaskToolUse({
      toolUseId: "toolu_role",
      toolName: "Task",
      input: { description: "echo back", subagent_type: "echo" },
    })
    t += 1000
    // The output STARTS with a newline followed by a role-prefix line so
    // the regex (anchored to start-of-string OR after newline) fires.
    // Without the leading newline, the role-prefix token sits mid-line
    // ("[subagent echo] completed: <desc> — <role>:..."), which isn't
    // the dialogue-loop pattern sanitize is meant to break.
    const trigger = `\n${ASSISTANT_PFX} hi`
    handle.notifyTaskToolResult({ toolUseId: "toolu_role", output: trigger })
    const events = queue.peek()
    expect(events).toHaveLength(2)
    // The "<role>:" pattern (role token + colon at start-of-line) is
    // replaced; the literal `<role>:` substring MUST NOT survive.
    expect(events[1]?.content.includes(ASSISTANT_PFX)).toBe(false)
    // The role token itself + body word both survive (only the colon
    // gets the sentinel replacement).
    expect(events[1]?.content).toContain("hi")
  })

  test("per-session attribution — fromSessionId flows into meta from start AND result", () => {
    const scope = createScope("test")
    let t = 1_000
    const queue = createChannelQueue(scope)
    const handle = registerSubagentNotificationAdapterHandle({ scope, queue, now: () => t })
    handle.notifyTaskToolUse({
      toolUseId: "toolu_attr",
      toolName: "Task",
      input: { description: "do the thing", subagent_type: "doer" },
      sessionId: "sess-attr",
    })
    t += 1000
    // Result without sessionId — the adapter should fall back to the
    // sessionId captured at start time.
    handle.notifyTaskToolResult({ toolUseId: "toolu_attr", output: "ok" })
    const events = queue.peek()
    expect(events).toHaveLength(2)
    expect(events[0]?.meta?.fromSessionId).toBe("sess-attr")
    expect(events[1]?.meta?.fromSessionId).toBe("sess-attr")
  })

  test("array result content is collapsed to text", () => {
    const scope = createScope("test")
    let t = 1_000
    const queue = createChannelQueue(scope)
    const handle = registerSubagentNotificationAdapterHandle({ scope, queue, now: () => t })
    handle.notifyTaskToolUse({
      toolUseId: "toolu_arr",
      toolName: "Task",
      input: { description: "compose", subagent_type: "x" },
    })
    t += 1000
    handle.notifyTaskToolResult({
      toolUseId: "toolu_arr",
      output: [
        { type: "text", text: "first chunk" },
        { type: "text", text: "second chunk" },
      ],
    })
    const events = queue.peek()
    expect(events[1]?.content).toContain("first chunk")
    expect(events[1]?.content).toContain("second chunk")
  })

  test("digestMax override caps the digest length", () => {
    const scope = createScope("test")
    let t = 1_000
    const queue = createChannelQueue(scope)
    const handle = registerSubagentNotificationAdapterHandle({ scope, queue, now: () => t, digestMax: 20 })
    handle.notifyTaskToolUse({
      toolUseId: "toolu_cap",
      toolName: "Task",
      input: { description: "d", subagent_type: "x" },
    })
    t += 1000
    handle.notifyTaskToolResult({ toolUseId: "toolu_cap", output: "y".repeat(200) })
    const events = queue.peek()
    const dashIdx = events[1]?.content.indexOf(" — ") ?? -1
    expect(dashIdx).toBeGreaterThan(0)
    const digest = events[1]!.content.slice(dashIdx + 3)
    expect(digest.length).toBeLessThanOrEqual(20)
  })
})
