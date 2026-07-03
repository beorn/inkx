import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "../src"

function frame(text: string): React.ReactElement {
  return (
    <Box width={12} height={1} backgroundColor="#102124" color="#d8dee9">
      <Text wrap="clip">{text}</Text>
    </Box>
  )
}

describe("Text trailing clear", () => {
  test("cleared cells after text shrink match fresh background-only cells", () => {
    const prevStrict = process.env.SILVERY_STRICT
    process.env.SILVERY_STRICT = "1"
    try {
      const render = createRenderer({ cols: 12, rows: 1 })
      const app = render(frame("abcdef"))

      app.rerender(frame("abc"))

      const cleared = app.cell(3, 0)
      expect(cleared.char).toBe(" ")
      expect(cleared.bg).not.toBeNull()
      expect(cleared.fg).toBeNull()
    } finally {
      if (prevStrict === undefined) {
        delete process.env.SILVERY_STRICT
      } else {
        process.env.SILVERY_STRICT = prevStrict
      }
    }
  })
})
