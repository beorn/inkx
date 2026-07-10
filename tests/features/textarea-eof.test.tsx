import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text, TextArea } from "silvery"

describe("TextArea EOF", () => {
  test("calls onEof for Ctrl+D on an empty buffer", async () => {
    const render = createRenderer({ cols: 40, rows: 5 })
    let eofCount = 0
    const app = render(
      <Box flexDirection="column">
        <TextArea value="" onEof={() => eofCount++} />
      </Box>,
    )

    await app.press("ctrl+d")

    expect(eofCount).toBe(1)
  })

  test("keeps Ctrl+D delete-forward behavior when text exists", async () => {
    const render = createRenderer({ cols: 40, rows: 5 })
    let eofCount = 0

    function ControlledTextArea() {
      const [value, setValue] = React.useState("abc")
      return (
        <Box flexDirection="column">
          <TextArea value={value} onChange={setValue} onEof={() => eofCount++} />
          <Text>value:{value}</Text>
        </Box>
      )
    }

    const app = render(<ControlledTextArea />)

    await app.press("ctrl+a")
    await app.press("ctrl+d")

    expect(eofCount).toBe(0)
    expect(app.text).toContain("value:bc")
  })
})
