import React from "react"
import { describe, expect, test, vi } from "vitest"
import { createRenderer } from "@silvery/test"
import { Breadcrumb, ChainAppContext, type ChainAppContextValue } from "@silvery/ag-react"

describe("Breadcrumb actionability", () => {
  test("renders actionable segments as hyperlinks and activates them by mouse", async () => {
    const onPress = vi.fn()
    const emit = vi.fn()
    const chain = {
      input: { register: () => () => {}, setActive: () => {} },
      paste: { register: () => () => {} },
      rawKeys: { register: () => () => {} },
      focusEvents: { register: () => () => {} },
      events: { on: () => () => {}, emit },
    } as ChainAppContextValue
    const render = createRenderer({ cols: 48, rows: 4 })
    const app = render(
      <ChainAppContext.Provider value={chain}>
        <Breadcrumb items={[{ label: "Home", href: "app://home", onPress }, { label: "Docs" }]} />
      </ChainAppContext.Provider>,
    )

    const row = app.lines.findIndex((line) => line.includes("Home"))
    const column = app.lines[row]?.indexOf("Home") ?? -1
    expect(row).toBeGreaterThanOrEqual(0)
    expect(column).toBeGreaterThanOrEqual(0)
    expect(app.cell(column, row).hyperlink).toBe("app://home")

    await app.hover(column, row)
    await app.click(column, row)
    expect(onPress).toHaveBeenCalledTimes(1)
    expect(emit).not.toHaveBeenCalled()
  })

  test("puts actionable segments in the focus order and activates them with Enter", async () => {
    const onPress = vi.fn()
    const render = createRenderer({ cols: 48, rows: 4 })
    const app = render(<Breadcrumb items={[{ label: "Home", onPress }, { label: "Current" }]} />)

    await app.press("Tab")
    await app.press("Enter")

    expect(onPress).toHaveBeenCalledTimes(1)
  })

  test("stays one row tall when actionable path segments exceed the available width", () => {
    const render = createRenderer({ cols: 24, rows: 4 })
    const app = render(
      <Breadcrumb
        items={[
          { label: "a-very-long-segment", onPress: () => {} },
          { label: "another-long-segment", onPress: () => {} },
          { label: "current" },
        ]}
      />,
    )

    expect(app.lines[0]).not.toBe("")
    expect(app.lines.slice(1).every((line) => line.trim() === "")).toBe(true)
  })

  test("can render compact separators with their own visual weight", () => {
    const render = createRenderer({ cols: 32, rows: 2 })
    const app = render(
      <Breadcrumb
        items={[{ label: "repo" }, { label: "pm" }, { label: "status.md" }]}
        separatorSpacing="compact"
        separatorColor="$fg-disabled"
      />,
    )

    expect(app.lines[0]?.trim()).toBe("repo/pm/status.md")
    const slash = app.lines[0]?.indexOf("/") ?? -1
    expect(slash).toBeGreaterThan(0)
    expect(app.cell(slash, 0).fg).not.toEqual(app.cell(slash - 1, 0).fg)
  })
})
