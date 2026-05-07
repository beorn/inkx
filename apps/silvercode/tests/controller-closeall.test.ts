import { describe, expect, test } from "vitest"
import { createSilvercodeController } from "../src/controller.ts"
import { createFakeSession } from "../src/test/fake-session.ts"
import type { SessionId, ToolUseId, TurnId } from "@km/agent-harness"

describe("controller.closeAll", () => {
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

describe("controller subagent invariants", () => {
  test("throws when Claude claims completed subagents that were never emitted as data", async () => {
    const providerSessionId = "provider-s1" as SessionId
    const turnId = "assistant-turn" as TurnId
    const fake = createFakeSession({ sessionId: providerSessionId })
    const controller = createSilvercodeController({
      cwd: "/tmp/silvercode-controller-subagent-invariant",
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
    ).toThrow(/subagent activity invariant failed.*claimed 4.*observed 1/s)
  })
})
