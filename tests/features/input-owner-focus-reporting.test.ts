/**
 * Parser-level regression: focus-reporting bytes (CSI I / CSI O, emitted by the
 * terminal under DEC mode ?1004h) MUST be consumed as focus events by the input
 * owner — never surfaced as printable key input (which would echo as visible
 * cells, the hab-deck "C2 focus-reporting bytes leak as cells" symptom).
 *
 * Headless termless can't emit real window-focus events, so this drives the
 * bytes straight through `createInputOwner`'s parse path (the same path live
 * stdin feeds), asserting:
 *   1. `\x1b[I` → onFocus({ focused: true }), and NO onKey fires.
 *   2. `\x1b[O` → onFocus({ focused: false }), and NO onKey fires.
 *   3. focus bytes adjacent to printable text split correctly — the text keys
 *      fire, the focus event fires, and the `[`/`I`/`O` bytes never appear as
 *      printable input.
 *   4. focus bytes split across two stdin reads reassemble into one focus event.
 *
 * Bead: @hab/19797-hab-master/20310 (section C — C2 focus-reporting leak).
 */

import { describe, it, expect, vi } from "vitest"
import { createInputOwner } from "@silvery/ag-term/runtime"

function createMockIO() {
  const dataHandlers = new Set<(chunk: string) => void>()
  const rawState = { isRaw: false, paused: false, encoding: null as BufferEncoding | null }

  const stdout = {
    write: () => true,
    isTTY: true,
    columns: 80,
    rows: 24,
    on: () => {},
    off: () => {},
  } as unknown as NodeJS.WriteStream

  const stdin = {
    get isTTY() {
      return true
    },
    get isRaw() {
      return rawState.isRaw
    },
    setRawMode(raw: boolean) {
      rawState.isRaw = raw
      return stdin
    },
    resume() {
      rawState.paused = false
    },
    pause() {
      rawState.paused = true
    },
    setEncoding(enc: BufferEncoding) {
      rawState.encoding = enc
    },
    on(event: string, handler: (...args: unknown[]) => void) {
      if (event === "data") dataHandlers.add(handler as (chunk: string) => void)
      return stdin
    },
    off(event: string, handler: (...args: unknown[]) => void) {
      if (event === "data") dataHandlers.delete(handler as (chunk: string) => void)
      return stdin
    },
    removeListener(event: string, handler: (...args: unknown[]) => void) {
      if (event === "data") dataHandlers.delete(handler as (chunk: string) => void)
      return stdin
    },
    listenerCount(event: string) {
      return event === "data" ? dataHandlers.size : 0
    },
  } as unknown as NodeJS.ReadStream

  function send(chunk: string): void {
    for (const handler of Array.from(dataHandlers)) handler(chunk)
  }

  return { stdin, stdout, send }
}

