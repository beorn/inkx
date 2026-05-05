import { describe, expect, test } from "vitest"
import { createScope } from "@silvery/scope"
import { type ChannelEvent, createChannelQueue } from "../src/channel-queue.ts"

function ev(source: string, content: string, extra: Partial<ChannelEvent> = {}): ChannelEvent {
  return {
    id: extra.id ?? `${source}-${Math.random().toString(36).slice(2, 8)}`,
    source,
    timestamp: extra.timestamp ?? Date.now(),
    content,
    ...extra,
  }
}

describe("channel-queue", () => {
  test("enqueue → peek → drain preserves order", () => {
    const scope = createScope("test")
    const q = createChannelQueue(scope)
    q.enqueue(ev("tribe", "first"))
    q.enqueue(ev("ci", "second"))
    q.enqueue(ev("tribe", "third"))

    expect(q.peek().map((e) => e.content)).toEqual(["first", "second", "third"])

    const drained = q.drain()
    expect(drained.map((e) => e.content)).toEqual(["first", "second", "third"])

    // Drained — peek now empty.
    expect(q.peek()).toEqual([])
    expect(q.drain()).toEqual([])
  })

  test("pendingCount signal tracks queue size", () => {
    const scope = createScope("test")
    const q = createChannelQueue(scope)
    expect(q.pendingCount()).toBe(0)
    q.enqueue(ev("tribe", "a"))
    expect(q.pendingCount()).toBe(1)
    q.enqueue(ev("tribe", "b"))
    expect(q.pendingCount()).toBe(2)
    q.drain()
    expect(q.pendingCount()).toBe(0)
  })

  test("subscribe fires on enqueue and unsubscribes cleanly", () => {
    const scope = createScope("test")
    const q = createChannelQueue(scope)
    const seen: string[] = []
    const unsub = q.subscribe((e) => seen.push(e.content))
    q.enqueue(ev("tribe", "alpha"))
    q.enqueue(ev("tribe", "beta"))
    expect(seen).toEqual(["alpha", "beta"])
    unsub()
    q.enqueue(ev("tribe", "gamma"))
    expect(seen).toEqual(["alpha", "beta"]) // gamma not delivered after unsub
  })

  test("drainWhere takes only matching events; rest stays in order", () => {
    const scope = createScope("test")
    const q = createChannelQueue(scope)
    q.enqueue(ev("tribe", "t1"))
    q.enqueue(ev("ci", "c1"))
    q.enqueue(ev("tribe", "t2"))
    q.enqueue(ev("lore", "l1"))

    const tribes = q.drainWhere((e) => e.source === "tribe")
    expect(tribes.map((e) => e.content)).toEqual(["t1", "t2"])
    expect(q.peek().map((e) => e.content)).toEqual(["c1", "l1"])
    expect(q.pendingCount()).toBe(2)
  })

  test("clear drops everything without invoking subscribers", () => {
    const scope = createScope("test")
    const q = createChannelQueue(scope)
    let calls = 0
    q.subscribe(() => calls++)
    q.enqueue(ev("tribe", "x"))
    expect(calls).toBe(1)
    q.clear()
    expect(q.peek()).toEqual([])
    expect(q.pendingCount()).toBe(0)
    expect(calls).toBe(1) // unchanged — clear doesn't fire subscribers
  })

  test("scope disposal makes subsequent enqueues no-ops", async () => {
    const scope = createScope("test")
    const q = createChannelQueue(scope)
    let calls = 0
    q.subscribe(() => calls++)
    await scope[Symbol.asyncDispose]()
    q.enqueue(ev("tribe", "after-dispose"))
    expect(calls).toBe(0)
    expect(q.peek()).toEqual([])
  })

  test("misbehaving subscriber does not block the queue", () => {
    const scope = createScope("test")
    const q = createChannelQueue(scope)
    const seen: string[] = []
    q.subscribe(() => {
      throw new Error("boom")
    })
    q.subscribe((e) => seen.push(e.content))
    q.enqueue(ev("tribe", "a"))
    q.enqueue(ev("tribe", "b"))
    expect(seen).toEqual(["a", "b"])
    expect(q.pendingCount()).toBe(2)
  })

  test("enqueue normalizes incoming notification metadata to href/details", () => {
    const scope = createScope("test")
    const q = createChannelQueue(scope)
    q.enqueue(
      ev("ci", "failure", {
        meta: {
          kind: "ci-state",
          html_url: "https://github.com/acme/repo/actions/runs/123",
          body: "failed test output",
          link: "https://fallback.example.com/ignored",
        },
      }),
    )

    expect(q.peek()[0]?.meta).toEqual({
      kind: "ci-state",
      href: "https://github.com/acme/repo/actions/runs/123",
      details: "failed test output",
    })
  })
})
