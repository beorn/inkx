/**
 * Layer 3 — multi-backend fake-session helpers.
 *
 * The agent-harness package exposes three spawn entry points (`spawnClaude`,
 * `spawnCodex`, `spawnSdk`) and they all return the same `AgentSession`
 * surface. Differences between them live in the metadata they emit (model
 * label, apiKeySource, tool list, session-id format).
 *
 * `createFakeCodexSession` and `createFakeSdkSession` are thin convenience
 * factories on top of the canonical `createFakeSession`. The init-event
 * helpers (`codexInitEvent`, `sdkInitEvent`) emit the right shape so tests
 * that exercise multi-backend logic don't have to hand-roll
 * provider-specific fixtures every time.
 */
import { describe, expect, test } from "vitest"
import type { SessionId } from "@km/agent-harness"
import { createSilvercodeController } from "../src/controller.ts"
import { createFakeCodexSession, codexInitEvent } from "../src/test/fake-codex-session.ts"
import { createFakeSdkSession, sdkInitEvent } from "../src/test/fake-sdk-session.ts"

describe("layer 3: codex fake session", () => {
  test("createFakeCodexSession defaults session-id to a 'codex-' prefix", () => {
    const fake = createFakeCodexSession()
    expect(fake.sessionId.startsWith("codex-")).toBe(true)
  })

  test("codexInitEvent populates OpenAI defaults (model gpt-5-codex, OPENAI_API_KEY)", async () => {
    const sessionId = "codex-test-1" as SessionId
    const fake = createFakeCodexSession({ sessionId })
    const controller = createSilvercodeController({
      cwd: "/tmp/fake",
      bare: true,
      initialSessions: 0,
      spawnFactory: () => fake,
    })
    const handle = await controller.spawnSession("codex")

    fake.emit(codexInitEvent({ sessionId }))

    expect(handle.store.state.get().model).toBe("gpt-5-codex")
    expect(handle.store.state.get().apiKeySource).toBe("OPENAI_API_KEY")
    expect(handle.store.state.get().tools).toContain("shell")
    expect(handle.store.state.get().tools).toContain("apply_patch")

    controller.closeAll()
  })

  test("codex fake supports the same script() helper as the canonical fake", () => {
    const fake = createFakeCodexSession()
    let count = 0
    fake.subscribe(() => {
      count++
    })
    fake.script(
      [codexInitEvent({ sessionId: fake.sessionId }), { kind: "status", sessionId: fake.sessionId, status: "ready", ts: 1 }],
      0,
    )
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(count).toBe(2)
        resolve()
      }, 5)
    })
  })
})

describe("layer 3: sdk fake session", () => {
  test("createFakeSdkSession defaults session-id to a 'sdk-' prefix", () => {
    const fake = createFakeSdkSession()
    expect(fake.sessionId.startsWith("sdk-")).toBe(true)
  })

  test("sdkInitEvent reports apiKeySource ANTHROPIC_API_KEY (no Claude Code OAuth)", async () => {
    const sessionId = "sdk-test-1" as SessionId
    const fake = createFakeSdkSession({ sessionId })
    const controller = createSilvercodeController({
      cwd: "/tmp/fake",
      bare: true,
      initialSessions: 0,
      spawnFactory: () => fake,
    })
    const handle = await controller.spawnSession("sdk")

    fake.emit(sdkInitEvent({ sessionId }))

    expect(handle.store.state.get().apiKeySource).toBe("ANTHROPIC_API_KEY")
    expect(handle.store.state.get().model).toBe("claude-sonnet-4-6")
    // SDK has no CLI version — explicit "n/a" so the side-panel renders a
    // stable placeholder instead of an empty string.
    expect(handle.store.state.get().claudeCodeVersion).toBe("n/a")

    controller.closeAll()
  })

  test("send() on an sdk fake records to the same `sent` buffer as the canonical fake", () => {
    const fake = createFakeSdkSession()
    fake.send("hello")
    fake.send("world")
    expect(fake.sent).toHaveLength(2)
    expect(fake.sent[0]!.type).toBe("user")
    expect(fake.sent[0]!.payload).toBe("hello")
    expect(fake.sent[1]!.payload).toBe("world")
  })
})
