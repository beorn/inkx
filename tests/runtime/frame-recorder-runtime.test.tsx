/**
 * Frame-recorder runtime contract.
 *
 * @failure recordFrames(createTermless()) records zero frames because the
 *   live run() path writes through emulator.feed instead of Term.paint.
 * @level l2 — real runtime + xterm-backed Termless terminal.
 */

import React, { useState } from "react"
import { describe, expect, test } from "vitest"
import { createTermless, recordFrames } from "@silvery/test"
import { Text } from "../../src/index.js"
import { run } from "../../packages/ag-term/src/runtime/run"

describe("recordFrames runtime integration", () => {
  test("records a mounted runtime update written through the emulator", async () => {
    let update: ((value: number) => void) | undefined
    function Counter(): React.ReactElement {
      const [value, setValue] = useState(0)
      update = setValue
      return <Text>{`frame ${value}`}</Text>
    }

    using term = createTermless({ cols: 20, rows: 3 })
    const handle = await run(<Counter />, term)
    const recording = recordFrames(term)

    try {
      update?.(1)
      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(recording.frames.some((frame) => frame.containsText("frame 1"))).toBe(true)
    } finally {
      recording.stop()
      handle.unmount()
    }
  })
})
