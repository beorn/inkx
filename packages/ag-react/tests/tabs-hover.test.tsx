/**
 * Tabs hover state — inactive tabs get selected text color on mouse-enter.
 *
 * Verifies:
 * 1. Hovering a non-active tab changes its text color without a filled bg
 * 2. Clicking a tab activates it (existing behavior still works)
 * 3. Active tab's selected styling is text-only, not link-like or filled
 * 4. Mouse leave restores inactive text color
 */

import React from "react"
import { describe, test, expect, vi } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "../src/index.js"
import { Tabs, TabList, Tab, TabPanel } from "../src/ui/components/Tabs"

// ============================================================================
// Test fixtures
// ============================================================================

function TestTabs({
  defaultValue = "one",
  onChange,
}: {
  defaultValue?: string
  onChange?: (v: string) => void
}) {
  return (
    <Box flexDirection="column" width={40}>
      <Tabs defaultValue={defaultValue} onChange={onChange}>
        <TabList>
          <Tab value="one">Tab One</Tab>
          <Tab value="two">Tab Two</Tab>
          <Tab value="three">Tab Three</Tab>
        </TabList>
        <TabPanel value="one">
          <Text>Panel One</Text>
        </TabPanel>
        <TabPanel value="two">
          <Text>Panel Two</Text>
        </TabPanel>
        <TabPanel value="three">
          <Text>Panel Three</Text>
        </TabPanel>
      </Tabs>
    </Box>
  )
}

// ============================================================================
// 1. Hovering a non-active tab changes text color
// ============================================================================

describe("Tabs hover state: non-active tab changes text color", () => {
  test("hovering inactive tab changes text color without adding bg", async () => {
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(<TestTabs defaultValue="one" />)

    // "Tab Two" is inactive — find its column position
    const col = app.text.indexOf("Tab Two")
    expect(col).toBeGreaterThanOrEqual(0)

    const cellBefore = app.cell(col, 0)
    const fgBefore = cellBefore.fg
    expect(cellBefore.bg).toBeNull()

    // Hover over "Tab Two"
    await app.hover(col, 0)

    const cellAfter = app.cell(col, 0)
    expect(cellAfter.bg).toBeNull()
    expect(cellAfter.fg).not.toStrictEqual(fgBefore)
  })

  test("mouse leave restores inactive tab text color", async () => {
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(
      <Box flexDirection="column" width={40}>
        <Tabs defaultValue="one">
          <TabList>
            <Tab value="one">One</Tab>
            <Tab value="two">Two</Tab>
          </TabList>
          <TabPanel value="one">
            <Text>Panel content</Text>
          </TabPanel>
          <TabPanel value="two">
            <Text>Other panel</Text>
          </TabPanel>
        </Tabs>
      </Box>,
    )

    const twoCol = app.text.indexOf("Two")
    // Hover over "Two" (inactive tab)
    await app.hover(twoCol, 0)
    const fgHovered = app.cell(twoCol, 0).fg

    // Move to panel area (row 1) to trigger leave
    await app.hover(0, 1)
    const cellAfterLeave = app.cell(twoCol, 0)
    expect(cellAfterLeave.bg).toBeNull()
    expect(cellAfterLeave.fg).not.toStrictEqual(fgHovered)
  })
})

// ============================================================================
// 2. Clicking a tab activates it (existing behavior)
// ============================================================================

describe("Tabs hover state: click still activates tab", () => {
  test("clicking inactive tab activates it", async () => {
    const onChange = vi.fn()
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(<TestTabs defaultValue="one" onChange={onChange} />)

    // Initially "Panel One" visible
    expect(app.text).toContain("Panel One")

    // Click on "Tab Two"
    const col = app.text.indexOf("Tab Two")
    await app.click(col, 0)

    // "Panel Two" should now be visible
    expect(app.text).toContain("Panel Two")
    expect(onChange).toHaveBeenCalledWith("two")
  })

  test("clicking already-active tab does not error", async () => {
    const onChange = vi.fn()
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(<TestTabs defaultValue="one" onChange={onChange} />)

    const col = app.text.indexOf("Tab One")
    await app.click(col, 0)

    // Still showing Panel One
    expect(app.text).toContain("Panel One")
  })
})

// ============================================================================
// 3. Active tab hover is distinct — no filled bg styling
// ============================================================================

describe("Tabs hover state: active tab has no hover bg override", () => {
  test("hovering the active tab does not change its bg (active styling takes precedence)", async () => {
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(<TestTabs defaultValue="one" />)

    // "Tab One" is already active — get its bg before hover
    const col = app.text.indexOf("Tab One")
    const bgBefore = app.cell(col, 0).bg

    // Hover over it
    await app.hover(col, 0)
    const bgAfter = app.cell(col, 0).bg

    // Active tab should keep the same text-only selected styling.
    expect(bgAfter).toEqual(bgBefore)
  })

  test("active tab has different visual state from hovered inactive tab", async () => {
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(<TestTabs defaultValue="one" />)

    // Get active tab ("Tab One") cell — selected via text, not background.
    const activeCol = app.text.indexOf("Tab One")
    const activeCell = app.cell(activeCol, 0)

    // Get inactive tab ("Tab Two") — should use ordinary bold text and no selected bg.
    const inactiveCol = app.text.indexOf("Tab Two")
    const inactiveCell = app.cell(inactiveCol, 0)

    expect(activeCell.bold).toBe(true)
    expect(activeCell.bg).toBeNull()
    expect(activeCell.underline).toBe(false)
    expect(activeCell.fg).not.toStrictEqual(inactiveCell.fg)
    expect(inactiveCell.bold).toBe(true)
    expect(inactiveCell.bg).toBeNull()
  })
})
