/**
 * Tests for fuzz term providers (createFuzzTerm, createReplayTerm)
 */
import { describe, it, expect } from "vitest"
import { createFuzzTerm, createReplayTerm } from "./fuzz-term.ts"

describe("createFuzzTerm", () => {
  it("generates key events from keys array", async () => {
    const term = createFuzzTerm({
      keys: ["j", "k", "h", "l"],
      count: 10,
      seed: 42,
    })

    const events: string[] = []
    for await (const event of term.events()) {
      events.push(event.data.input)
    }

    expect(events).toHaveLength(10)
    expect(events.every((k) => ["j", "k", "h", "l"].includes(k))).toBe(true)
    term[Symbol.dispose]()
  })

  it("is deterministic with same seed", async () => {
    const term1 = createFuzzTerm({
      keys: ["a", "b", "c"],
      count: 20,
      seed: 12345,
    })
    const term2 = createFuzzTerm({
      keys: ["a", "b", "c"],
      count: 20,
      seed: 12345,
    })

    const events1: string[] = []
    const events2: string[] = []

    for await (const e of term1.events()) events1.push(e.data.input)
    for await (const e of term2.events()) events2.push(e.data.input)

    expect(events1).toEqual(events2)
    term1[Symbol.dispose]()
    term2[Symbol.dispose]()
  })

  it("records history", async () => {
    const term = createFuzzTerm({ keys: ["j", "k"], count: 5, seed: 42 })

    for await (const _ of term.events()) {
      /* consume */
    }

    expect(term.history).toHaveLength(5)
    expect(term.history.every((k) => ["j", "k"].includes(k))).toBe(true)
    term[Symbol.dispose]()
  })

  it("supports pick function", async () => {
    let callCount = 0
    const term = createFuzzTerm({
      count: 5,
      seed: 42,
      pick: (_state, _history, random) => {
        callCount++
        return random.pick(["x", "y"])
      },
    })

    const events: string[] = []
    for await (const e of term.events()) events.push(e.data.input)

    expect(events).toHaveLength(5)
    expect(callCount).toBe(5)
    expect(events.every((k) => ["x", "y"].includes(k))).toBe(true)
    term[Symbol.dispose]()
  })

  it("supports batch picks (pick returns array)", async () => {
    const term = createFuzzTerm({
      count: 6,
      seed: 42,
      pick: () => ["a", "b", "c"],
    })

    const events: string[] = []
    for await (const e of term.events()) events.push(e.data.input)

    // pick returns ['a','b','c'] — 2 calls needed for 6 events
    expect(events).toEqual(["a", "b", "c", "a", "b", "c"])
    term[Symbol.dispose]()
  })

  it("provides state to pick function", async () => {
    const states: Record<string, unknown>[] = []
    const term = createFuzzTerm({
      count: 3,
      cols: 100,
      rows: 30,
      pick: (state) => {
        states.push({ ...state })
        return "j"
      },
    })

    for await (const _ of term.events()) {
      /* consume */
    }

    expect(states).toHaveLength(3)
    expect(states[0]).toEqual({ cols: 100, rows: 30 })
    term[Symbol.dispose]()
  })

  it("provides history to pick function", async () => {
    const histories: string[][] = []
    const term = createFuzzTerm({
      count: 3,
      pick: (_state, history) => {
        histories.push([...history])
        return "j"
      },
    })

    for await (const _ of term.events()) {
      /* consume */
    }

    expect(histories).toEqual([[], ["j"], ["j", "j"]])
    term[Symbol.dispose]()
  })

  it("exposes state via getState()", () => {
    const term = createFuzzTerm({ keys: ["j"], count: 1, cols: 120, rows: 40 })
    expect(term.getState()).toEqual({ cols: 120, rows: 40 })
    term[Symbol.dispose]()
  })

  it("supports subscribe()", () => {
    const term = createFuzzTerm({ keys: ["j"], count: 1 })
    const fn = () => {}
    const unsub = term.subscribe(fn)
    expect(typeof unsub).toBe("function")
    unsub()
    term[Symbol.dispose]()
  })

  it("creates key objects with correct flags", async () => {
    const term = createFuzzTerm({
      count: 3,
      pick: () => ["Enter", "ArrowUp", "a"],
    })

    const events: Array<{ input: string; key: Record<string, boolean> }> = []
    for await (const e of term.events()) {
      events.push({ input: e.data.input, key: { ...e.data.key } })
    }

    expect(events[0]!.key.return).toBe(true)
    expect(events[1]!.key.upArrow).toBe(true)
    term[Symbol.dispose]()
  })

  it("supports async pick function", async () => {
    const term = createFuzzTerm({
      count: 3,
      pick: async () => {
        await new Promise((r) => setTimeout(r, 1))
        return "async-key"
      },
    })

    const events: string[] = []
    for await (const e of term.events()) events.push(e.data.input)

    expect(events).toEqual(["async-key", "async-key", "async-key"])
    term[Symbol.dispose]()
  })
})

describe("createReplayTerm", () => {
  it("replays a fixed sequence", async () => {
    const term = createReplayTerm(["j", "k", "j", "l"])

    const events: string[] = []
    for await (const e of term.events()) events.push(e.data.input)

    expect(events).toEqual(["j", "k", "j", "l"])
    term[Symbol.dispose]()
  })

  it("exposes sequence", () => {
    const seq = ["a", "b", "c"]
    const term = createReplayTerm(seq)
    expect(term.sequence).toBe(seq)
    term[Symbol.dispose]()
  })

  it("replays empty sequence", async () => {
    const term = createReplayTerm([])

    const events: string[] = []
    for await (const e of term.events()) events.push(e.data.input)

    expect(events).toEqual([])
    term[Symbol.dispose]()
  })

  it("provides state via getState()", () => {
    const term = createReplayTerm([], { cols: 100, rows: 50 })
    expect(term.getState()).toEqual({ cols: 100, rows: 50 })
    term[Symbol.dispose]()
  })
})
