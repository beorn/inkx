import { describe, expect, test, vi } from "vitest"
import { createSilvercodeController } from "../src/controller.ts"
import { createFakeSession } from "../src/test/fake-session.ts"
import type { SessionId, ToolUseId, TurnId } from "@km/agent-harness"

describe("controller.closeAll", () => {
  test("passes reasoning effort through spawn options", async () => {
    const fake = createFakeSession()
    let capturedReasoningEffort: string | undefined
    let capturedSessionConfig: Readonly<Record<string, string | boolean>> | undefined
    const controller = createSilvercodeController({
      cwd: "/tmp/silvercode-controller-reasoning-effort",
      bare: true,
      initialSessions: 0,
      agent: "codex",
      reasoningEffort: "xhigh",
      sessionConfig: { permission_policy: "on-request", web_search: true },
      disableNotificationAdapters: true,
      disableLegacyTribeSource: true,
      spawnFactory: (opts) => {
        capturedReasoningEffort = opts.reasoningEffort
        capturedSessionConfig = opts.sessionConfig
        return fake
      },
    })

    await controller.spawnSession("test")

    expect(capturedReasoningEffort).toBe("xhigh")
    expect(capturedSessionConfig).toEqual({ permission_policy: "on-request", web_search: true })
    controller.closeAll()
  })

  test("setReasoningEffort reaches ACP session config", async () => {
    const fake = createFakeSession()
    const setSessionConfigOption = vi.fn(async () => ({ configOptions: [] }))
    const controller = createSilvercodeController({
      cwd: "/tmp/silvercode-controller-reasoning-effort-set",
      bare: true,
      initialSessions: 0,
      agent: "codex",
      disableNotificationAdapters: true,
      disableLegacyTribeSource: true,
      spawnFactory: () =>
        Object.assign(fake, {
          configOptions: [{ type: "select", id: "reasoning_effort", name: "Reasoning", currentValue: "medium" }],
          setSessionConfigOption,
        }),
    })

    const handle = await controller.spawnSession("test")
    await controller.setReasoningEffort(handle.id, "high")

    expect(setSessionConfigOption).toHaveBeenCalledWith({
      configId: "reasoning_effort",
      value: "high",
    })
    controller.closeAll()
  })

  test("setSessionConfigOption reaches any advertised ACP config option", async () => {
    const fake = createFakeSession()
    const setSessionConfigOption = vi.fn(async () => ({ configOptions: [] }))
    const controller = createSilvercodeController({
      cwd: "/tmp/silvercode-controller-config-option-set",
      bare: true,
      initialSessions: 0,
      agent: "claude",
      disableNotificationAdapters: true,
      disableLegacyTribeSource: true,
      spawnFactory: () =>
        Object.assign(fake, {
          configOptions: [{ type: "select", id: "permission_policy", name: "Permission", currentValue: "auto" }],
          setSessionConfigOption,
        }),
    })

    const handle = await controller.spawnSession("test")
    await controller.setSessionConfigOption(handle.id, {
      configId: "permission_policy",
      value: "ask",
    })

    expect(setSessionConfigOption).toHaveBeenCalledWith({
      configId: "permission_policy",
      value: "ask",
    })
    controller.closeAll()
  })

  test("surfaces synchronous close failures and keeps closing", async () => {
    const good = createFakeSession()
    const bad = createFakeSession()
    bad.close = () => {
      throw new Error("boom during close")
    }
    const spawned = [bad, good]
    const controller = createSilvercodeController({
      cwd: "/tmp/silvercode-closeall-test",
      bare: true,
      initialSessions: 0,
      disableNotificationAdapters: true,
      disableLegacyTribeSource: true,
      spawnFactory: () => {
        const next = spawned.shift()
        if (!next) throw new Error("unexpected spawn")
        return next
      },
    })

    const badHandle = await controller.spawnSession("bad")
    const goodHandle = await controller.spawnSession("good")

    expect(() => controller.closeAll()).not.toThrow()
    expect(goodHandle.session.closed).toBe(true)
    expect(badHandle.store.state.get().lastError?.message).toBe("session close failed: boom during close")
  })
})

describe("controller subagent prose handling", () => {
  test("does not treat assistant prose claims as subagent data-model errors", async () => {
    const providerSessionId = "provider-s1" as SessionId
    const turnId = "assistant-turn" as TurnId
    const fake = createFakeSession({ sessionId: providerSessionId })
    const controller = createSilvercodeController({
      cwd: "/tmp/silvercode-controller-subagent-prose",
      bare: true,
      initialSessions: 0,
      agent: "claude-code",
      disableNotificationAdapters: true,
      disableLegacyTribeSource: true,
      spawnFactory: () => fake,
    })

    await controller.spawnSession("test")
    fake.emit({
      kind: "user-message",
      sessionId: providerSessionId,
      turnId: "user-turn" as TurnId,
      text: "use 4 subagents to sleep 20s",
      ts: 1_000,
    })
    fake.emit({
      kind: "turn-start",
      sessionId: providerSessionId,
      turnId,
      role: "assistant",
      ts: 1_100,
    })
    fake.emit({
      kind: "tool-use",
      sessionId: providerSessionId,
      turnId,
      id: "toolu_2" as ToolUseId,
      name: "Agent",
      input: { description: "Sleep 20s #2" },
      ts: 1_200,
    })
    fake.emit({
      kind: "tool-result",
      sessionId: providerSessionId,
      id: "toolu_2" as ToolUseId,
      output: "agent 2: done sleeping 20s",
      ts: 21_200,
    })

    expect(() =>
      fake.emit({
        kind: "text-delta",
        sessionId: providerSessionId,
        turnId,
        blockIndex: 0,
        text: "All 4 done in parallel. Wallclock ~26s.",
        ts: 21_300,
      }),
    ).not.toThrow()
    expect(fake.sent).toHaveLength(0)
    expect(controller.snapshot()[0]?.store.state.get().lastError).toBeNull()

    expect(() =>
      fake.emit({
        kind: "turn-end",
        sessionId: providerSessionId,
        turnId,
        stopReason: "end_turn",
        ts: 21_301,
      }),
    ).not.toThrow()
  })
})
