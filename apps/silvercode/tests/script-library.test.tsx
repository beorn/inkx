/**
 * Layer 3 — pre-scripted scenario library coverage.
 *
 * The bead spec (km-silvercode.test-system) calls out six pre-scripted
 * scenarios as deliverables: helloWorld, bashTool, longToolResult,
 * multiTurn, permissionRequest, sessionEnd. Each one needs at least one
 * test that runs it through a real controller + session-store and asserts
 * the resulting state shape.
 *
 * What this asserts
 * -----------------
 * - Each script is well-formed (the session-store consumes it without
 *   throwing and reaches the expected terminal status).
 * - Specific milestones in each script land in observable state — model
 *   label, message count, tool-call count, status enum.
 *
 * Why these matter
 * ----------------
 * Without per-script smoke tests, a future event-shape refactor (e.g.
 * renaming `tool-use` → `tool_call`) could silently break a script the
 * higher-level visual tests still happen to mostly handle. These keep
 * the script library honest at the lowest layer.
 */
import { describe, expect, test } from "vitest"
import { createSilvercodeController } from "../src/controller.ts"
import { createFakeSession } from "../src/test/fake-session.ts"
import { helloWorld } from "../src/test/scripts/helloWorld.ts"
import { bashTool } from "../src/test/scripts/bashTool.ts"
import { longToolResult } from "../src/test/scripts/longToolResult.ts"
import { multiTurn } from "../src/test/scripts/multiTurn.ts"

describe("layer 3: script library", () => {
  test("helloWorld script lands assistant text and ends idle", async () => {
    const fake = createFakeSession()
    const controller = createSilvercodeController({
      cwd: "/tmp/fake",
      bare: true,
      initialSessions: 0,
      spawnFactory: () => fake,
    })
    const handle = await controller.spawnSession("hello")

    for (const ev of helloWorld) fake.emit(ev)

    const state = handle.store.state.get()
    expect(state.status).toBe("idle")
    expect(state.model).toBe("claude-sonnet-4-6")
    // The script has one user-message and one assistant turn.
    expect(state.messages.length).toBeGreaterThanOrEqual(2)
    const assistantText = state.messages
      .filter((m) => m.role === "assistant")
      .map((m) => m.text)
      .join("")
    expect(assistantText).toContain("Hi!")

    controller.closeAll()
  })

  test("bashTool script registers a tool-use + tool-result and ends idle", async () => {
    const fake = createFakeSession()
    const controller = createSilvercodeController({
      cwd: "/tmp/fake",
      bare: true,
      initialSessions: 0,
      spawnFactory: () => fake,
    })
    const handle = await controller.spawnSession("bash")

    for (const ev of bashTool) fake.emit(ev)

    const state = handle.store.state.get()
    expect(state.status).toBe("idle")
    const toolCalls = state.messages.flatMap((m) => m.toolCalls)
    const toolResults = state.messages.flatMap((m) => m.toolResults)
    expect(toolCalls).toHaveLength(1)
    expect(toolCalls[0]!.name).toBe("Bash")
    expect(toolResults).toHaveLength(1)
    expect(toolResults[0]!.is_error).toBe(false)

    controller.closeAll()
  })

  test("longToolResult script delivers a 1KB tool output without truncation", async () => {
    const fake = createFakeSession()
    const controller = createSilvercodeController({
      cwd: "/tmp/fake",
      bare: true,
      initialSessions: 0,
      spawnFactory: () => fake,
    })
    const handle = await controller.spawnSession("long")

    for (const ev of longToolResult) fake.emit(ev)

    const state = handle.store.state.get()
    expect(state.status).toBe("idle")
    const toolResults = state.messages.flatMap((m) => m.toolResults)
    expect(toolResults).toHaveLength(1)
    const output = toolResults[0]!.output as string
    expect(typeof output).toBe("string")
    expect(output.length).toBe(1024)
    // No whitespace in the blob — the overflow regression's actual shape.
    expect(/\s/.test(output)).toBe(false)

    controller.closeAll()
  })

  test("multiTurn script accumulates 3 assistant turns", async () => {
    const fake = createFakeSession()
    const controller = createSilvercodeController({
      cwd: "/tmp/fake",
      bare: true,
      initialSessions: 0,
      spawnFactory: () => fake,
    })
    const handle = await controller.spawnSession("multi")

    for (const ev of multiTurn) fake.emit(ev)

    const state = handle.store.state.get()
    expect(state.status).toBe("idle")
    // 3 user messages + 3 assistant turns = at least 6 message rows.
    expect(state.messages.length).toBeGreaterThanOrEqual(6)
    const assistantText = state.messages
      .filter((m) => m.role === "assistant")
      .map((m) => m.text)
      .join(" ")
    expect(assistantText).toContain("first.")
    expect(assistantText).toContain("second.")
    expect(assistantText).toContain("third.")

    // Token usage accumulated across turn-end events (3 turns × 10 input + 5 output).
    expect(state.cost.inputTokens).toBeGreaterThanOrEqual(30)
    expect(state.cost.outputTokens).toBeGreaterThanOrEqual(15)

    controller.closeAll()
  })
})
