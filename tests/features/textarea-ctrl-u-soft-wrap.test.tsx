/**
 * TextArea readline kills operate on logical lines, not soft-wrap rows.
 *
 * Silver Code dogfood reproduced a command composer failure where Ctrl+U on a
 * long soft-wrapped prompt removed only the final visual row. The stale prefix
 * then concatenated with later queue/interjection text.
 */

import React, { useState } from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, TextArea } from "@silvery/ag-react"

describe("TextArea Ctrl+U/Ctrl+K with soft wraps", () => {
  test("Ctrl+U clears to the start of the logical line, not the soft-wrap segment", async () => {
    let latest = ""

    function App() {
      const [value, setValue] = useState("")
      return (
        <Box width={40} height={6}>
          <TextArea
            value={value}
            onChange={(next) => {
              latest = next
              setValue(next)
            }}
            fieldSizing="fixed"
            rows={4}
          />
        </Box>
      )
    }

    const app = createRenderer({ cols: 40, rows: 6, kittyMode: true })(<App />)
    const command =
      "rg -n very-long-command-overflow-probe apps/silvercode/src/components/SessionPaneControlBar.tsx"

    await app.type(command)
    expect(latest).toBe(command)

    await app.press("ctrl+u")
    expect(latest).toBe("")
    expect(app.text).not.toContain("very-long-command-overflow-probe")
  })

  test("Ctrl+K clears to the end of the logical line, not the soft-wrap segment", async () => {
    let latest = ""

    function App() {
      const [value, setValue] = useState("")
      return (
        <Box width={40} height={6}>
          <TextArea
            value={value}
            onChange={(next) => {
              latest = next
              setValue(next)
            }}
            fieldSizing="fixed"
            rows={4}
          />
        </Box>
      )
    }

    const app = createRenderer({ cols: 40, rows: 6, kittyMode: true })(<App />)
    const command =
      "rg -n very-long-command-overflow-probe apps/silvercode/src/components/SessionPaneControlBar.tsx"

    await app.type(command)
    await app.press("ctrl+Home")
    await app.press("ctrl+k")

    expect(latest).toBe("")
    expect(app.text).not.toContain("very-long-command-overflow-probe")
  })
})
