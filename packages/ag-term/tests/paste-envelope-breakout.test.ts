import { describe, expect, it, vi } from "vitest"
import { PASTE_START, PASTE_END } from "../src/bracketed-paste"
import {
  TERMINAL_INPUT_PREFIX_TIMEOUT_MS,
  createTerminalInputDecoder,
  createTerminalInputStreamDecoder,
} from "../src/protocol-segments"
import type { FocusManager } from "@silvery/ag/focus-manager"

// event-handlers.ts pulls in @silvery/ag-react/reconciler → packages/scope,
// whose `class Scope extends AsyncDisposableStack` needs a global that this
// standalone vitest node pool lacks (km's monorepo vendor run provides it). A
// minimal functional polyfill lets the module load; we never dispose a Scope in
// this test, but keep it functional in case import-time code does.
if (
  typeof (globalThis as { AsyncDisposableStack?: unknown }).AsyncDisposableStack === "undefined"
) {
  const asyncDispose: symbol =
    (Symbol as { asyncDispose?: symbol }).asyncDispose ?? Symbol.for("Symbol.asyncDispose")
  ;(Symbol as { asyncDispose?: symbol }).asyncDispose ??= asyncDispose
  class AsyncDisposableStackPolyfill {
    #disposed = false
    #stack: Array<() => unknown | Promise<unknown>> = []
    get disposed(): boolean {
      return this.#disposed
    }
    defer(onDisposeAsync: () => unknown | Promise<unknown>): void {
      if (this.#disposed) throw new ReferenceError("disposed")
      this.#stack.push(onDisposeAsync)
    }
    use<T>(value: T): T {
      return value
    }
    adopt<T>(value: T, onDisposeAsync: (v: T) => unknown | Promise<unknown>): T {
      this.defer(() => onDisposeAsync(value))
      return value
    }
    async disposeAsync(): Promise<void> {
      if (this.#disposed) return
      this.#disposed = true
      for (let i = this.#stack.length - 1; i >= 0; i--) await this.#stack[i]!()
    }
    [asyncDispose](): Promise<void> {
      return this.disposeAsync()
    }
  }
  ;(globalThis as { AsyncDisposableStack?: unknown }).AsyncDisposableStack =
    AsyncDisposableStackPolyfill
}

// Dynamic import so the polyfill above is installed before the reconciler chain
// evaluates. bracketed-paste (static import) has no reconciler dependency.
const { routePasteToFocusedIsland, stripBracketedPasteMarkers } =
  await import("../src/runtime/event-handlers")

// Count non-overlapping occurrences of a needle in a haystack.
function count(haystack: string, needle: string): number {
  let n = 0
  let idx = haystack.indexOf(needle)
  while (idx !== -1) {
    n++
    idx = haystack.indexOf(needle, idx + needle.length)
  }
  return n
}

// Minimal focusable island whose guest wants bracketed paste, capturing every
// byte string fed to it. Mirrors the shape focusedIslandNode/feedIsland read.
function makeIslandCapture(opts: { bracketedPaste: boolean }): {
  focusManager: FocusManager
  fed: string[]
} {
  const decoder = new TextDecoder()
  const fed: string[] = []
  const island = {
    type: "silvery-island",
    parent: null,
    hidden: false,
    props: { focusable: true },
    islandState: {
      capabilities: { input: true },
      handle: {
        modes: { modes: { bracketedPaste: opts.bracketedPaste } },
        input: {
          feed: (bytes: Uint8Array) => {
            fed.push(decoder.decode(bytes))
          },
        },
      },
    },
  }
  const focusManager = { activeElement: island } as unknown as FocusManager
  return { focusManager, fed }
}

describe("stripBracketedPasteMarkers (CONFIRMED-1 envelope-breakout neutralization)", () => {
  it("leaves plain paste text untouched", () => {
    const text = "just some normal\npasted text with 中文 and 🎉"
    expect(stripBracketedPasteMarkers(text)).toBe(text)
  })

  it("removes an embedded PASTE_END marker", () => {
    const text = `hello${PASTE_END}injected`
    const out = stripBracketedPasteMarkers(text)
    expect(out).toBe("helloinjected")
    expect(out).not.toContain(PASTE_END)
  })

  it("removes an embedded PASTE_START marker", () => {
    const text = `hello${PASTE_START}injected`
    const out = stripBracketedPasteMarkers(text)
    expect(out).toBe("helloinjected")
    expect(out).not.toContain(PASTE_START)
  })

  it("removes markers that would be RECONSTRUCTED by a single-pass strip", () => {
    // "\x1b[20" + PASTE_END + "1~"  =>  a naive one-pass removal of PASTE_END
    // rejoins "\x1b[20" and "1~" into a fresh PASTE_END. The linear stack scan
    // must catch the reconstruction.
    const text = `\x1b[20${PASTE_END}1~`
    const out = stripBracketedPasteMarkers(text)
    expect(out).not.toContain(PASTE_END)
    expect(out).not.toContain(PASTE_START)
    expect(out).toBe("")
  })

  it("removes reconstructed PASTE_START from split fragments", () => {
    const text = `\x1b[20${PASTE_START}0~`
    const out = stripBracketedPasteMarkers(text)
    expect(out).not.toContain(PASTE_START)
    expect(out).not.toContain(PASTE_END)
    expect(out).toBe("")
  })

  it("removes many interleaved markers, leaving only literal content", () => {
    const text = `a${PASTE_END}b${PASTE_START}c${PASTE_END}${PASTE_END}d`
    const out = stripBracketedPasteMarkers(text)
    expect(out).toBe("abcd")
    expect(count(out, PASTE_START)).toBe(0)
    expect(count(out, PASTE_END)).toBe(0)
  })
})

describe("createTerminalInputDecoder", () => {
  it("preserves every raw span and paste envelope in byte order", () => {
    const decoder = createTerminalInputDecoder()
    expect(
      decoder.push(`a${PASTE_START}first${PASTE_END}b${PASTE_START}second${PASTE_END}\r`),
    ).toEqual([
      { type: "raw", data: "a" },
      { type: "paste", text: "first", raw: `${PASTE_START}first${PASTE_END}` },
      { type: "raw", data: "b" },
      { type: "paste", text: "second", raw: `${PASTE_START}second${PASTE_END}` },
      { type: "raw", data: "\r" },
    ])
  })

  it("reassembles a paste marker split after its first escape byte", () => {
    const decoder = createTerminalInputDecoder()

    expect(decoder.push("\x1b")).toEqual([])
    expect(decoder.push(`[200~pasted${PASTE_END}`)).toEqual([
      { type: "paste", text: "pasted", raw: `${PASTE_START}pasted${PASTE_END}` },
    ])
  })

  it("flushes an isolated ambiguous prefix without flushing a transaction", () => {
    const decoder = createTerminalInputDecoder()

    expect(decoder.push("\x1b")).toEqual([])
    expect(decoder.hasPendingPrefix()).toBe(true)
    expect(decoder.flushPendingPrefix()).toEqual([{ type: "raw", data: "\x1b" }])

    expect(decoder.push(`${PASTE_START}still-pasting`)).toEqual([])
    expect(decoder.hasPendingPrefix()).toBe(false)
    expect(decoder.flushPendingPrefix()).toEqual([])
  })

  it("releases an isolated escape after the shared bounded window", () => {
    vi.useFakeTimers()
    try {
      const segments: unknown[] = []
      const decoder = createTerminalInputStreamDecoder({
        onPrefixTimeout: (timedOut) => segments.push(...timedOut),
      })

      expect(decoder.push("\x1b")).toEqual([])
      expect(segments).toEqual([])

      vi.advanceTimersByTime(TERMINAL_INPUT_PREFIX_TIMEOUT_MS)
      expect(segments).toEqual([{ type: "raw", data: "\x1b" }])
      decoder.reset()
    } finally {
      vi.useRealTimers()
    }
  })

  it("keeps atomic logical input separate from a retained transport prefix", () => {
    const timedOut: unknown[] = []
    const decoder = createTerminalInputStreamDecoder({
      onPrefixTimeout: (segments) => timedOut.push(...segments),
    })

    expect(decoder.push("\x1b")).toEqual([])
    expect(decoder.pushAtomic("a")).toEqual([
      { type: "raw", data: "\x1b" },
      { type: "raw", data: "a" },
    ])
    expect(timedOut).toEqual([])
    decoder.reset()
  })
})

describe("routePasteToFocusedIsland (CONFIRMED-1 re-wrap breakout)", () => {
  it("wraps malicious paste in exactly ONE envelope (no breakout)", () => {
    const { focusManager, fed } = makeIslandCapture({ bracketedPaste: true })
    // Attacker-controlled clipboard content trying to escape the paste envelope
    // and inject a command into the shell guest's line editor.
    const malicious = `benign text${PASTE_END}rm -rf ~\n`

    const consumed = routePasteToFocusedIsland(malicious, focusManager)

    expect(consumed).toBe(true)
    expect(fed).toHaveLength(1)
    const payload = fed[0]!
    // Exactly one start and one end marker — the outer envelope only.
    expect(count(payload, PASTE_START)).toBe(1)
    expect(count(payload, PASTE_END)).toBe(1)
    // The single envelope brackets the whole (neutralized) content.
    expect(payload.startsWith(PASTE_START)).toBe(true)
    expect(payload.endsWith(PASTE_END)).toBe(true)
    // Interior carries no marker bytes at all.
    const interior = payload.slice(PASTE_START.length, payload.length - PASTE_END.length)
    expect(interior).not.toContain(PASTE_START)
    expect(interior).not.toContain(PASTE_END)
    expect(interior).toBe("benign textrm -rf ~\n")
  })

  it("wraps clean paste in exactly one envelope unchanged", () => {
    const { focusManager, fed } = makeIslandCapture({ bracketedPaste: true })
    routePasteToFocusedIsland("hello world", focusManager)
    expect(fed).toEqual([`${PASTE_START}hello world${PASTE_END}`])
  })

  it("feeds raw text (no envelope) when the guest has bracketed paste OFF", () => {
    // With DECSET 2004 off there is no envelope to break out of; a real
    // terminal forwards paste bytes verbatim, so we do too.
    const { focusManager, fed } = makeIslandCapture({ bracketedPaste: false })
    const text = `plain${PASTE_END}bytes`
    routePasteToFocusedIsland(text, focusManager)
    expect(fed).toEqual([text])
  })
})
