import React, { useState } from "react"
import { describe, expect, test } from "vitest"
import "@termless/test/matchers"
import { createTermless } from "@silvery/test"
import { createTerm } from "@silvery/ag-term"
import { createVtermBackend } from "@termless/vterm"
import { Box, TextArea } from "../../src/index.js"
import { run } from "../../packages/ag-term/src/runtime/run"

const settle = (ms = 40): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

describe("runtime input protocol routing", () => {
  test("inline TextArea cursorStyle reaches the hardware cursor shape", async () => {
    const backend = createVtermBackend()
    using term = createTerm(backend, { cols: 40, rows: 6 })

    const handle = await run(
      <Box width={40} height={6}>
        <TextArea defaultValue="Hello" fieldSizing="fixed" rows={1} cursorStyle="underline" />
      </Box>,
      term,
      { mode: "inline" },
    )
    try {
      await settle()
      expect(backend.getCursor().style).toBe("underline")
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
