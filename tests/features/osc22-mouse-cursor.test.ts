/**
 * OSC 22 Mouse Cursor Shape Tests
 *
 * Bead: km-silvery.osc-mouse
 *
 * Tests the escape sequence generation for OSC 22 mouse cursor shapes.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer, createTermless, waitFor } from "@silvery/test"
import { setMouseCursorShape, resetMouseCursorShape } from "@silvery/ag-term/output"
import { run } from "../../packages/ag-term/src/runtime/run"
import { Box, Tab, TabList, TabPanel, Tabs, Text } from "../../src/index.js"

describe("OSC 22 mouse cursor", () => {
  test("setMouseCursorShape generates correct sequence", () => {
    expect(setMouseCursorShape("default")).toBe("\x1b]22;default\x07")
    expect(setMouseCursorShape("text")).toBe("\x1b]22;text\x07")
    expect(setMouseCursorShape("pointer")).toBe("\x1b]22;pointer\x07")
    expect(setMouseCursorShape("crosshair")).toBe("\x1b]22;crosshair\x07")
    expect(setMouseCursorShape("move")).toBe("\x1b]22;move\x07")
    expect(setMouseCursorShape("not-allowed")).toBe("\x1b]22;not-allowed\x07")
    expect(setMouseCursorShape("wait")).toBe("\x1b]22;wait\x07")
    expect(setMouseCursorShape("help")).toBe("\x1b]22;help\x07")
    expect(setMouseCursorShape("grab")).toBe("\x1b]22;grab\x07")
    expect(setMouseCursorShape("grabbing")).toBe("\x1b]22;grabbing\x07")
    expect(setMouseCursorShape("col-resize")).toBe("\x1b]22;col-resize\x07")
    expect(setMouseCursorShape("row-resize")).toBe("\x1b]22;row-resize\x07")
    expect(setMouseCursorShape("ew-resize")).toBe("\x1b]22;ew-resize\x07")
    expect(setMouseCursorShape("ns-resize")).toBe("\x1b]22;ns-resize\x07")
  })

  test("resetMouseCursorShape generates default sequence", () => {
    expect(resetMouseCursorShape()).toBe("\x1b]22;default\x07")
  })

  test("setMouseCursorShape uses OSC format (ESC ] ... BEL)", () => {
    const seq = setMouseCursorShape("pointer")
    // Starts with ESC ]
    expect(seq.startsWith("\x1b]")).toBe(true)
    // Ends with BEL
    expect(seq.endsWith("\x07")).toBe(true)
    // Contains OSC 22
    expect(seq).toContain("22;")
  })

  test("contract: Tab renders a pointer cursor when mouseCursor is omitted", () => {
    const render = createRenderer({ cols: 24, rows: 6 })
    // children passed via props: React.createElement's typing only accepts a
    // required `children` prop inside the props object, not as variadic args.
    const app = render(
      React.createElement(Tabs, {
        defaultValue: "one",
        children: [
          React.createElement(TabList, {
            key: "list",
            children: [
              React.createElement(Tab, { key: "one", value: "one", children: "One" }),
              React.createElement(Tab, { key: "two", value: "two", children: "Two" }),
            ],
          }),
          React.createElement(TabPanel, {
            key: "panel",
            value: "one",
            children: React.createElement(Text, null, "Panel"),
          }),
        ],
      }),
    )
    const label = app.getByText("One").resolve()

    expect(label).not.toBeNull()
    expect(label!.parent?.props.mouseCursor).toBe("pointer")
  })

  test("contract: hovering a clickable Box with omitted mouseCursor emits pointer OSC 22", async () => {
    using term = createTermless({ cols: 24, rows: 6 })
    const tree = React.createElement(
      Box,
      { height: 1, onClick: () => undefined, width: 8 },
      React.createElement(Text, null, "Open"),
    )
    const handle = await run(tree, term, { mouse: true, selection: false })

    try {
      await waitFor(() => term.out.containsOutput("Open"))
      await term.mouse.move(1, 0)
      await waitFor(() => term.out.containsOutput("\x1b]22;pointer\x07"))

      expect(term.out.containsOutput("\x1b]22;pointer\x07")).toBe(true)
    } finally {
      handle.unmount()
    }
  })
})
