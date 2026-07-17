/**
 * CONTRACT: `userSelect="contain"` clamps document-aware (plain) drags but is
 * DELIBERATELY bypassed by Shift+drag raw buffer selection.
 *
 * This pins the exact boundary that a yrd "queue watch selects the whole
 * screen" report turned out to hinge on. The existing selection-e2e suite only
 * proved that a PLAIN drag clamps to a contain ancestor; it never asserted the
 * other half of the documented contract — that Shift+drag is the raw override
 * that escapes contain (docs/guide/text-selection.md, "Shift+Drag Buffer
 * Selection", L171-186: «`userSelect="contain"` remains a hard boundary for
 * normal document-aware drags. Shift+drag is the deliberate override for
 * terminal-style selection.»).
 *
 * Without this test, a future reader who sees Shift+drag "escape" a pane could
 * "fix" it and silently break the documented raw-selection escape hatch. These
 * drive the REAL create-app drag state machine end-to-end (run() + termless).
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createTermless } from "@silvery/test"
import "@termless/test/matchers"
import { run } from "../../packages/ag-term/src/runtime/run"
import { Box, Text } from "../../src/index.js"

const settle = (ms = 250) => new Promise((r) => setTimeout(r, ms))

function TwoContainPanes() {
  return (
    <Box flexDirection="row" width={30} height={6}>
      <Box userSelect="contain" width={12} height={6} paddingX={1} flexDirection="column">
        <Text>LEFTAAAAA</Text>
        <Text>LEFTBBBBB</Text>
        <Text>LEFTCCCCC</Text>
        <Text>LEFTDDDDD</Text>
        <Text>LEFTEEEEE</Text>
      </Box>
      <Box userSelect="contain" width={12} height={6} paddingX={1} flexDirection="column">
        <Text>RIGHTAAAA</Text>
        <Text>RIGHTBBBB</Text>
        <Text>RIGHTCCCC</Text>
        <Text>RIGHTDDDD</Text>
        <Text>RIGHTEEEE</Text>
      </Box>
    </Box>
  )
}

describe("contain clamp vs Shift raw-override (documented contract)", () => {
  test("plain drag from a contain pane stays inside it", async () => {
    using term = createTermless({ cols: 30, rows: 8 })
    const handle = await run(<TwoContainPanes />, term, { selection: true, mouse: true } as any)
    await settle()
    expect(term.screen).toContainText("LEFTAAAAA")
    expect(term.screen).toContainText("RIGHTAAAA")
    term.clipboard.clear()

    // Anchor inside LEFT (col 2, row 1), drag deep into RIGHT (col 20, row 3).
    await term.mouse.drag({ from: [2, 1], to: [20, 3] })
    await settle(200)

    const clip = term.clipboard.last
    expect(clip, "a plain drag must copy SOMETHING").not.toBeNull()
    expect(clip, "document-aware drag is clamped to the anchor's contain scope").not.toMatch(
      /RIGHT/,
    )

    handle.unmount()
  })

  test("Shift+drag is the documented raw override — it escapes contain", async () => {
    using term = createTermless({ cols: 30, rows: 8 })
    const handle = await run(<TwoContainPanes />, term, { selection: true, mouse: true } as any)
    await settle()
    term.clipboard.clear()

    // SAME gesture, Shift held → forceBufferSelection → scope bypassed by design.
    await term.mouse.drag({ from: [2, 1], to: [20, 3], options: { shift: true } })
    await settle(200)

    const clip = term.clipboard.last
    expect(clip, "Shift+drag must copy SOMETHING").not.toBeNull()
    expect(clip, "Shift+drag deliberately bypasses contain (raw buffer selection)").toMatch(/RIGHT/)

    handle.unmount()
  })

  test("nested contain: a plain drag clamps to the INNERMOST anchor scope", async () => {
    function Nested() {
      return (
        <Box flexDirection="row" width={30} height={8}>
          <Box userSelect="contain" width={16} height={8} paddingX={1} flexDirection="column">
            <Text>OUTERTOP</Text>
            <Box userSelect="contain" width={12} height={3} flexDirection="column">
              <Text>INNER1</Text>
              <Text>INNER2</Text>
            </Box>
            <Text>OUTERBOTTOMROW</Text>
          </Box>
          <Box userSelect="contain" width={12} height={8} flexDirection="column">
            <Text>RIGHTZONE</Text>
          </Box>
        </Box>
      )
    }
    using term = createTermless({ cols: 30, rows: 10 })
    const handle = await run(<Nested />, term, { selection: true, mouse: true } as any)
    await settle()
    expect(term.screen).toContainText("INNER1")
    expect(term.screen).toContainText("OUTERBOTTOM")
    term.clipboard.clear()

    // Anchor on INNER1, drag down+right past the inner box: clamps to INNER.
    await term.mouse.drag({ from: [2, 1], to: [20, 4] })
    await settle(200)

    const clip = term.clipboard.last
    expect(clip, "a nested drag must copy SOMETHING").not.toBeNull()
    expect(clip, "nested drag clamps to the innermost contain — no OUTER").not.toMatch(/OUTER/)
    expect(clip, "nested drag clamps to the innermost contain — no RIGHT").not.toMatch(/RIGHT/)

    handle.unmount()
  })
})
