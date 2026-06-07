import React, { createRef, useState } from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, TextArea, type TextAreaHandle } from "@silvery/ag-react"

describe("TextArea handle", () => {
  test("getValue reads the live editor buffer during rapid input batches", async () => {
    const ref = createRef<TextAreaHandle>()

    function App() {
      const [value, setValue] = useState("")
      return (
        <Box width={40} height={4}>
          <TextArea ref={ref} value={value} onChange={setValue} fieldSizing="fixed" rows={3} />
        </Box>
      )
    }

    const r = createRenderer({ cols: 40, rows: 4 })
    const app = r(<App />)
    await app.type("abc")

    expect(ref.current?.getValue()).toBe("abc")
  })
})
