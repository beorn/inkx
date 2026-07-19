import React from "react"
import { describe, expect, test } from "vitest"
import { createTermless } from "@silvery/test"
import { run } from "../../packages/ag-term/src/runtime/run"
import { Box, Text } from "../../src/index.js"

const settle = (ms = 50) => new Promise<void>((resolve) => setTimeout(resolve, ms))

describe("onContextMenu", () => {
  test("secondary click dispatches contextmenu without dispatching primary click", async () => {
    const contextButtons: number[] = []
    let clicks = 0
    using term = createTermless({ cols: 20, rows: 4 })
    const handle = await run(
      <Box
        width={20}
        height={4}
        onClick={() => {
          clicks += 1
        }}
        onContextMenu={(event) => {
          contextButtons.push(event.button)
          event.preventDefault()
        }}
      >
        <Text>TARGET</Text>
      </Box>,
      term,
      { mouse: true } as never,
    )
    await settle()

    await term.mouse.click(2, 0)
    await term.mouse.click(2, 0, { button: 2 })
    await settle()

    expect(clicks, "only the primary button should dispatch click").toBe(1)
    expect(contextButtons).toEqual([2])

    handle.unmount()
  })
})
