/**
 * Tests for `createAmbientStream` — the per-session ambient observation
 * journal. Focuses on:
 *
 *   1. Referential semantics: every `entries(sessionId)` call returns a
 *      NEW array reference, even when the underlying buffer is unchanged.
 *      This is the contract that lets React's `useState`-based hooks
 *      detect new events via `Object.is` comparison and re-render. Without
 *      it, ambient rows arrive in the buffer but don't surface in the
 *      chat scrollback until some OTHER state change forces a parent
 *      re-render — the bug fixed in km-silvercode.claude-acp-wire-bugs.
 *   2. Subscribe-on-record: the synchronous notification path that drives
 *      the React hook's `setEntries(snapshot(...))` call.
 *
 * The full sanitize/breaker/telemetry pipeline is covered by sibling
 * test files (ambient-sanitize, ambient-circuit-breaker, ambient-telemetry).
 */

import { describe, expect, test } from "vitest"
import { createScope } from "@silvery/scope"
import { createAmbientStream } from "../src/ambient-stream.ts"
import type { ChannelEvent } from "../src/channel-queue.ts"

function event(id: string, content = "x"): ChannelEvent {
  return {
    id,
    source: "filewatch",
    content,
    timestamp: Date.now(),
  }
}

describe("createAmbientStream — referential semantics for React re-renders", () => {
  test("entries() returns a fresh array reference on every call", async () => {
    await using scope = createScope("test")
    const stream = createAmbientStream(scope)
    stream.record("s1", event("e1"))

    const a = stream.entries("s1")
    const b = stream.entries("s1")

    expect(a).not.toBe(b) // different references
    expect(a).toEqual(b) // same contents
  })

  test("entries() returns a fresh reference even when the buffer is unchanged between calls", async () => {
    // Regression: previously `entries()` returned the live mutable buffer.
    // Two consecutive calls with no record() between them returned the SAME
    // reference, defeating React's Object.is shortcut and skipping the
    // re-render that would have surfaced earlier-recorded events.
    await using scope = createScope("test")
    const stream = createAmbientStream(scope)
    stream.record("s1", event("e1"))

    const before = stream.entries("s1")
    const after = stream.entries("s1")

    expect(before).not.toBe(after)
  })

  test("entries() returns a fresh reference after each record() — the React-hook flow", async () => {
    // Simulates what the `useAmbientStream` hook does: subscribe → on each
    // notification, call `entries(sid)` and pass to setState. The setState
    // call must see a new reference each time or React skips the render.
    await using scope = createScope("test")
    const stream = createAmbientStream(scope)
    const observed: ReadonlyArray<unknown>[] = []
    stream.subscribe((sid) => {
      if (sid === "s1") observed.push(stream.entries("s1"))
    })

    stream.record("s1", event("e1"))
    stream.record("s1", event("e2"))
    stream.record("s1", event("e3"))

    expect(observed).toHaveLength(3)
    expect(observed[0]).not.toBe(observed[1])
    expect(observed[1]).not.toBe(observed[2])
    expect(observed[0]).not.toBe(observed[2])
    // And each snapshot reflects the buffer state at its time:
    expect(observed[0]?.length).toBe(1)
    expect(observed[1]?.length).toBe(2)
    expect(observed[2]?.length).toBe(3)
  })

  test("mutations to a returned snapshot do not affect later snapshots", async () => {
    await using scope = createScope("test")
    const stream = createAmbientStream(scope)
    stream.record("s1", event("e1"))

    const snap = stream.entries("s1") as AmbientLooseArray
    snap.push(event("rogue") as never) // simulate a misbehaving consumer

    expect(stream.entries("s1")).toHaveLength(1)
  })
})

// Local alias to express "mutate this in test scope only" without leaking
// into the production type. The slice() return is a real mutable Array at
// runtime; the readonly typing protects callers, not the underlying object.
type AmbientLooseArray = unknown[]
