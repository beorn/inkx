import { describe, expect, test } from "vitest"
import { createScope } from "@silvery/scope"
import { type ChannelEvent, createChannelQueue } from "../src/channel-queue.ts"
import {
  NOTIFICATION_FRAMING_PREFIX,
  NOTIFICATION_URI_SCHEME,
  notificationUri,
  assembleAcpPrompt,
  eventToContentBlock,
  renderQueueAsLegacyText,
} from "../src/prompt-assembly.ts"

function ev(source: string, content: string, extra: Partial<ChannelEvent> = {}): ChannelEvent {
  return {
    id: extra.id ?? `${source}-id`,
    source,
    timestamp: extra.timestamp ?? 1700000000000,
    content,
    ...extra,
  }
}

describe("prompt-assembly", () => {
  test("autoInject: false returns just the user text block; queue untouched", () => {
    const scope = createScope("test")
    const q = createChannelQueue(scope)
    q.enqueue(ev("tribe", "hello from peer"))

    const blocks = assembleAcpPrompt("user prompt", q, { autoInject: false })

    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toEqual({ type: "text", text: "user prompt" })
    expect(q.peek()).toHaveLength(1) // queue NOT drained
  })

  test("autoInject: true drains queue, prepends EmbeddedResource blocks, appends user text", () => {
    const scope = createScope("test")
    const q = createChannelQueue(scope)
    q.enqueue(ev("tribe", "peer says hi", { id: "e1" }))
    q.enqueue(ev("ci", "build green", { id: "e2" }))

    const blocks = assembleAcpPrompt("please continue", q, { autoInject: true })

    expect(blocks).toHaveLength(3)
    // First two: EmbeddedResource
    expect(blocks[0]?.type).toBe("resource")
    expect(blocks[1]?.type).toBe("resource")
    // Last: text
    expect(blocks[2]).toEqual({ type: "text", text: "please continue" })
    // Queue drained
    expect(q.peek()).toHaveLength(0)
  })

  test("autoInject: true with sources filter drains only matching events", () => {
    const scope = createScope("test")
    const q = createChannelQueue(scope)
    q.enqueue(ev("tribe", "tribe-a", { id: "t1" }))
    q.enqueue(ev("ci", "ci-a", { id: "c1" }))
    q.enqueue(ev("tribe", "tribe-b", { id: "t2" }))

    const blocks = assembleAcpPrompt("go", q, { autoInject: true, sources: new Set(["tribe"]) })

    expect(blocks).toHaveLength(3) // 2 tribe + 1 text
    expect(blocks[2]).toEqual({ type: "text", text: "go" })
    // CI event still queued
    expect(q.peek()).toHaveLength(1)
    expect(q.peek()[0]?.source).toBe("ci")
  })

  test("autoInject: true with empty queue returns just user text", () => {
    const scope = createScope("test")
    const q = createChannelQueue(scope)
    const blocks = assembleAcpPrompt("solo prompt", q, { autoInject: true })
    expect(blocks).toEqual([{ type: "text", text: "solo prompt" }])
  })

  test("eventToContentBlock — _meta.notification=true, NOTIFICATION framing, notification:// URI", () => {
    const event = ev("tribe", "hello", { id: "abc123", actionable: false })
    const block = eventToContentBlock(event)

    expect(block.type).toBe("resource")
    if (block.type !== "resource") throw new Error("expected resource block")

    // _meta is the machine-readable hint
    const meta = (block as { _meta?: Record<string, unknown> })._meta
    expect(meta).toBeDefined()
    expect(meta?.notification).toBe(true)
    expect(meta?.source).toBe("tribe")
    expect(meta?.actionable).toBe(false)

    // Embedded resource — typed text resource
    expect("text" in block.resource).toBe(true)
    if (!("text" in block.resource)) throw new Error("expected TextResourceContents")

    // URI scheme
    expect(block.resource.uri.startsWith(NOTIFICATION_URI_SCHEME)).toBe(true)
    expect(block.resource.uri).toBe("notification://tribe/abc123")
    expect(block.resource.mimeType).toBe("text/markdown")

    // Body framing — strong "[NOTIFICATION — informational, do not act]" prefix
    expect(block.resource.text.startsWith(NOTIFICATION_FRAMING_PREFIX)).toBe(true)
    expect(block.resource.text).toContain("hello")
  })

  test("eventToContentBlock — actionable flag flows through", () => {
    const block = eventToContentBlock(ev("ci", "tests failed", { actionable: true }))
    if (block.type !== "resource") throw new Error("expected resource")
    const meta = (block as { _meta?: Record<string, unknown> })._meta
    expect(meta?.actionable).toBe(true)
  })

  test("notificationUri builds canonical scheme + path", () => {
    expect(notificationUri("tribe", "abc")).toBe("notification://tribe/abc")
    expect(notificationUri("ci", "build-1")).toBe("notification://ci/build-1")
  })

  test("renderQueueAsLegacyText — empty input returns empty string", () => {
    expect(renderQueueAsLegacyText([])).toBe("")
  })

  test("renderQueueAsLegacyText — frames each event with NOTIFICATION prefix and source tag", () => {
    const text = renderQueueAsLegacyText([ev("tribe", "alpha"), ev("ci", "build green")])
    expect(text).toContain(NOTIFICATION_FRAMING_PREFIX)
    expect(text).toContain("(tribe)")
    expect(text).toContain("(ci)")
    expect(text).toContain("alpha")
    expect(text).toContain("build green")
  })

  test("user text is ALWAYS the last block (contract for downstream consumers)", () => {
    const scope = createScope("test")
    const q = createChannelQueue(scope)
    q.enqueue(ev("tribe", "a"))
    q.enqueue(ev("tribe", "b"))
    q.enqueue(ev("tribe", "c"))

    const blocks = assembleAcpPrompt("the user text", q, { autoInject: true })
    expect(blocks[blocks.length - 1]).toEqual({ type: "text", text: "the user text" })
  })
})
