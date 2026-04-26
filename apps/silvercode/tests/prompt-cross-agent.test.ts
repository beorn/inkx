/**
 * Tests for `apps/silvercode/src/prompt-cross-agent.ts`.
 *
 * Covers:
 *  - Empty slice returns [] (no peer activity → no projection block)
 *  - Slice format (URI, _meta, body markdown, AMBIENT framing)
 *  - peersOnly filters self activity out by default
 *  - Composed assembly puts cross-agent slice FIRST, ambient mid, user text LAST
 *  - Opt-in: includeCrossAgent: false leaves the slice off entirely
 */

import { describe, expect, test } from "vitest"
import { createScope } from "@silvery/scope"
import { type ChannelEvent, createChannelQueue } from "../src/channel-queue.ts"
import { AMBIENT_FRAMING_PREFIX } from "../src/prompt-assembly.ts"
import { createCrossAgentState } from "../src/cross-agent-state.ts"
import {
  COORDINATOR_URI_SCHEME,
  assembleAcpPromptWithCrossAgent,
  coordinatorUri,
  crossAgentSlice,
} from "../src/prompt-cross-agent.ts"

function ev(source: string, content: string, extra: Partial<ChannelEvent> = {}): ChannelEvent {
  return {
    id: extra.id ?? `${source}-x`,
    source,
    timestamp: extra.timestamp ?? 0,
    content,
    ...extra,
  }
}

describe("prompt-cross-agent — slice", () => {
  test("empty slice when no peer activity (peersOnly default)", () => {
    const scope = createScope("test")
    const state = createCrossAgentState(scope)
    // self-only activity should not project.
    state.claimFile({ sessionId: "self", path: "/me.ts" })
    state.recordBroadcast({ id: "1", source: "tribe", content: "self thing", timestamp: 0, fromSessionId: "self" })

    const slice = crossAgentSlice(state, "self")
    expect(slice).toEqual([])
  })

  test("non-empty slice has resource URI + _meta + AMBIENT framing", () => {
    const scope = createScope("test")
    const state = createCrossAgentState(scope)
    state.claimFile({ sessionId: "peer", path: "/foo.ts", exclusive: true })

    const slice = crossAgentSlice(state, "self")
    expect(slice).toHaveLength(1)
    const block = slice[0] as {
      type: "resource"
      resource: { uri: string; mimeType: string; text: string }
      _meta?: Record<string, unknown>
    }

    expect(block.type).toBe("resource")
    expect(block.resource.uri).toBe(coordinatorUri("self"))
    expect(block.resource.uri.startsWith(COORDINATOR_URI_SCHEME)).toBe(true)
    expect(block.resource.mimeType).toBe("text/markdown")
    expect(block.resource.text.startsWith(AMBIENT_FRAMING_PREFIX)).toBe(true)
    // Body mentions the peer claim
    expect(block.resource.text).toContain("/foo.ts")
    expect(block.resource.text).toContain("peer")

    // _meta hints
    expect(block._meta?.coordinator).toBe(true)
    expect(block._meta?.ambient).toBe(true)
    expect(block._meta?.sessionId).toBe("self")
    expect(block._meta?.peerClaimCount).toBe(1)
  })

  test("inbound + outbound handoffs both render", () => {
    const scope = createScope("test")
    const state = createCrossAgentState(scope)
    state.proposeHandoff({ fromSessionId: "peer", toSessionId: "self", content: "inbound msg" })
    state.proposeHandoff({ fromSessionId: "self", toSessionId: "other", content: "outbound msg" })

    const slice = crossAgentSlice(state, "self")
    expect(slice).toHaveLength(1)
    const block = slice[0] as { resource: { text: string }; _meta?: Record<string, unknown> }
    expect(block.resource.text).toContain("inbound msg")
    expect(block.resource.text).toContain("outbound msg")
    expect(block._meta?.pendingInbound).toBe(1)
    expect(block._meta?.pendingOutbound).toBe(1)
  })

  test("recentBroadcasts respected; peer broadcasts only by default", () => {
    const scope = createScope("test")
    const state = createCrossAgentState(scope)
    state.recordBroadcast({ id: "1", source: "tribe", content: "from-self", timestamp: 0, fromSessionId: "self" })
    state.recordBroadcast({ id: "2", source: "tribe", content: "from-peer", timestamp: 1, fromSessionId: "peer" })

    const slice = crossAgentSlice(state, "self")
    expect(slice).toHaveLength(1)
    const block = slice[0] as { resource: { text: string } }
    expect(block.resource.text).toContain("from-peer")
    expect(block.resource.text).not.toContain("from-self")
  })

  test("peersOnly: false includes self activity too", () => {
    const scope = createScope("test")
    const state = createCrossAgentState(scope)
    state.claimFile({ sessionId: "self", path: "/me.ts" })

    const slice = crossAgentSlice(state, "self", { peersOnly: false })
    expect(slice).toHaveLength(1)
    const block = slice[0] as { resource: { text: string } }
    expect(block.resource.text).toContain("/me.ts")
  })
})

