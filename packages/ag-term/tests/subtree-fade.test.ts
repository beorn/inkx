import { describe, expect, it } from "vitest"
import type { AgNode, Rect } from "@silvery/ag/types"
import { TerminalBuffer } from "../src/buffer"
import { applySubtreeFade, SUBTREE_FADE_ATTR } from "../src/pipeline/subtree-fade"

function rect(x: number, y: number, width: number, height: number): Rect {
  return { x, y, width, height }
}

function node(
  props: Record<string, unknown>,
  boxRect: Rect,
  children: readonly AgNode[] = [],
): AgNode {
  return {
    type: "silvery-box",
    props,
    boxRect,
    children,
  } as unknown as AgNode
}

describe("applySubtreeFade", () => {
  it("does not treat an absolute background wrapper around a faded subtree as a foreign overlay", () => {
    const buffer = new TerminalBuffer(4, 4)
    buffer.setCell(1, 1, {
      char: "X",
      fg: { r: 255, g: 255, b: 255 },
      bg: null,
      attrs: {},
      wide: false,
      continuation: false,
    })
    const root = node({}, rect(0, 0, 4, 4), [
      node({ position: "absolute", backgroundColor: "$bg-surface-default" }, rect(0, 0, 4, 4), [
        node({ [SUBTREE_FADE_ATTR]: 0.25 }, rect(1, 1, 1, 1)),
      ]),
    ])

    const modified = applySubtreeFade(root, buffer, {
      defaultBg: "#000000",
      defaultFg: "#ffffff",
      scrimColor: "#000000",
    })

    expect(modified).toBe(true)
    expect(buffer.getCell(1, 1).fg).not.toEqual({ r: 255, g: 255, b: 255 })
  })
})
