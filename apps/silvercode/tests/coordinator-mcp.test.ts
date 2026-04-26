/**
 * Tests for `apps/silvercode/src/coordinator-mcp.ts`.
 *
 * Covers:
 *  - JSON-RPC initialize / tools/list / tools/call
 *  - Tool dispatch for every tool
 *  - dangerous-flag classification (mutating vs read-only)
 *  - Per-session identity isolation: two sessions sharing the same state
 *    see their own claims tagged with their own sessionId
 */

import { describe, expect, test } from "vitest"
import { createScope } from "@silvery/scope"
import { createCrossAgentState } from "../src/cross-agent-state.ts"
import {
  COORDINATOR_DANGEROUS_TOOLS,
  COORDINATOR_TOOL_DEFINITIONS,
  callCoordinatorTool,
  createCoordinatorMcpServer,
  createCoordinatorMcpServerSpec,
  type CoordinatorStatus,
} from "../src/coordinator-mcp.ts"

describe("coordinator-mcp — tool definitions", () => {
  test("dangerous flag matches mutating tools exactly", () => {
    const dangerous = new Set(COORDINATOR_TOOL_DEFINITIONS.filter((t) => t.dangerous).map((t) => t.name))
    expect(dangerous).toEqual(new Set(["coordinator_claim_file", "coordinator_release_file", "coordinator_handoff"]))
    expect(COORDINATOR_DANGEROUS_TOOLS).toEqual(dangerous)
  })

  test("read-only tools are NOT dangerous", () => {
    const readonly = COORDINATOR_TOOL_DEFINITIONS.filter((t) => !t.dangerous).map((t) => t.name)
    expect(readonly).toEqual(["coordinator_status", "coordinator_active_sessions", "coordinator_recent_broadcasts"])
  })

  test("every tool has a non-empty inputSchema and description", () => {
    for (const t of COORDINATOR_TOOL_DEFINITIONS) {
      expect(t.description.length).toBeGreaterThan(0)
      expect(t.inputSchema.type).toBe("object")
    }
  })
})

describe("coordinator-mcp — direct dispatch", () => {
  test("coordinator_claim_file attributes the claim to selfSessionId", async () => {
    const scope = createScope("test")
    const state = createCrossAgentState(scope)
    const out = await callCoordinatorTool(state, "s1", "coordinator_claim_file", { path: "/foo.ts" })
    expect(out).toMatchObject({ ok: true })
    expect(state.claims()[0]?.sessionId).toBe("s1")
    expect(state.claims()[0]?.exclusive).toBe(true) // default
  })

  test("coordinator_claim_file with exclusive: false makes an advisory claim", async () => {
    const scope = createScope("test")
    const state = createCrossAgentState(scope)
    await callCoordinatorTool(state, "s1", "coordinator_claim_file", { path: "/foo.ts", exclusive: false })
    expect(state.claims()[0]?.exclusive).toBe(false)
  })

  test("coordinator_claim_file conflict returns conflictWith", async () => {
    const scope = createScope("test")
    const state = createCrossAgentState(scope)
    await callCoordinatorTool(state, "s1", "coordinator_claim_file", { path: "/foo.ts" })
    const out = await callCoordinatorTool(state, "s2", "coordinator_claim_file", { path: "/foo.ts" })
    expect(out).toMatchObject({ ok: false, conflictWith: "s1" })
  })

  test("coordinator_release_file removes own claim", async () => {
    const scope = createScope("test")
    const state = createCrossAgentState(scope)
    await callCoordinatorTool(state, "s1", "coordinator_claim_file", { path: "/foo.ts" })
    await callCoordinatorTool(state, "s1", "coordinator_release_file", { path: "/foo.ts" })
    expect(state.claims()).toHaveLength(0)
  })

  test("coordinator_handoff creates a pending handoff", async () => {
    const scope = createScope("test")
    const state = createCrossAgentState(scope)
    const out = (await callCoordinatorTool(state, "s1", "coordinator_handoff", {
      to: "s2",
      content: "take this",
    })) as { ok: boolean; handoffId: string }
    expect(out.ok).toBe(true)
    expect(out.handoffId).toMatch(/^h-/)
    expect(state.handoffs()).toHaveLength(1)
    expect(state.handoffs()[0]?.fromSessionId).toBe("s1")
  })

  test("coordinator_status partitions claims/handoffs by self vs peers", async () => {
    const scope = createScope("test")
    const state = createCrossAgentState(scope)
    await callCoordinatorTool(state, "s1", "coordinator_claim_file", { path: "/a.ts" })
    await callCoordinatorTool(state, "s2", "coordinator_claim_file", { path: "/a.ts", exclusive: false })
    await callCoordinatorTool(state, "s2", "coordinator_handoff", { to: "s1", content: "hi" })
    await callCoordinatorTool(state, "s1", "coordinator_handoff", { to: "s3", content: "out" })

    const status = (await callCoordinatorTool(state, "s1", "coordinator_status", {})) as CoordinatorStatus
    expect(status.sessionId).toBe("s1")
    expect(status.ownClaims.map((c) => c.path)).toEqual(["/a.ts"])
    expect(status.peerClaimsOnSharedPaths).toHaveLength(1)
    expect(status.peerClaimsOnSharedPaths[0]?.sessionId).toBe("s2")
    expect(status.pendingHandoffsIn).toHaveLength(1)
    expect(status.pendingHandoffsOut).toHaveLength(1)
  })

  test("coordinator_active_sessions returns the live list", async () => {
    const scope = createScope("test")
    const state = createCrossAgentState(scope)
    state.addSession({ sessionId: "s1", name: "alpha", status: "idle", startedAt: 0 })
    state.addSession({ sessionId: "s2", name: "beta", status: "thinking", startedAt: 0 })
    const out = (await callCoordinatorTool(state, "s1", "coordinator_active_sessions", {})) as Array<{
      sessionId: string
    }>
    expect(out.map((s) => s.sessionId).sort()).toEqual(["s1", "s2"])
  })

  test("coordinator_recent_broadcasts respects limit", async () => {
    const scope = createScope("test")
    const state = createCrossAgentState(scope, { broadcastCap: 100 })
    for (let i = 0; i < 20; i++) {
      state.recordBroadcast({ id: `${i}`, source: "tribe", content: `m${i}`, timestamp: i })
    }
    const out = (await callCoordinatorTool(state, "s1", "coordinator_recent_broadcasts", { limit: 5 })) as Array<{
      content: string
    }>
    expect(out).toHaveLength(5)
    // Newest last → m15..m19.
    expect(out.map((b) => b.content)).toEqual(["m15", "m16", "m17", "m18", "m19"])
  })

  test("unknown tool throws", async () => {
    const scope = createScope("test")
    const state = createCrossAgentState(scope)
    await expect(callCoordinatorTool(state, "s1", "coordinator_nope", {})).rejects.toThrow(/unknown coordinator tool/)
  })
})

