/**
 * REPRO (failing) — @km/silvery/19702 / unfocused-cursor #undead (2026-06-18).
 *
 * User screenshot: @agent/8's UNFOCUSED silvercode pane shows a white BLOCK
 * cursor above the composer. Two roots:
 *   1. windowFocused initializes TRUE (with-terminal-chain `focused ?? true`); a
 *      freshly-spawned, never-focused multiplexed pane gets no focusOut, so it
 *      renders the FILLED block (the screenshot).
 *   2. Even when correctly unfocused, 20082 renders a HOLLOW box. The user's
 *      CURRENT contract is stronger: an unfocused agent pane must HIDE the
 *      cursor COMPLETELY.
 *
 * This pins the stronger contract: windowFocused=false ⇒ NO composited caret.
 * RED today — composeManagedCaret/computeManagedFrame paint a hollow box.
 */

import { describe, expect, test } from "vitest"
import { TerminalBuffer } from "../../packages/ag-term/src/buffer"
import { composeManagedCaret, computeManagedFrame } from "../../packages/ag-term/src/managed-caret"
import type { CursorRect } from "@silvery/ag/layout-signals"
import type { AgNode, Rect } from "@silvery/ag/types"

const SMALL: Rect = { x: 0, y: 0, width: 30, height: 12 }

function focusedComposerAt(x: number, y: number): AgNode {
  const composer = {
    type: "silvery-box",
    props: { focused: true, cursorOffset: { col: 0, row: 0, visible: true } },
    children: [],
    parent: null,
    scrollRect: { x, y, width: 10, height: 1 },
    boxRect: { x, y, width: 10, height: 1 },
    interactiveState: { focused: true },
  } as unknown as AgNode
  const root = {
    type: "silvery-root",
    props: {},
    children: [composer],
    parent: null,
    scrollRect: SMALL,
    boxRect: SMALL,
  } as unknown as AgNode
  ;(composer as { parent: AgNode }).parent = root
  return root
}

describe("REPRO: unfocused window HIDES the caret completely (not hollow)", () => {
  test("composeManagedCaret: windowFocused=false ⇒ no composited caret", () => {
    const buffer = new TerminalBuffer(SMALL.width, SMALL.height)
    const cursor: CursorRect = { x: 3, y: 5, visible: true, shape: "block" } as CursorRect
    const frame = composeManagedCaret(buffer, cursor, false)
    expect(frame.compositorCaret, "unfocused agent pane must show NO caret").toBeNull()
  })

  test("computeManagedFrame: windowFocused=false ⇒ no composited caret + nothing painted", () => {
    const src = new TerminalBuffer(SMALL.width, SMALL.height)
    const frame = computeManagedFrame(src, focusedComposerAt(3, 5), "fullscreen", {
      windowFocused: false,
    })
    expect(frame.compositorCaret, "unfocused window → hidden caret").toBeNull()
    // No inverse/overline/underline overlay painted at the caret cell.
    const attrs = frame.presentationBuffer.getCell(3, 5).attrs
    expect(attrs.inverse ?? false).toBe(false)
    expect(attrs.overline ?? false).toBe(false)
    expect(attrs.underline ?? false).toBe(false)
  })

  test("FOCUSED still shows the filled block (unchanged)", () => {
    const src = new TerminalBuffer(SMALL.width, SMALL.height)
    const frame = computeManagedFrame(src, focusedComposerAt(3, 5), "fullscreen", {
      windowFocused: true,
    })
    expect(frame.compositorCaret?.style).toBe("block")
  })
})
