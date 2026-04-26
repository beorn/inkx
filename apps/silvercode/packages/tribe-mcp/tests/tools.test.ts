/**
 * Tool-surface tests for @km/tribe-mcp.
 *
 * Covers:
 *   - JSON-RPC request/response shape for every tool
 *   - `dangerous: true` on every mutating tool, false on read-only
 *   - Scope filtering (sending to a peer outside scope rejects)
 *   - JSONL backend persistence across restarts (chief, peers, history)
 *   - History pagination + filtering
 */

import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import {
  applyHistoryFilter,
  callTool,
  createInMemoryTribe,
  createTribeMcpServer,
  DANGEROUS_TOOLS,
  filterRecipientsByScope,
  TOOL_DEFINITIONS,
  TRIBE_SCOPES,
  type TribeMember,
} from "../src/index.ts"
import { createJsonlBackend } from "../src/bin.ts"

describe("tool definitions", () => {
  test("every tool declares dangerous explicitly", () => {
    for (const tool of TOOL_DEFINITIONS) {
      expect(typeof tool.dangerous).toBe("boolean")
    }
  })

  test("mutating tools are dangerous, read-only are not", () => {
    const expectedDangerous = new Set([
      "tribe_send",
      "tribe_broadcast",
      "tribe_claim_chief",
      "tribe_release_chief",
      "tribe_join",
    ])
    const expectedSafe = new Set(["tribe_members", "tribe_history"])

    for (const tool of TOOL_DEFINITIONS) {
      if (expectedDangerous.has(tool.name)) {
        expect(tool.dangerous, `${tool.name} should be dangerous`).toBe(true)
      } else if (expectedSafe.has(tool.name)) {
        expect(tool.dangerous, `${tool.name} should be safe`).toBe(false)
      }
    }
    expect(DANGEROUS_TOOLS).toEqual(expectedDangerous)
  })

  test("scoped tools advertise the scope enum", () => {
    const scoped = ["tribe_send", "tribe_broadcast", "tribe_members", "tribe_history"]
    for (const name of scoped) {
      const tool = TOOL_DEFINITIONS.find((t) => t.name === name)!
      expect(tool.inputSchema.properties.scope).toBeDefined()
      expect(tool.inputSchema.properties.scope?.enum).toEqual(TRIBE_SCOPES)
    }
  })
})

describe("JSON-RPC dispatch", () => {
  test("initialize returns server info", async () => {
    const tribe = createInMemoryTribe()
    const server = createTribeMcpServer(tribe, "alice")
    const resp = await server.handle({ jsonrpc: "2.0", id: 1, method: "initialize" })
    expect(resp).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: { serverInfo: { name: "tribe-mcp" } },
    })
  })

  test("tools/list returns the canonical surface", async () => {
    const tribe = createInMemoryTribe()
    const server = createTribeMcpServer(tribe, "alice")
    const resp = await server.handle({ jsonrpc: "2.0", id: 2, method: "tools/list" })
    expect(resp && "result" in resp).toBe(true)
    if (resp && "result" in resp) {
      const tools = (resp.result as { tools: { name: string; dangerous: boolean }[] }).tools
      expect(tools.map((t) => t.name).sort()).toEqual(TOOL_DEFINITIONS.map((t) => t.name).sort())
      expect(tools.find((t) => t.name === "tribe_send")?.dangerous).toBe(true)
      expect(tools.find((t) => t.name === "tribe_history")?.dangerous).toBe(false)
    }
  })

  test("tools/call wraps result in MCP content shape", async () => {
    const tribe = createInMemoryTribe()
    await tribe.join({ name: "alice" })
    const server = createTribeMcpServer(tribe, "alice", { defaultScope: "all" })
    const resp = await server.handle({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "tribe_members", arguments: {} },
    })
    expect(resp && "result" in resp).toBe(true)
    if (resp && "result" in resp) {
      const result = resp.result as { content: { type: string; text: string }[]; isError: boolean }
      expect(result.isError).toBe(false)
      expect(result.content[0]?.type).toBe("text")
      const parsed = JSON.parse(result.content[0]!.text) as TribeMember[]
      expect(parsed.some((m) => m.name === "alice")).toBe(true)
    }
  })

  test("unknown method returns -32601", async () => {
    const tribe = createInMemoryTribe()
    const server = createTribeMcpServer(tribe, "alice")
    const resp = await server.handle({ jsonrpc: "2.0", id: 4, method: "no/such/method" })
    expect(resp).toMatchObject({ id: 4, error: { code: -32601 } })
  })

  test("unknown tool name produces isError result", async () => {
    const tribe = createInMemoryTribe()
    const server = createTribeMcpServer(tribe, "alice")
    const resp = await server.handle({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "tribe_nonexistent", arguments: {} },
    })
    if (resp && "result" in resp) {
      const result = resp.result as { isError: boolean }
      expect(result.isError).toBe(true)
    } else {
      throw new Error("expected result, got error")
    }
  })
})

