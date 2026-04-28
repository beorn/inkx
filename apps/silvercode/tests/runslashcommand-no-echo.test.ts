/**
 * Bug: km-silvercode.prompt-echo-in-chat.
 *
 * When the user types a slash command like `/file` or `/handoff`, the
 * prompt text appeared as a regular user-message in the chat AND the
 * slash command ran. Result: a duplicated visual entry — the slash
 * command name shows up where it should be silently consumed.
 *
 * Expected: `controller.runSlashCommand` MUST NOT post an optimistic
 * user-message into the session store. The chat history stays clean;
 * only outcome events (e.g. assistant replies) appear.
 *
 * Distinct from `controller.send` — normal sends DO post an optimistic
 * user-message + arm the prompt-echo-strip. Slash commands bypass both.
 */
import { describe, expect, test } from "vitest"
import type { AgentSession } from "@km/agent-harness"
import { createFakeSession } from "../src/test/fake-session.ts"
import { createSilvercodeController } from "../src/controller.ts"

describe("runSlashCommand — no optimistic echo into chat", () => {
  test("invoking /file leaves chat with zero user-message entries", async () => {
    const fake = createFakeSession()
    const controller = createSilvercodeController({
      cwd: "/tmp/silvercode-slash-test",
      model: "claude-test",
      bare: false,
      initialSessions: 0,
      spawnFactory: () => fake as unknown as AgentSession,
    })

    const handle = await controller.spawnSession("s0")

    // Sanity — empty chat to start.
    expect(handle.store.state.get().messages).toHaveLength(0)

    controller.runSlashCommand(handle.id, "/file")

    const messages = handle.store.state.get().messages
    expect(messages.filter((m) => m.role === "user")).toHaveLength(0)
    expect(messages).toHaveLength(0)
  })

  test("normal send still posts an optimistic user-message (regression guard)", async () => {
    const fake = createFakeSession()
    const controller = createSilvercodeController({
      cwd: "/tmp/silvercode-send-test",
      model: "claude-test",
      bare: false,
      initialSessions: 0,
      spawnFactory: () => fake as unknown as AgentSession,
    })

    const handle = await controller.spawnSession("s0")
    controller.send(handle.id, "what repo is this?")

    const messages = handle.store.state.get().messages
    const userMsgs = messages.filter((m) => m.role === "user")
    expect(userMsgs).toHaveLength(1)
    expect(userMsgs[0]!.text).toBe("what repo is this?")
  })

  test("runSlashCommand still ships the text to the underlying agent session", async () => {
    const fake = createFakeSession()
    const controller = createSilvercodeController({
      cwd: "/tmp/silvercode-slash-send-test",
      model: "claude-test",
      bare: false,
      initialSessions: 0,
      spawnFactory: () => fake as unknown as AgentSession,
    })

    const handle = await controller.spawnSession("s0")
    controller.runSlashCommand(handle.id, "/compact")

    const userSends = fake.sent.filter((s) => s.type === "user")
    expect(userSends).toHaveLength(1)
    expect(userSends[0]!.payload).toBe("/compact")
  })
})
