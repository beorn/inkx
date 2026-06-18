/**
 * TextArea onActivate — click-while-inactive request-focus hook.
 *
 * Clicking an INACTIVE TextArea (`isActive={false}`) fires `onActivate` so a
 * parent that owns activation imperatively (e.g. silvercode's queue/command
 * `focusedRegion`) can move focus on click — the single-focus-owner fix for the
 * queue/composer click-to-focus seam (@km/code/v0.2/20079). Clicking an ACTIVE
 * field must NOT fire it (the `!isActive` guard), so an already-focused field
 * never re-requests focus.
 */

import React from "react"
import { describe, test, expect, vi } from "vitest"
import { createTermless } from "@silvery/test"
import "@termless/test/matchers"
import { run } from "../../packages/ag-term/src/runtime/run"
import { Box } from "../../src/index.js"
import { TextArea } from "../../packages/ag-react/src/ui/components/TextArea"

const settle = (ms = 80) => new Promise((r) => setTimeout(r, ms))

describe("TextArea onActivate — click-while-inactive (20079)", () => {
  test("clicking an INACTIVE TextArea fires onActivate", async () => {
    const onActivate = vi.fn()
    const term = createTermless({ cols: 40, rows: 5 })
    const handle = await run(
      <Box width={40}>
        <TextArea
          value="hello world"
          isActive={false}
          showInactiveCursor={false}
          onActivate={onActivate}
        />
      </Box>,
      term,
      { mouse: true } as never,
    )
    try {
      await settle()
      await term.mouse.click(3, 0)
      await settle()
      expect(onActivate).toHaveBeenCalledTimes(1)
    } finally {
      handle.unmount()
    }
  })

  test("clicking an ACTIVE TextArea does NOT fire onActivate (the !isActive guard)", async () => {
    const onActivate = vi.fn()
    const term = createTermless({ cols: 40, rows: 5 })
    const handle = await run(
      <Box width={40}>
        <TextArea value="hello world" isActive={true} onActivate={onActivate} />
      </Box>,
      term,
      { mouse: true } as never,
    )
    try {
      await settle()
      await term.mouse.click(3, 0)
      await settle()
      expect(onActivate).not.toHaveBeenCalled()
    } finally {
      handle.unmount()
    }
  })
})