describe("scope filtering", () => {
  test("self scope: only sender visible to itself", () => {
    const sender: TribeMember = { name: "alice", status: "online" }
    const all: TribeMember[] = [sender, { name: "bob", status: "online" }]
    expect(filterRecipientsByScope("self", sender, all).map((m) => m.name)).toEqual(["alice"])
  })

  test("tree scope: parent + children + siblings", () => {
    const sender: TribeMember = { name: "alice", status: "online", parent: "root" }
    const all: TribeMember[] = [
      sender,
      { name: "root", status: "online" },
      { name: "child", status: "online", parent: "alice" },
      { name: "sibling", status: "online", parent: "root" },
      { name: "stranger", status: "online", parent: "other" },
    ]
    const names = filterRecipientsByScope("tree", sender, all)
      .map((m) => m.name)
      .sort()
    expect(names).toEqual(["alice", "child", "root", "sibling"].sort())
    expect(names).not.toContain("stranger")
  })

  test("agent scope: only same agentId", () => {
    const sender: TribeMember = { name: "alice", status: "online", agentId: "claude" }
    const all: TribeMember[] = [
      sender,
      { name: "bob", status: "online", agentId: "claude" },
      { name: "carol", status: "online", agentId: "codex" },
    ]
    const names = filterRecipientsByScope("agent", sender, all)
      .map((m) => m.name)
      .sort()
    expect(names).toEqual(["alice", "bob"].sort())
  })

  test("all scope: everyone", () => {
    const sender: TribeMember = { name: "alice", status: "online" }
    const all: TribeMember[] = [
      sender,
      { name: "bob", status: "online" },
      { name: "carol", status: "online", agentId: "codex", parent: "elsewhere" },
    ]
    expect(filterRecipientsByScope("all", sender, all)).toHaveLength(3)
  })

  test("send rejects out-of-scope peer", async () => {
    const tribe = createInMemoryTribe()
    await tribe.join({ name: "alice", parent: "root" })
    await tribe.join({ name: "stranger", parent: "other-root" })
    await expect(tribe.send({ from: "alice", to: "stranger", text: "hi", scope: "tree" })).rejects.toThrow(
      /out of scope/,
    )
  })

  test("send rejects unknown peer", async () => {
    const tribe = createInMemoryTribe()
    await tribe.join({ name: "alice" })
    await expect(tribe.send({ from: "alice", to: "ghost", text: "hi", scope: "all" })).rejects.toThrow(/unknown peer/)
  })

  test("send through callTool inherits TRIBE_SCOPE default", async () => {
    const tribe = createInMemoryTribe()
    await tribe.join({ name: "alice", parent: "root" })
    await tribe.join({ name: "stranger", parent: "other-root" })
    // defaultScope=tree blocks the send
    await expect(
      callTool(tribe, "alice", "tribe_send", { to: "stranger", message: "hi" }, { defaultScope: "tree" }),
    ).rejects.toThrow(/out of scope/)
    // explicit all overrides
    await callTool(tribe, "alice", "tribe_send", { to: "stranger", message: "hi", scope: "all" })
    const h = await tribe.history({ forSession: "stranger", scope: "all" })
    expect(h.at(-1)?.text).toBe("hi")
  })
})

