/**
 * ListView nav-mode wrapper layout parity.
 *
 * In nav mode, ListView wraps each rendered item in a clickable Box so
 * hover/click can drive the cursor. That wrapper must be layout-neutral:
 * an item row that right-aligns a cell via flexGrow must land the cell at
 * the same x with nav on and off. Previously the wrapper Box defaulted to
 * flexDirection="row" and shrink-wrapped its child, so flexGrow inside the
 * item had zero free space to distribute — right-aligned cells floated at
 * the end of the content instead of the container edge (the yrd queue
 * timeline "AGE column floats mid-row" bug, bead 21106).
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "../../src/index.js"
import { ListView } from "../../packages/ag-react/src/ui/components/ListView"

const ITEMS = [
  { id: "short", label: "a" },
  { id: "long", label: "a-much-longer-label-with-content" },
]

function FlexRowList({ nav }: { nav: boolean }) {
  return (
    <Box flexDirection="column" width={60}>
      <ListView
        items={ITEMS}
        nav={nav}
        getKey={(item) => item.id}
        estimateHeight={1}
        renderItem={(item) => (
          <Box height={1} flexDirection="row" minWidth={0}>
            <Box flexGrow={1} flexBasis={0} minWidth={0}>
              <Text wrap="truncate">{item.label}</Text>
            </Box>
            <Box flexShrink={0} id={`right-${item.id}`}>
              <Text>END</Text>
            </Box>
          </Box>
        )}
      />
    </Box>
  )
}

function endColumn(text: string, row: number): number {
  const line = text.split("\n")[row] ?? ""
  return line.indexOf("END")
}

describe("ListView nav wrapper layout parity", () => {
  test("right-aligned flexGrow cells land at the same x with nav on and off", async () => {
    const plain = createRenderer({ cols: 60, rows: 6 })
    const plainApp = plain(<FlexRowList nav={false} />)
    await plainApp.waitForLayoutStable()
    const plainShort = endColumn(plainApp.text, 0)
    const plainLong = endColumn(plainApp.text, 1)
    expect(plainShort).toBeGreaterThan(0)
    // Baseline: without nav both rows right-align END at the same column.
    expect(plainShort).toBe(plainLong)
    plainApp.unmount()

    const navRender = createRenderer({ cols: 60, rows: 6 })
    const navApp = navRender(<FlexRowList nav />)
    await navApp.waitForLayoutStable()
    const navShort = endColumn(navApp.text, 0)
    const navLong = endColumn(navApp.text, 1)
    // The nav wrapper must be layout-neutral: same x as the nav-less render,
    // and stable across short/long content rows.
    expect(navShort).toBe(plainShort)
    expect(navLong).toBe(plainLong)
    expect(navShort).toBe(navLong)
    navApp.unmount()
  })
})
