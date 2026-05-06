import { createScope } from "@silvery/scope"
import { describe, expect, test } from "vitest"
import { createFakeAcpAgentBackend } from "../src/agent-backends.ts"
import { createChatSessionStore, withAgentBackends, withChat } from "../src/chat.ts"
import type { SessionId } from "../src/events.ts"

describe("chat provider store", () => {
  test("can instantiate chat with a DI-created session and no backend registry", () => {
    const session = createChatSessionStore({ id: "prebuilt-session" as SessionId })
    const app = withChat({ session })({})

    expect(app.chat.sessions().map((item) => item.id)).toEqual(["prebuilt-session"])
    expect(app.chat.session()?.id).toBe("prebuilt-session")
    expect(app.chat.backends).toBeUndefined()
    expect(session.conn()).toBeNull()
  })

  test("agent backend provider opens a live connection into session.conn", async () => {
    const fake = createFakeAcpAgentBackend("codex", { sessionIdPrefix: "chat-codex" })
    const app = withAgentBackends({ backends: [fake.backend] })(withChat()({}))

    await using scope = createScope("test-chat-provider-open")
    const session = await app.chat.open({
      scope,
      backendId: "codex",
      cwd: "/tmp/silvercode-chat",
    })

    expect(app.chat.backends?.get("codex")).toBe(fake.backend)
    expect(app.chat.session()).toBe(session)
    expect(session.id).toBe("chat-codex-1")
    expect(session.conn()).not.toBeNull()
    expect(session.state()).toMatchObject({
      sessionId: "chat-codex-1",
      cwd: "/tmp/silvercode-chat",
      status: "idle",
    })
    expect(fake.controller.getSession("chat-codex-1")).toMatchObject({ sessionId: "chat-codex-1" })
  })
})