describe("InputOwner — focus reporting (CSI I / CSI O) is consumed, never echoed", () => {
  it("\\x1b[I fires a focus-in event and NO key event", () => {
    const { stdin, stdout, send } = createMockIO()
    using owner = createInputOwner(stdin, stdout, { enableBracketedPaste: false })
    const focus: boolean[] = []
    const keys: string[] = []
    owner.onFocus((e) => focus.push(e.focused))
    owner.onKey((e) => keys.push(e.input))

    send("\x1b[I")

    expect(focus).toEqual([true])
    expect(keys).toEqual([])
  })

  it("\\x1b[O fires a focus-out event and NO key event", () => {
    const { stdin, stdout, send } = createMockIO()
    using owner = createInputOwner(stdin, stdout, { enableBracketedPaste: false })
    const focus: boolean[] = []
    const keys: string[] = []
    owner.onFocus((e) => focus.push(e.focused))
    owner.onKey((e) => keys.push(e.input))

    send("\x1b[O")

    expect(focus).toEqual([false])
    expect(keys).toEqual([])
  })

  it("focus bytes adjacent to printable text: text keys fire, focus fires, no [I leak", () => {
    const { stdin, stdout, send } = createMockIO()
    using owner = createInputOwner(stdin, stdout, { enableBracketedPaste: false })
    const focus: boolean[] = []
    const keys: string[] = []
    owner.onFocus((e) => focus.push(e.focused))
    owner.onKey((e) => keys.push(e.input))

    // Terminal delivers a focus-in immediately followed by a typed 'a', then a
    // focus-out — all in one stdin read (a realistic multiplexed chunk).
    send("\x1b[Ia\x1b[O")

    expect(focus).toEqual([true, false])
    expect(keys).toEqual(["a"])
    // The bracket / I / O bytes must never surface as printable key input.
    expect(keys.join("")).not.toContain("[")
    expect(keys.join("")).not.toContain("I")
    expect(keys.join("")).not.toContain("O")
  })

  it("focus bytes split across two stdin reads reassemble into one focus event", () => {
    const { stdin, stdout, send } = createMockIO()
    using owner = createInputOwner(stdin, stdout, { enableBracketedPaste: false })
    const focus: boolean[] = []
    const keys: string[] = []
    owner.onFocus((e) => focus.push(e.focused))
    owner.onKey((e) => keys.push(e.input))

    // The CSI sequence arrives split at the terminator boundary: "\x1b[" then
    // "I". splitRawInput buffers the incomplete CSI and prepends it next chunk.
    send("\x1b[")
    send("I")

    expect(focus).toEqual([true])
    expect(keys).toEqual([])
  })

  it("multiple focus toggles in one chunk all fire as focus events", () => {
    const { stdin, stdout, send } = createMockIO()
    using owner = createInputOwner(stdin, stdout, { enableBracketedPaste: false })
    const focus: boolean[] = []
    const keys: string[] = []
    owner.onFocus((e) => focus.push(e.focused))
    owner.onKey((e) => keys.push(e.input))

    send("\x1b[I\x1b[O\x1b[I")

    expect(focus).toEqual([true, false, true])
    expect(keys).toEqual([])
  })

  // The C2 leak proper: a focus event split as a bare `\x1b` whose `[I`/`[O`
  // tail arrives AFTER the 25ms ESC-disambiguation window already committed the
  // ESC as Escape. Pre-fix, the orphaned `[I` leaked as printable `[` + `I`
  // cells (same class as the 19326 SGR-mouse leak). The ESC-continuation
  // recovery re-prefixes the orphaned tail so it parses as a focus event.
  it("focus-in split as ESC then DELAYED [I recovers (no printable leak)", async () => {
    vi.useFakeTimers()
    try {
      const { stdin, stdout, send } = createMockIO()
      using owner = createInputOwner(stdin, stdout, { enableBracketedPaste: false })
      const focus: boolean[] = []
      const keys: string[] = []
      owner.onFocus((e) => focus.push(e.focused))
      owner.onKey((e) => keys.push(e.input))

      send("\x1b")
      // Advance past the 25ms disambiguation window — ESC commits as Escape.
      await vi.advanceTimersByTimeAsync(40)
      send("[I")

      expect(focus).toEqual([true])
      // No bracket / I bytes leaked as printable cells.
      expect(keys.join("")).not.toContain("[")
      expect(keys.join("")).not.toContain("I")
    } finally {
      vi.useRealTimers()
    }
  })

  it("focus-out split as ESC then DELAYED [O recovers (no printable leak)", async () => {
    vi.useFakeTimers()
    try {
      const { stdin, stdout, send } = createMockIO()
      using owner = createInputOwner(stdin, stdout, { enableBracketedPaste: false })
      const focus: boolean[] = []
      const keys: string[] = []
      owner.onFocus((e) => focus.push(e.focused))
      owner.onKey((e) => keys.push(e.input))

      send("\x1b")
      await vi.advanceTimersByTimeAsync(40)
      send("[O")

      expect(focus).toEqual([false])
      expect(keys.join("")).not.toContain("[")
      expect(keys.join("")).not.toContain("O")
    } finally {
      vi.useRealTimers()
    }
  })

  it("a genuine Escape followed much later by a typed '[' is NOT swallowed", async () => {
    vi.useFakeTimers()
    try {
      const { stdin, stdout, send } = createMockIO()
      using owner = createInputOwner(stdin, stdout, { enableBracketedPaste: false })
      const focus: boolean[] = []
      const keys: Array<{ input: string; escape: boolean }> = []
      owner.onFocus((e) => focus.push(e.focused))
      owner.onKey((e) => keys.push({ input: e.input, escape: e.key.escape }))

      send("\x1b")
      await vi.advanceTimersByTimeAsync(40) // Escape commits
      // Well past the recovery window: a real typed '[' (e.g. user types a
      // bracket) must reach handlers, not get absorbed as a phantom CSI.
      await vi.advanceTimersByTimeAsync(200)
      send("[")

      expect(focus).toEqual([])
      const escapes = keys.filter((k) => k.escape)
      const brackets = keys.filter((k) => k.input === "[")
      expect(escapes.length).toBe(1)
      expect(brackets.length).toBe(1)
    } finally {
      vi.useRealTimers()
    }
  })
})
