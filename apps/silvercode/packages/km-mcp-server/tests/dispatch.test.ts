import { describe, expect, test } from "vitest"
import { type KmContext, callTool, createMcpServer, DANGEROUS_TOOLS, TOOL_DEFINITIONS } from "../src/index.ts"

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
    async recent(): Promise<[]> {
      return []
    },
    ...overrides,
  }
}

describe("km-mcp-server transport / dispatch", () => {
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

  test("tools/list exposes the full v1 + v2 surface", async () => {
    const server = createMcpServer(makeContext())
    const resp = await server.handle({ jsonrpc: "2.0", id: 2, method: "tools/list" })
    expect(resp).toBeTruthy()
    if (!resp || "error" in resp) throw new Error("expected result")
    const names = (resp.result as { tools: Array<{ name: string }> }).tools.map((t) => t.name).sort()
    expect(names).toEqual([
      "km_archive_card",
      "km_create_card",
      "km_get_board",
      "km_get_node",
      "km_get_selection",
      "km_move_card",
      "km_recent",
      "km_render_path",
      "km_search",
      "km_select",
      "km_update_card",
    ])
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

describe("km-mcp-server dangerous flag (v2 mutation surface)", () => {
  test("DANGEROUS_TOOLS contains exactly the mutation set", () => {
    expect([...DANGEROUS_TOOLS].sort()).toEqual(
      ["km_archive_card", "km_create_card", "km_move_card", "km_select", "km_update_card"].sort(),
    )
  })

  test("read-only tools are not flagged dangerous", () => {
    for (const name of [
      "km_search",
      "km_get_node",
      "km_get_board",
      "km_render_path",
      "km_recent",
      "km_get_selection",
    ]) {
      const def = TOOL_DEFINITIONS.find((t) => t.name === name)
      expect(def, `missing definition for ${name}`).toBeTruthy()
      expect(def?.dangerous ?? false).toBe(false)
    }
  })

  test("mutating tools are flagged dangerous: true", () => {
    for (const name of ["km_create_card", "km_update_card", "km_move_card", "km_archive_card", "km_select"]) {
      const def = TOOL_DEFINITIONS.find((t) => t.name === name)
      expect(def, `missing definition for ${name}`).toBeTruthy()
      expect(def?.dangerous).toBe(true)
    }
  })

  test("mutation tool stubs throw when adapter does not implement them", async () => {
    const ctx = makeContext()
    for (const [name, args] of [
      ["km_create_card", { title: "x" }],
      ["km_update_card", { id: "x" }],
      ["km_move_card", { id: "x", toColumnId: "c" }],
      ["km_archive_card", { id: "x" }],
      ["km_select", { ids: ["x"] }],
    ] as const) {
      await expect(callTool(ctx, name, args as Record<string, unknown>)).rejects.toThrow(/not yet implemented/i)
    }
  })

  test("mutation tools dispatch to adapter when wired in", async () => {
    let createArgs: unknown = null
    const ctx = makeContext({
      async createCard(args) {
        createArgs = args
        return { id: "new-1", title: args.title } as never
      },
    })
    const result = await callTool(ctx, "km_create_card", { title: "Hello", body: "World" })
    expect(createArgs).toEqual({ title: "Hello", body: "World", parentId: undefined, columnId: undefined })
    expect(result).toMatchObject({ id: "new-1", title: "Hello" })
  })
})

describe("km-mcp-server selection provider", () => {
  test("km_get_selection returns empty when no provider is wired", async () => {
    const ctx = makeContext()
    const result = (await callTool(ctx, "km_get_selection", {})) as { ids: string[] }
    expect(result).toEqual({ ids: [] })
  })

  test("km_get_selection delegates to provider when present", async () => {
    const ctx = makeContext({
      async getSelection() {
        return { ids: ["card-1", "card-2"] }
      },
    })
    const result = (await callTool(ctx, "km_get_selection", {})) as { ids: string[] }
    expect(result).toEqual({ ids: ["card-1", "card-2"] })
  })

  test("km_get_selection round-trips through the JSON-RPC envelope", async () => {
    const server = createMcpServer(
      makeContext({
        async getSelection() {
          return { ids: ["a", "b"] }
        },
      }),
    )
    const resp = await server.handle({
      jsonrpc: "2.0",
      id: 9,
      method: "tools/call",
      params: { name: "km_get_selection", arguments: {} },
    })
    expect(resp).toBeTruthy()
    if (!resp || "error" in resp) throw new Error("expected result")
    const content = resp.result as { content: Array<{ text: string }>; isError: boolean }
    expect(content.isError).toBe(false)
    expect(content.content[0]?.text).toContain('"a"')
    expect(content.content[0]?.text).toContain('"b"')
  })
})

describe("km-mcp-server km_recent", () => {
  test("dispatches limit and since to the context", async () => {
    let captured: { limit?: number; since?: number } | undefined
    const ctx = makeContext({
      async recent(opts) {
        captured = opts
        return []
      },
    })
    await callTool(ctx, "km_recent", { limit: 5, since: 1000 })
    expect(captured).toEqual({ limit: 5, since: 1000 })
  })

  test("defaults limit to 20 and omits since when not provided", async () => {
    let captured: { limit?: number; since?: number } | undefined
    const ctx = makeContext({
      async recent(opts) {
        captured = opts
        return []
      },
    })
    await callTool(ctx, "km_recent", {})
    expect(captured).toEqual({ limit: 20, since: undefined })
  })
})

describe("km-mcp-server JSON-RPC envelope round-trips", () => {
  test("tools/call surfaces stub errors as isError: true responses", async () => {
    const server = createMcpServer(makeContext())
    const resp = await server.handle({
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: { name: "km_create_card", arguments: { title: "x" } },
    })
    expect(resp).toBeTruthy()
    if (!resp || "error" in resp) throw new Error("expected result envelope (errors are content, not jsonrpc errors)")
    const content = resp.result as { content: Array<{ text: string }>; isError: boolean }
    expect(content.isError).toBe(true)
    expect(content.content[0]?.text).toMatch(/not yet implemented/i)
  })

  test("tools/list payload preserves dangerous flag for the host", async () => {
    const server = createMcpServer(makeContext())
    const resp = await server.handle({ jsonrpc: "2.0", id: 8, method: "tools/list" })
    if (!resp || "error" in resp) throw new Error("expected result")
    const tools = (resp.result as { tools: Array<{ name: string; dangerous?: boolean }> }).tools
    const create = tools.find((t) => t.name === "km_create_card")
    const search = tools.find((t) => t.name === "km_search")
    expect(create?.dangerous).toBe(true)
    expect(search?.dangerous).toBe(false)
  })
})
