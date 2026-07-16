/**
 * Shared disabled-state contract for TextInput and TextArea.
 *
 * Disabled text controls use Sterling's semantic disabled tokens and reject
 * keyboard/mouse interaction while preserving their rendered value.
 */

import React from "react"
import { describe, expect, test, vi } from "vitest"
import { createRenderer, createTermless } from "@silvery/test"
import "@termless/test/matchers"
import { run } from "../../packages/ag-term/src/runtime/run"
import { Box } from "../../src/index.js"
import { TextArea } from "../../packages/ag-react/src/ui/components/TextArea"
import { TextInput } from "../../packages/ag-react/src/ui/components/TextInput"
import { resolveInputState } from "../../packages/ag-react/src/ui/components/_input-state"

const settle = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms))

describe("text-control disabled state", () => {
  test("shared resolver uses semantic disabled tokens and rejects interaction", () => {
    expect(
      resolveInputState({
        isActive: true,
        disabled: true,
        color: "$fg-accent",
        placeholderColor: "$fg-warning",
        borderColor: "$border-default",
        focusBorderColor: "$border-focus",
      }),
    ).toEqual({
      interactive: false,
      textColor: "$fg-disabled",
      placeholderColor: "$fg-disabled",
      borderColor: "$border-disabled",
    })
  })

  test("disabled TextInput ignores typed input and hides its cursor", async () => {
    const onChange = vi.fn()
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(
      <TextInput
        defaultValue="locked"
        disabled
        isActive
        onChange={onChange}
        borderStyle="single"
      />,
    )

    await app.type("x")

    expect(onChange).not.toHaveBeenCalled()
    expect(app.text).toContain("locked")
    expect(app.getCursorState()?.visible ?? false).toBe(false)
  })

  test("disabled TextArea ignores mouse activation", async () => {
    const onActivate = vi.fn()
    const term = createTermless({ cols: 40, rows: 5 })
    const handle = await run(
      <Box width={40}>
        <TextArea
          value="locked"
          disabled
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
      expect(onActivate).not.toHaveBeenCalled()
    } finally {
      handle.unmount()
    }
  })
})
