import { describe, expect, test } from "vitest"
import { callTool, createInMemoryTribe, createTribeMcpServer, TOOL_DEFINITIONS } from "../src/index.ts"

describe("tribe-mcp", () => {
  test("ships tribe_send / history / members / broadcast", () => {
    const names = TOOL_DEFINITIONS.map((t) => t.name).sort()
    expect(names).toEqual(["tribe_broadcast", "tribe_history", "tribe_members", "tribe_send"].sort())
  })

  test("send + history round-trip", async () => {
    const tribe = createInMemoryTribe()
    await tribe.send({ from: "alice", to: "bob", text: "hi" })
    const h = await tribe.history({ forSession: "bob" })
    expect(h).toHaveLength(1)
    expect(h[0]).toMatchObject({ from: "alice", to: "bob", text: "hi" })
  })

  test("broadcast delivers to peers, not sender", async () => {
    const tribe = createInMemoryTribe()
    // seed members: alice + bob
    await tribe.send({ from: "alice", to: "bob", text: "ping" })
    tribe.drain("bob")
    await tribe.send({ from: "alice", to: "*", text: "hello everyone" })
    expect(tribe.drain("alice")).toEqual([])
    const bobInbox = tribe.drain("bob")
    expect(bobInbox).toHaveLength(1)
    expect(bobInbox[0]?.text).toBe("hello everyone")
  })

  test("MCP server dispatches tools/call", async () => {
    const tribe = createInMemoryTribe()
    const server = createTribeMcpServer(tribe, "alice")
    const resp = await server.handle({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "tribe_broadcast", arguments: { message: "rollcall" } },
    })
    expect(resp).toBeTruthy()
    const history = await tribe.history({ forSession: "alice" })
    expect(history[0]?.text).toBe("rollcall")
  })

  test("callTool direct dispatch", async () => {
    const tribe = createInMemoryTribe()
    await callTool(tribe, "alice", "tribe_send", { to: "bob", message: "direct" })
    const h = await tribe.history({ forSession: "bob" })
    expect(h[0]?.text).toBe("direct")
  })
})
