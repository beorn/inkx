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

    const sender = term as unknown as { sendInput(data: string): void }
    sender.sendInput(osc52ClipboardResponse("FROM_CLIPBOARD"))

    expect(pastes).toEqual(["FROM_CLIPBOARD"])
  })

  test("sendInput ignores malformed OSC52 clipboard responses", () => {
    using term = createTermless({ cols: 40, rows: 6 })
    const input = term.input
    const pastes: string[] = []
    input?.onPaste((event) => pastes.push(event.text))

    const sender = term as unknown as { sendInput(data: string): void }
    const unterminatedClipboardResponse = `\x1b]52;c;${Buffer.from("broken").toString("base64")}`

    expect(() => sender.sendInput(unterminatedClipboardResponse)).not.toThrow()
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
