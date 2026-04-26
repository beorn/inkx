import { describe, expect, test } from "vitest"
import { callTool, createInMemoryTribe, createTribeMcpServer, TOOL_DEFINITIONS } from "../src/index.ts"

describe("tribe-mcp (smoke)", () => {
  test("ships the full tool surface", () => {
    const names = TOOL_DEFINITIONS.map((t) => t.name).sort()
    expect(names).toEqual(
      [
        "tribe_broadcast",
        "tribe_claim_chief",
        "tribe_history",
        "tribe_join",
        "tribe_members",
        "tribe_release_chief",
        "tribe_send",
      ].sort(),
    )
  })

  test("send + history round-trip", async () => {
    const tribe = createInMemoryTribe()
    await tribe.join({ name: "alice" })
    await tribe.join({ name: "bob" })
    await tribe.send({ from: "alice", to: "bob", text: "hi", scope: "all" })
    const h = await tribe.history({ forSession: "bob", scope: "all" })
    expect(h).toHaveLength(1)
    expect(h[0]).toMatchObject({ from: "alice", to: "bob", text: "hi" })
  })

  test("broadcast delivers to peers, not sender", async () => {
    const tribe = createInMemoryTribe()
    await tribe.join({ name: "alice" })
    await tribe.join({ name: "bob" })
    await tribe.send({ from: "alice", to: "*", text: "hello everyone", scope: "all" })
    expect(tribe.drain("alice")).toEqual([])
    const bobInbox = tribe.drain("bob")
    expect(bobInbox).toHaveLength(1)
    expect(bobInbox[0]?.text).toBe("hello everyone")
  })

  test("MCP server dispatches tools/call", async () => {
    const tribe = createInMemoryTribe()
    const server = createTribeMcpServer(tribe, "alice", { defaultScope: "all" })
    await tribe.join({ name: "alice" })
    const resp = await server.handle({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "tribe_broadcast", arguments: { message: "rollcall" } },
    })
    expect(resp).toBeTruthy()
    const history = await tribe.history({ forSession: "alice", scope: "all" })
    expect(history[0]?.text).toBe("rollcall")
  })

  test("callTool direct dispatch", async () => {
    const tribe = createInMemoryTribe()
    await tribe.join({ name: "alice" })
    await tribe.join({ name: "bob" })
    await callTool(tribe, "alice", "tribe_send", { to: "bob", message: "direct", scope: "all" })
    const h = await tribe.history({ forSession: "bob", scope: "all" })
    expect(h[0]?.text).toBe("direct")
  })
})
