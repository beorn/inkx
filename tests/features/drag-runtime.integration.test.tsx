/**
 * Production drag-and-drop wiring through run() + real SGR mouse input.
 *
 * The DragFeature unit tests prove the service in isolation. This file pins
 * the public composition boundary: mouse-enabled run() installs the drag
 * capability, a draggable ancestor wins over text selection, React observes
 * live drag state, and the target receives enter/over/drop callbacks.
 */

import React from "react"
import { describe, expect, test, vi } from "vitest"
import { createTermless } from "@silvery/test"
import "@termless/test/matchers"
import { Box, Text, useDragState } from "../../src/index.js"
import { run } from "../../packages/ag-term/src/runtime/run"

const settle = (ms = 100) => new Promise((resolve) => setTimeout(resolve, ms))

function DragStatus() {
  const drag = useDragState()
  const label =
    drag === undefined
      ? "drag:missing"
      : drag === null
        ? "drag:idle"
        : `drag:${drag.currentPos.x},${drag.currentPos.y}`

  return <Text>{label}</Text>
}

describe("run() drag-and-drop capability", () => {
  test("does not install the capability when mouse tracking is disabled", async () => {
    using term = createTermless({ cols: 20, rows: 2 })
    const handle = await run(<DragStatus />, term, { mouse: false })
    await settle()

    expect(term.screen).toContainText("drag:missing")

    handle.unmount()
  })

  test("drags a content-bearing Box onto a target without starting text selection", async () => {
    const onDragEnter = vi.fn()
    const onDragOver = vi.fn()
    const onDrop = vi.fn()
    const onClick = vi.fn()

    using term = createTermless({ cols: 40, rows: 5 })
    const handle = await run(
      <Box width={40} height={5} flexDirection="column">
        <DragStatus />
        <Box flexDirection="row" height={2}>
          <Box width={10} height={2} draggable onClick={onClick}>
            <Text>SOURCE</Text>
          </Box>
          <Box
            width={10}
            height={2}
            onDragEnter={onDragEnter}
            onDragOver={onDragOver}
            onDrop={onDrop}
          >
            <Text>TARGET</Text>
          </Box>
        </Box>
      </Box>,
      term,
      { mouse: true },
    )
    await settle()

    expect(term.screen).toContainText("drag:idle")
    term.clipboard.clear()

    // Pointer-down lands on the Text child. The draggable Box ancestor is
    // still the source, matching ordinary card/list-row composition.
    await term.mouse.down(2, 1)
    await term.mouse.move(12, 1)
    await settle()

    expect(term.screen).toContainText("drag:12,1")
    expect(onDragEnter).toHaveBeenCalledTimes(1)

    await term.mouse.move(15, 1)
    await settle()

    // useSyncExternalStore requires a fresh snapshot per move. This is the
    // observer contract a cursor-following ghost will consume.
    expect(term.screen).toContainText("drag:15,1")

    await term.mouse.up(15, 1)
    await settle()

    expect(onDragOver).toHaveBeenCalledTimes(1)
    expect(onDrop).toHaveBeenCalledTimes(1)
    expect(onDrop).toHaveBeenCalledWith(
      expect.objectContaining({
        source: expect.objectContaining({ props: expect.objectContaining({ draggable: true }) }),
        dropTarget: expect.objectContaining({ props: expect.objectContaining({ onDrop }) }),
        position: { x: 15, y: 1 },
      }),
    )
    expect(onClick).not.toHaveBeenCalled()
    expect(term.clipboard.last).toBeNull()
    expect(term.screen).toContainText("drag:idle")

    onDrop.mockClear()
    await term.mouse.down(2, 1)
    await term.mouse.move(12, 1)
    await settle()
    await handle.press("Escape")
    await settle()

    expect(term.screen).toContainText("drag:idle")
    await term.mouse.up(12, 1)
    await settle()

    // After cancellation, the eventual physical release must stay inert — it
    // cannot turn the original mousedown into a delayed click or drop.
    expect(onDrop).not.toHaveBeenCalled()
    expect(onClick).not.toHaveBeenCalled()

    await term.mouse.click(2, 1)
    await settle()

    // Owning the pointer sequence must not consume an ordinary click that
    // never crosses the drag threshold.
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(term.screen).toContainText("drag:idle")

    handle.unmount()
  })
})
