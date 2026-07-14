import { describe, expect, test, vi } from "vitest"
import { createXtermProvider } from "../src/xterm/xterm-provider"
import type { XtermTerminal } from "../src/xterm"

function createFakeTerminal(): {
  terminal: XtermTerminal
  send: (data: string) => void
} {
  let onData: ((data: string) => void) | undefined
  const terminal: XtermTerminal = {
    cols: 80,
    rows: 24,
    write: vi.fn(),
    onData(callback) {
      onData = callback
      return { dispose: () => (onData = undefined) }
    },
  }
  return {
    terminal,
    send: (data) => onData?.(data),
  }
}

describe("xterm input protocol ownership", () => {
  test("ordinary split CSI is retained only until the next chunk disambiguates it", () => {
    const { terminal, send } = createFakeTerminal()
    const provider = createXtermProvider(terminal)
    const input: string[] = []
    provider.onInput((chunk) => input.push(chunk))

    send("\x1b[")
    expect(input).toEqual([])
    send("A")

    expect(input).toEqual(["\x1b[A"])
    provider.dispose()
  })

  test("mouse-looking bytes inside a split paste stay in the paste transaction", () => {
    const { terminal, send } = createFakeTerminal()
    const provider = createXtermProvider(terminal)
    const input: string[] = []
    const paste: string[] = []
    const mouse: unknown[] = []
    provider.onInput((chunk) => input.push(chunk))
    provider.onPaste((text) => paste.push(text))
    provider.onMouse((event) => mouse.push(event))

    send("\x1b")
    expect(input).toEqual([])
    expect(paste).toEqual([])
    expect(mouse).toEqual([])

    send("[200~literal \x1b[<0;2;3M text\x1b[201~")
    expect(input).toEqual([])
    expect(paste).toEqual(["literal \x1b[<0;2;3M text"])
    expect(mouse).toEqual([])

    provider.dispose()
  })
})