describe("coordinator-mcp — JSON-RPC server", () => {
  test("initialize returns protocolVersion + serverInfo", async () => {
    const scope = createScope("test")
    const state = createCrossAgentState(scope)
    const server = createCoordinatorMcpServer(state, "s1")

    const res = await server.handle({ jsonrpc: "2.0", id: 1, method: "initialize" })
    expect(res).not.toBeNull()
    expect((res as { result: { serverInfo: { name: string } } }).result.serverInfo.name).toBe("coordinator-mcp")
  })

  test("initialized notification returns null", async () => {
    const scope = createScope("test")
    const state = createCrossAgentState(scope)
    const server = createCoordinatorMcpServer(state, "s1")
    const res = await server.handle({ jsonrpc: "2.0", method: "initialized" })
    expect(res).toBeNull()
  })

  test("tools/list returns the canonical definitions", async () => {
    const scope = createScope("test")
    const state = createCrossAgentState(scope)
    const server = createCoordinatorMcpServer(state, "s1")
    const res = await server.handle({ jsonrpc: "2.0", id: 2, method: "tools/list" })
    expect((res as { result: { tools: Array<unknown> } }).result.tools).toEqual(COORDINATOR_TOOL_DEFINITIONS)
  })

  test("tools/call dispatches and wraps the result as text content", async () => {
    const scope = createScope("test")
    const state = createCrossAgentState(scope)
    const server = createCoordinatorMcpServer(state, "s1")

    const res = await server.handle({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "coordinator_claim_file", arguments: { path: "/foo.ts" } },
    })
    const result = (res as { result: { content: Array<{ type: string; text: string }>; isError: boolean } }).result
    expect(result.isError).toBe(false)
    expect(result.content[0]?.type).toBe("text")
    const parsed = JSON.parse(result.content[0]!.text) as { ok: boolean }
    expect(parsed.ok).toBe(true)
  })

  test("tools/call surfaces errors with isError: true", async () => {
    const scope = createScope("test")
    const state = createCrossAgentState(scope)
    const server = createCoordinatorMcpServer(state, "s1")
    const res = await server.handle({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "coordinator_claim_file",
        arguments: {
          /* missing path */
        },
      },
    })
    const result = (res as { result: { content: Array<{ text: string }>; isError: boolean } }).result
    expect(result.isError).toBe(true)
    expect(result.content[0]?.text).toMatch(/'path' is required/)
  })

  test("unknown method returns JSON-RPC -32601", async () => {
    const scope = createScope("test")
    const state = createCrossAgentState(scope)
    const server = createCoordinatorMcpServer(state, "s1")
    const res = await server.handle({ jsonrpc: "2.0", id: 5, method: "nope/method" })
    expect((res as { error: { code: number } }).error.code).toBe(-32601)
  })
})

describe("coordinator-mcp — per-session identity isolation", () => {
  test("two servers sharing one state attribute claims to their own session", async () => {
    const scope = createScope("test")
    const state = createCrossAgentState(scope)
    const a = createCoordinatorMcpServer(state, "s1")
    const b = createCoordinatorMcpServer(state, "s2")

    await a.handle({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "coordinator_claim_file", arguments: { path: "/a.ts" } },
    })
    await b.handle({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "coordinator_claim_file", arguments: { path: "/b.ts" } },
    })

    const claims = state.claims()
    expect(claims.find((c) => c.path === "/a.ts")?.sessionId).toBe("s1")
    expect(claims.find((c) => c.path === "/b.ts")?.sessionId).toBe("s2")
  })

  test("createCoordinatorMcpServerSpec carries identity + in-process type", () => {
    const scope = createScope("test")
    const state = createCrossAgentState(scope)
    const spec = createCoordinatorMcpServerSpec(state, "s1")
    expect(spec.name).toBe("coordinator")
    expect(spec.type).toBe("in-process")
    expect(spec.server.selfSessionId).toBe("s1")
  })
})
