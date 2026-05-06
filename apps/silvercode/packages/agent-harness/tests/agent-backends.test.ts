import { createScope } from "@silvery/scope"
import { describe, expect, test } from "vitest"
import {
  ACP_REGISTRY_IDS,
  createAgentBackends,
  createFakeAcpAgentBackend,
  createFakeAcpAgentBackends,
} from "../src/agent-backends.ts"
import type { AgentEvent } from "../src/events.ts"

describe("agent backend providers", () => {
  test("fake ACP backend connects through provider injection without a global spawn override", async () => {
    const fake = createFakeAcpAgentBackend("codex", { sessionIdPrefix: "provider-codex" })
    const backends = createAgentBackends([fake.backend])

    await using scope = createScope("test-agent-backend-provider")
    const conn = await backends.get("codex")!.connect(scope, { cwd: "/tmp/silvercode-provider" })
    const events: AgentEvent[] = []
    conn.subscribe((event) => events.push(event))

    await conn.prompt([{ type: "text", text: "ping" }])

    expect(conn.sessionId).toBe("provider-codex-1")
    expect(events.some((event) => event.kind === "text-delta")).toBe(true)
    expect(fake.controller.getSession(conn.sessionId)).toMatchObject({ sessionId: conn.sessionId })
  })

  test("complete fake ACP backend set covers every registered ACP backend", async () => {
    const fakes = createFakeAcpAgentBackends({ sessionIdPrefix: "all-fake" })

    expect([...fakes.backends.keys()]).toEqual([...ACP_REGISTRY_IDS])

    for (const id of ACP_REGISTRY_IDS) {
      await using scope = createScope(`test-agent-backend-${id}`)
      const conn = await fakes.backends.get(id)!.connect(scope, { cwd: "/tmp/silvercode-provider-all" })
      await conn.prompt([{ type: "text", text: "ping" }])

      expect(conn.sessionId).toBe(`all-fake-${id}-1`)
      expect(fakes.controllers.get(id)!.getSession(conn.sessionId)).toMatchObject({ sessionId: conn.sessionId })
    }
  })
})
