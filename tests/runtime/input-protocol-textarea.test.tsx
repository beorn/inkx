import React, { useState } from "react"
import { describe, expect, test } from "vitest"
import "@termless/test/matchers"
import { createTermless } from "@silvery/test"
import { Box, TextArea } from "../../src/index.js"
import { run } from "../../packages/ag-term/src/runtime/run"

const settle = (ms = 40): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

function osc52ClipboardResponse(text: string): string {
  return `\x1b]52;c;${Buffer.from(text).toString("base64")}\x07`
}

describe("runtime input protocol routing", () => {
  test("sendInput decodes OSC52 clipboard responses into paste events", () => {
    using term = createTermless({ cols: 40, rows: 6 })
    const input = term.input
    const pastes: string[] = []
    input?.onPaste((event) => pastes.push(event.text))

    term.sendInput(osc52ClipboardResponse("FROM_CLIPBOARD"))

    expect(pastes).toEqual(["FROM_CLIPBOARD"])
  })

  test("sendInput preserves trailing Return in the same OSC52 response chunk", () => {
    using term = createTermless({ cols: 40, rows: 6 })
    const events: string[] = []
    term.input?.onPaste((event) => events.push(`paste:${event.text}`))
    term.input?.onKey((event) => {
      if (event.key.return) events.push("return")
    })

    term.sendInput(`${osc52ClipboardResponse("FROM_CLIPBOARD")}\r`)

    expect(events).toEqual(["paste:FROM_CLIPBOARD", "return"])
  })

  test("sendInput preserves trailing Return in the same bracketed-paste chunk", () => {
    using term = createTermless({ cols: 40, rows: 6 })
    const events: string[] = []
    term.input?.onPaste((event) => events.push(`paste:${event.text}`))
    term.input?.onKey((event) => {
      if (event.key.return) events.push("return")
    })

    term.sendInput("\x1b[200~FROM_PASTE\x1b[201~\r")

    expect(events).toEqual(["paste:FROM_PASTE", "return"])
  })

  test("sendInput reassembles split bracketed-paste and OSC52 transactions", () => {
    using term = createTermless({ cols: 40, rows: 6 })
    const events: string[] = []
    term.input?.onPaste((event) => events.push(`paste:${event.text}`))
    term.input?.onKey((event) => {
      if (event.key.return) events.push("return")
    })

    term.sendInput("\x1b")
    expect(events).toEqual([])
    term.sendInput("[200~BRACKETED_PASTE\x1b[201~\r")
    term.sendInput("\x1b")
    term.sendInput("]52;c;Q0xJUF9CT0FSRA==\x07\r")

    expect(events).toEqual(["paste:BRACKETED_PASTE", "return", "paste:CLIP_BOARD", "return"])
  })

  test("sendInput ignores malformed OSC52 clipboard responses", () => {
    using term = createTermless({ cols: 40, rows: 6 })
    const input = term.input
    const pastes: string[] = []
    input?.onPaste((event) => pastes.push(event.text))

    const unterminatedClipboardResponse = `\x1b]52;c;${Buffer.from("broken").toString("base64")}`

    expect(() => term.sendInput(unterminatedClipboardResponse)).not.toThrow()
    expect(pastes).toEqual([])
  })

  test("inline TextArea cursorStyle reaches the composited caret cell", async () => {
    using term = createTermless({ cols: 40, rows: 6 })

    const handle = await run(
      <Box width={40} height={6}>
        <TextArea defaultValue="Hello" fieldSizing="fixed" rows={1} cursorStyle="underline" />
      </Box>,
      term,
    )
    try {
      await settle()
      expect(term.cell(0, "Hello".length)).toHaveAttrs({ underline: true })
    } finally {
      handle.unmount()
    }
  })

  test("split SGR mouse packet is not inserted into TextArea text", async () => {
    using term = createTermless({ cols: 80, rows: 8 })
    const values: string[] = []

    function App(): React.ReactElement {
      const [value, setValue] = useState("")
      return (
        <Box width={80} height={8}>
          <TextArea
            value={value}
            onChange={(next) => {
              values.push(next)
              setValue(next)
            }}
          />
        </Box>
      )
    }

    const handle = await run(<App />, term, { mouse: true, selection: false })
    await settle()

    const input = term as unknown as { sendInput(data: string): void }
    input.sendInput("\x1b")
    input.sendInput("[<64;672;1488M")
    await settle()

    handle.unmount()

    expect(values).toEqual([])
    expect(term.screen).not.toContainText("[<64;672;1488M")
  })
})
