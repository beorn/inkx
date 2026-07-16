/**
 * @failure A run({ mouse: true }) app drops in-app text selection: mouse-drag
 * over rendered text does not paint a selection or copy it via OSC 52, so any
 * consumer that enables mouse tracking (yrd queue watch) silently loses text
 * selectability the moment it turns the mouse on.
 * @level l2
 * @consumer @yrd/core/21096-cli-ux/queue-watch-textsel
 * @reach every silvery app that passes `mouse: true` (or a mouse parse config)
 * to run(); selection defaults on with mouse, so this is the shipped path.
 *
 * These are the missing end-to-end tests for the mouse-drag → selection →
 * OSC 52 clipboard path. Every prior test exercised either the pure headless
 * selection machine or ListView click/hover nav — none drove a real drag
 * through a mounted run() app and asserted the clipboard write, and none
 * pinned the `userSelect` gate that governs which regions are selectable.
 *
 * yrd `queue watch` mounts run(el, term, { mode: "fullscreen", mouse: true }).
 * `selectionEnabled = selectionOption ?? mouseTrackingEnabled`, so selection is
 * ON without an explicit `selection: true`. This suite locks that in and
 * documents the `userSelect="text"` override a consumer uses to re-enable
 * selection inside an interactive (`userSelect="none"`) subtree.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createTermless } from "@silvery/test"
import { run } from "@silvery/ag-term/runtime"
import { Box } from "../src/components/Box"
import { Text } from "../src/components/Text"
import { ListView } from "../src/ui/components/ListView"

const SELECTABLE = "HELLO_SELECTABLE_WORLD"

/** Let the mounted app paint and the input/selection effects flush. */
async function settle(ms = 30): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Drag left→right across the first rendered row and return the OSC 52 payload
 * captured on mouse-up (or null when nothing was copied — i.e. the region was
 * not selectable). Coordinates are 0-indexed cells.
 */
async function dragRowZeroAndReadClipboard(
  term: ReturnType<typeof createTermless>,
  lastCol: number,
): Promise<string | null> {
  term.clipboard.clear()
  await term.mouse.drag({ from: [0, 0], to: [lastCol, 0] })
  await settle()
  return term.clipboard.last
}

describe("run({ mouse: true }) — in-app text selection copies via OSC 52", () => {
  test("dragging across plain <Text> selects it and writes OSC 52", async () => {
    using term = createTermless({ cols: 40, rows: 6 })
    using _handle = await run(
      <Box>
        <Text>{SELECTABLE}</Text>
      </Box>,
      term,
      { mouse: true },
    )
    await settle()

    const copied = await dragRowZeroAndReadClipboard(term, SELECTABLE.length - 1)
    expect(copied).toContain(SELECTABLE)
  })

  test("selection is ON by default when mouse is enabled (no explicit selection: true)", async () => {
    using term = createTermless({ cols: 40, rows: 6 })
    // Deliberately omit `selection` — mirrors yrd WATCH_LIVE_RENDER_OPTIONS.
    using _handle = await run(<Text>{SELECTABLE}</Text>, term, { mouse: true })
    await settle()

    const copied = await dragRowZeroAndReadClipboard(term, SELECTABLE.length - 1)
    expect(copied).toContain(SELECTABLE)
  })

  test("text rendered inside a ListView row is selectable (watch-UI parity)", async () => {
    using term = createTermless({ cols: 40, rows: 10 })
    using _handle = await run(
      <ListView
        items={[SELECTABLE, "row-two", "row-three"]}
        height={5}
        renderItem={(item: string) => <Text>{item}</Text>}
      />,
      term,
      { mouse: true },
    )
    await settle()

    const copied = await dragRowZeroAndReadClipboard(term, SELECTABLE.length - 1)
    expect(copied).toContain(SELECTABLE)
  })
})

describe("userSelect gate governs which regions arm a selection drag", () => {
  test("userSelect='none' subtree does NOT select or copy on drag", async () => {
    using term = createTermless({ cols: 40, rows: 6 })
    using _handle = await run(
      <Box userSelect="none">
        <Text>{SELECTABLE}</Text>
      </Box>,
      term,
      { mouse: true },
    )
    await settle()

    const copied = await dragRowZeroAndReadClipboard(term, SELECTABLE.length - 1)
    expect(copied).toBeNull()
  })

  // KNOWN LIMITATION (executably pinned): a nested `userSelect="text"` child
  // should re-enable selection inside a `userSelect="none"` ancestor — the
  // render layer already stamps the child cells selectable
  // (render-phase.ts: `userSelect="text"|"contain"` sets selectableMode back
  // to true), matching the DOM/CSS rule that a child `user-select: text`
  // overrides a parent `user-select: none`. But the POINTER hit-test
  // (`selectionHitTestInner` in mouse-events.ts) bails at the first `none`
  // ancestor and never descends to the re-enabling child, so no drag is armed.
  //
  // `test.fails` asserts the CURRENT (buggy) behavior: the body's
  // `toContain` throws because nothing is copied. When the hit-test is fixed to
  // honor nested overrides, this test will start PASSING, which makes
  // `test.fails` FAIL — the signal to drop `.fails` and promote it to a normal
  // assertion. Design note + z-order subtleties:
  // docs/design/userselect-pointer-render-consistency.md.
  test.fails(
    "[known limitation] nested userSelect='text' does NOT yet re-arm inside a 'none' ancestor",
    async () => {
      using term = createTermless({ cols: 40, rows: 6 })
      using _handle = await run(
        <Box userSelect="none">
          <Box userSelect="text">
            <Text>{SELECTABLE}</Text>
          </Box>
        </Box>,
        term,
        { mouse: true },
      )
      await settle()

      const copied = await dragRowZeroAndReadClipboard(term, SELECTABLE.length - 1)
      expect(copied).toContain(SELECTABLE)
    },
  )
})
