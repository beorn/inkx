/**
 * `overflow="scroll"` is an interaction contract, not clipping shorthand.
 *
 * Like browser overflow and React Native ScrollView, a bounded scroll
 * container must respond to wheel input without every caller rebuilding the
 * same `useKineticScroll` plumbing. Supplying `onWheel` is the explicit
 * override for virtualized/specialized owners such as ListView.
 */

import React from "react"
import { describe, expect, test, vi } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "../../src/index.js"

function rows(count: number): React.ReactElement {
  return (
    <Box flexDirection="column" height={count} flexShrink={0}>
      {Array.from({ length: count }, (_, index) => (
        <Text key={index}>row-{index}</Text>
      ))}
    </Box>
  )
}

describe("Box overflow=scroll default wheel behavior", () => {
  test("wheel input scrolls a plain overflow Box without caller plumbing", async () => {
    const render = createRenderer({ cols: 24, rows: 5 })
    const app = render(
      <Box testID="scroll-box" width={24} height={5} overflow="scroll">
        {rows(20)}
      </Box>,
    )

    expect(app.text).toContain("row-0")
    expect(app.text).not.toContain("row-19")
    expect(app.getByTestId("scroll-box").first().resolve()?.scrollState).toMatchObject({
      contentHeight: 20,
      viewportHeight: 5,
      offset: 0,
    })

    await app.wheel(4, 2, 20)

    expect(app.text).not.toContain("row-0")
    expect(app.text).toContain("row-19")
  })

  test("a caller onWheel handler is the explicit scroll-owner override", async () => {
    const onWheel = vi.fn()
    const render = createRenderer({ cols: 24, rows: 5 })
    const app = render(
      <Box width={24} height={5} overflow="scroll" onWheel={onWheel}>
        {rows(20)}
      </Box>,
    )

    await app.wheel(4, 2, 20)

    expect(onWheel).toHaveBeenCalledOnce()
    expect(app.text).toContain("row-0")
    expect(app.text).not.toContain("row-19")
  })

  test("a non-overflowing child leaves wheel input for its ancestor", async () => {
    const ancestorWheel = vi.fn()
    const render = createRenderer({ cols: 24, rows: 8 })
    const app = render(
      <Box width={24} height={8} onWheel={ancestorWheel}>
        <Box width={24} height={5} overflow="scroll">
          {rows(2)}
        </Box>
      </Box>,
    )

    await app.wheel(4, 2, 1)

    expect(ancestorWheel).toHaveBeenCalledOnce()
  })
})
