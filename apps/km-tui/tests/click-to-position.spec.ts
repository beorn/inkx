/**
 * Click-to-Position Tests
 *
 * Unit tests for the clickToCursorOffset utility that maps terminal (x,y)
 * to cursor offset within an edit field.
 *
 * The utility is not yet wired into handleMouse — see bead km-tui.click-to-cursor.
 * PTY-level mouse tests are in mouse.slow.spec.ts.
 */

import { describe, test, expect } from "vitest"
import { clickToCursorOffset } from "../src/board/click-to-cursor.ts"
import type { TermEditContext } from "@silvery/ag-react"

function mockEditCtx(text: string, wrapWidth = 80): TermEditContext {
  return { text, wrapWidth, selectionStart: text.length, selectionEnd: text.length } as TermEditContext
}

function mockIdNode(x: number, y: number, width = 80) {
  return { screenRect: { x, y, width, height: 1 } } as any
}

describe("clickToCursorOffset", () => {
  test("click at character position 5 returns offset 5", () => {
    const ctx = mockEditCtx("helloworld")
    const node = mockIdNode(2, 5)
    expect(clickToCursorOffset(9, 5, ctx, node)).toBe(5)
  })

  test("click at start of text returns offset 0", () => {
    const ctx = mockEditCtx("abcdef")
    const node = mockIdNode(2, 5)
    expect(clickToCursorOffset(4, 5, ctx, node)).toBe(0)
  })

  test("click past end clamps to text length", () => {
    const ctx = mockEditCtx("short")
    const node = mockIdNode(2, 5)
    expect(clickToCursorOffset(54, 5, ctx, node)).toBe(5)
  })

  test("click before prefix clamps to 0", () => {
    const ctx = mockEditCtx("hello")
    const node = mockIdNode(2, 5)
    expect(clickToCursorOffset(0, 5, ctx, node)).toBe(0)
  })

  test("returns current position when no screenRect", () => {
    const ctx = mockEditCtx("hello")
    ;(ctx as any).selectionStart = 3
    expect(clickToCursorOffset(10, 5, ctx, { screenRect: null } as any)).toBe(3)
  })

  test("wrapped lines: click on second row", () => {
    const ctx = mockEditCtx("abcdefghij", 5)
    const node = mockIdNode(2, 5)
    expect(clickToCursorOffset(6, 5, ctx, node)).toBe(2)
    expect(clickToCursorOffset(5, 6, ctx, node)).toBe(6)
  })
})