describe("prompt-cross-agent — composed assembly", () => {
  test("includeCrossAgent: false keeps the slice off (downstream behaviour unchanged)", () => {
    const scope = createScope("test")
    const queue = createChannelQueue(scope)
    const state = createCrossAgentState(scope)
    state.claimFile({ sessionId: "peer", path: "/foo.ts" })

    const blocks = assembleAcpPromptWithCrossAgent("hi", queue, { autoInject: false })
    expect(blocks).toEqual([{ type: "text", text: "hi" }])
  })

  test("includeCrossAgent: true with no slice content still returns just user text", () => {
    const scope = createScope("test")
    const queue = createChannelQueue(scope)
    const state = createCrossAgentState(scope)

    const blocks = assembleAcpPromptWithCrossAgent("hi", queue, {
      autoInject: false,
      includeCrossAgent: true,
      crossAgent: { state, selfSessionId: "self" },
    })
    expect(blocks).toEqual([{ type: "text", text: "hi" }])
  })

  test("ordering: cross-agent slice FIRST, ambient mid, user text LAST", () => {
    const scope = createScope("test")
    const queue = createChannelQueue(scope)
    const state = createCrossAgentState(scope)
    state.claimFile({ sessionId: "peer", path: "/foo.ts" })
    queue.enqueue(ev("tribe", "peer ping", { id: "p1" }))

    const blocks = assembleAcpPromptWithCrossAgent("user prompt", queue, {
      autoInject: true,
      includeCrossAgent: true,
      crossAgent: { state, selfSessionId: "self" },
    })

    expect(blocks).toHaveLength(3)
    // First — cross-agent slice
    expect(blocks[0]?.type).toBe("resource")
    const first = blocks[0] as { resource: { uri: string } }
    expect(first.resource.uri.startsWith(COORDINATOR_URI_SCHEME)).toBe(true)
    // Middle — ambient channel-queue resource
    expect(blocks[1]?.type).toBe("resource")
    const middle = blocks[1] as { resource: { uri: string } }
    expect(middle.resource.uri.startsWith("ambient://")).toBe(true)
    // Last — user text
    expect(blocks[2]).toEqual({ type: "text", text: "user prompt" })
  })

  test("user text always last even when only cross-agent slice present", () => {
    const scope = createScope("test")
    const queue = createChannelQueue(scope)
    const state = createCrossAgentState(scope)
    state.claimFile({ sessionId: "peer", path: "/foo.ts" })

    const blocks = assembleAcpPromptWithCrossAgent("ask", queue, {
      autoInject: false,
      includeCrossAgent: true,
      crossAgent: { state, selfSessionId: "self" },
    })

    expect(blocks).toHaveLength(2)
    expect(blocks[blocks.length - 1]).toEqual({ type: "text", text: "ask" })
  })
})
