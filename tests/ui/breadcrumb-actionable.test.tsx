import React from "react"
import { describe, expect, test, vi } from "vitest"
import { createRenderer } from "@silvery/test"
import { Breadcrumb } from "@silvery/ag-react"

describe("Breadcrumb actionability", () => {
  test("renders actionable segments as hyperlinks and activates them by mouse", async () => {
    const onPress = vi.fn()
    const render = createRenderer({ cols: 48, rows: 4 })
    const app = render(
      <Breadcrumb items={[{ label: "Home", href: "app://home", onPress }, { label: "Docs" }]} />,
    )

    const row = app.lines.findIndex((line) => line.includes("Home"))
    const column = app.lines[row]?.indexOf("Home") ?? -1
    expect(row).toBeGreaterThanOrEqual(0)
    expect(column).toBeGreaterThanOrEqual(0)
    expect(app.cell(column, row).hyperlink).toBe("app://home")

    await app.click(column, row)
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  test("puts actionable segments in the focus order and activates them with Enter", async () => {
    const onPress = vi.fn()
    const render = createRenderer({ cols: 48, rows: 4 })
    const app = render(<Breadcrumb items={[{ label: "Home", onPress }, { label: "Current" }]} />)

    await app.press("Tab")
    await app.press("Enter")

    expect(onPress).toHaveBeenCalledTimes(1)
  })
})