describe("history filter + pagination", () => {
  test("limit caps results", async () => {
    const tribe = createInMemoryTribe()
    await tribe.join({ name: "alice" })
    await tribe.join({ name: "bob" })
    for (let i = 0; i < 10; i++) {
      await tribe.send({ from: "alice", to: "bob", text: `msg ${i}`, scope: "all" })
    }
    const h = await tribe.history({ forSession: "bob", scope: "all", limit: 3 })
    expect(h).toHaveLength(3)
    expect(h.map((m) => m.text)).toEqual(["msg 7", "msg 8", "msg 9"])
  })

  test("filter.contains", () => {
    const messages = [
      { from: "a", to: "b", text: "hello world", ts: 1 },
      { from: "a", to: "b", text: "goodbye world", ts: 2 },
      { from: "a", to: "b", text: "hello again", ts: 3 },
    ]
    const out = applyHistoryFilter(messages, { contains: "hello" })
    expect(out.map((m) => m.text)).toEqual(["hello world", "hello again"])
  })

  test("filter.from / filter.to", () => {
    const messages = [
      { from: "a", to: "b", text: "1", ts: 1 },
      { from: "b", to: "a", text: "2", ts: 2 },
      { from: "a", to: "*", text: "3", ts: 3 },
    ]
    expect(applyHistoryFilter(messages, { from: "a" }).map((m) => m.text)).toEqual(["1", "3"])
    expect(applyHistoryFilter(messages, { to: "a" }).map((m) => m.text)).toEqual(["2"])
  })

  test("filter.since clamps by timestamp", () => {
    const messages = [
      { from: "a", to: "b", text: "old", ts: 100 },
      { from: "a", to: "b", text: "new", ts: 200 },
    ]
    expect(applyHistoryFilter(messages, { since: 150 }).map((m) => m.text)).toEqual(["new"])
  })
})

describe("chief leadership", () => {
  test("first claim succeeds, second is rejected", async () => {
    const tribe = createInMemoryTribe()
    expect(await tribe.claimChief({ name: "alice" })).toEqual({ ok: true, chief: "alice" })
    expect(await tribe.claimChief({ name: "bob" })).toEqual({ ok: false, chief: "alice" })
    expect(await tribe.chief()).toBe("alice")
  })

  test("release allows reclaim", async () => {
    const tribe = createInMemoryTribe()
    await tribe.claimChief({ name: "alice" })
    expect(await tribe.releaseChief({ name: "bob" })).toEqual({ ok: false, chief: "alice" })
    expect(await tribe.releaseChief({ name: "alice" })).toEqual({ ok: true, chief: null })
    expect(await tribe.claimChief({ name: "bob" })).toEqual({ ok: true, chief: "bob" })
  })

  test("members reports isChief flag", async () => {
    const tribe = createInMemoryTribe()
    await tribe.join({ name: "alice" })
    await tribe.join({ name: "bob" })
    await tribe.claimChief({ name: "bob" })
    const list = await tribe.members({ forSession: "alice", scope: "all" })
    expect(list.find((m) => m.name === "bob")?.isChief).toBe(true)
    expect(list.find((m) => m.name === "alice")?.isChief).toBe(false)
  })
})

describe("JSONL backend persistence", () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "tribe-mcp-test-"))
    process.env.TRIBE_BUS_PATH = join(dir, "bus.jsonl")
    process.env.TRIBE_STATE_PATH = join(dir, "state.json")
  })

  afterEach(() => {
    delete process.env.TRIBE_BUS_PATH
    delete process.env.TRIBE_STATE_PATH
    rmSync(dir, { recursive: true, force: true })
  })

  test("messages persist across backend instances", async () => {
    const b1 = createJsonlBackend()
    await b1.join({ name: "alice" })
    await b1.join({ name: "bob" })
    await b1.send({ from: "alice", to: "bob", text: "persistent", scope: "all" })

    const b2 = createJsonlBackend()
    const h = await b2.history({ forSession: "bob", scope: "all" })
    expect(h.at(-1)?.text).toBe("persistent")
  })

  test("chief state persists across restarts", async () => {
    const b1 = createJsonlBackend()
    await b1.claimChief({ name: "alice" })

    const b2 = createJsonlBackend()
    expect(await b2.chief()).toBe("alice")
    expect(await b2.claimChief({ name: "bob" })).toEqual({ ok: false, chief: "alice" })
  })

  test("members visible after restart via message backfill", async () => {
    const b1 = createJsonlBackend()
    await b1.join({ name: "alice" })
    await b1.join({ name: "bob" })
    await b1.send({ from: "alice", to: "bob", text: "ping", scope: "all" })

    const b2 = createJsonlBackend()
    const peers = await b2.members({ forSession: "alice", scope: "all" })
    const names = peers.map((p) => p.name).sort()
    expect(names).toContain("alice")
    expect(names).toContain("bob")
  })

  test("scope filtering applies in JSONL backend", async () => {
    const b = createJsonlBackend()
    await b.join({ name: "alice", parent: "root-a" })
    await b.join({ name: "stranger", parent: "root-b" })
    await expect(b.send({ from: "alice", to: "stranger", text: "x", scope: "tree" })).rejects.toThrow(/out of scope/)
  })
})
