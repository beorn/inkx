/**
 * ModalOverlay — click-outside dismiss (the shared modal-close primitive).
 *
 * Extracted from the hand-rolled backdrop+guard pattern several apps duplicated.
 * The backdrop's onClick closes; the inner guard stops propagation so an
 * empty-space click INSIDE the dialog body does not bubble out and close it.
 * Verified through the real mouse-dispatch pipeline (run() + term.mouse).
 */
import React from "react"
import { describe, test, expect } from "vitest"
import { createTermless } from "@silvery/test"
import "@termless/test/matchers"
import { run } from "../../packages/ag-term/src/runtime/run"
import { Box, Text, ModalOverlay } from "../../src/index.js"

const settle = (ms = 50) => new Promise((r) => setTimeout(r, ms))

function OverlayApp({ onClose }: { onClose: () => void }): React.ReactElement {
  return (
    <Box width={80} height={24}>
      <ModalOverlay onClose={onClose}>
        <Box width={24} height={6} borderStyle="round" alignItems="center" justifyContent="center">
          <Text>DIALOG BODY</Text>
        </Box>
      </ModalOverlay>
    </Box>
  )
}

describe("ModalOverlay — click-outside dismiss (@km/code/v0.2/19669)", () => {
  test("backdrop click closes; dialog-body click does not (stopPropagation guard)", async () => {
    let closes = 0
    using term = createTermless({ cols: 80, rows: 24 })
    const handle = await run(<OverlayApp onClose={() => (closes += 1)} />, term, {
      mouse: true,
    } as never)
    await settle()
    expect(term.screen).toContainText("DIALOG BODY")

    // Click the centered dialog body (24×6 centered in 80×24 → cols ~28..52,
    // rows ~9..15). The inner guard stops propagation → no close.
    await term.mouse.click(40, 12)
    await settle()
    expect(closes, "a click inside the dialog body must NOT close it").toBe(0)

    // Click the top-left corner — pure backdrop, outside the dialog body.
    await term.mouse.click(0, 0)
    await settle()
    expect(closes, "a backdrop click must close the modal").toBe(1)

    handle.unmount()
  })
})
