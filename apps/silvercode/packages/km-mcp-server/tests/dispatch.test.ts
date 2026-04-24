import { describe, expect, test } from "vitest"
import { type KmContext, callTool, createMcpServer, TOOL_DEFINITIONS } from "../src/index.ts"

function makeContext(overrides: Partial<KmContext> = {}): KmContext {
  return {
    async search(): Promise<[]> {
      return []
    },
    async getNode(): Promise<null> {
      return null
    },
    async getBoard(): Promise<[]> {
      return []
    },
    async renderPath(): Promise<[]> {
      return []
    },
    ...overrides,
  }
}

describe("km-mcp-server", () => {
  test("initialize returns the protocol version + tools capability", async () => {
    const server = createMcpServer(makeContext())
    const resp = await server.handle({ jsonrpc: "2.0", id: 1, method: "initialize" })
    expect(resp).toMatchObject({
      id: 1,
      result: {
        protocolVersion: expect.any(String),
        capabilities: { tools: {} },
        serverInfo: expect.objectContaining({ name: "km-mcp-server" }),
      },
    })
  })

  test("tools/list returns all four read-only tools", async () => {
    const server = createMcpServer(makeContext())
    const resp = await server.handle({ jsonrpc: "2.0", id: 2, method: "tools/list" })
    expect(resp).toBeTruthy()
    if (!resp || "error" in resp) throw new Error("expected result")
    const names = (resp.result as { tools: Array<{ name: string }> }).tools.map((t) => t.name).sort()
    expect(names).toEqual(["km_get_board", "km_get_node", "km_render_path", "km_search"])
    expect(names.length).toBe(TOOL_DEFINITIONS.length)
  })

  test("tools/call dispatches km_search", async () => {
    const server = createMcpServer(
      makeContext({
        async search(q: string) {
          expect(q).toBe("foo")
          return [{ id: "n1", title: "Foo" }] as never
        },
      }),
    )
    const resp = await server.handle({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "km_search", arguments: { query: "foo" } },
    })
    expect(resp).toBeTruthy()
    if (!resp || "error" in resp) throw new Error("expected result")
    const content = resp.result as { content: Array<{ text: string }>; isError: boolean }
    expect(content.isError).toBe(false)
    expect(content.content[0]?.text).toContain("Foo")
  })

  test("callTool routes by name", async () => {
    let nodeRequested = ""
    const ctx = makeContext({
      async getNode(id: string) {
        nodeRequested = id
        return null
      },
    })
    await callTool(ctx, "km_get_node", { id: "abc" })
    expect(nodeRequested).toBe("abc")
  })

  test("unknown method returns -32601", async () => {
    const server = createMcpServer(makeContext())
    const resp = await server.handle({ jsonrpc: "2.0", id: 4, method: "resources/read" })
    expect(resp).toBeTruthy()
    if (!resp || !("error" in resp)) throw new Error("expected error")
    expect(resp.error.code).toBe(-32601)
  })
})
