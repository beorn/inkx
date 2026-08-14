import { describe, expect, it } from "vitest"
import type { AgNode, Cell, Rect } from "@silvery/ag/types"
import type { CellBuffer } from "@silvery/ag/viewport-types"
import { TerminalBuffer, type CellPatch, type Color } from "../src/buffer"
import type { RenderSink } from "../src/pipeline/render-sink"
import { renderIsland, renderViewport } from "../src/pipeline/render-viewport"

type Write = {
  readonly x: number
  readonly y: number
  readonly cell: CellPatch
  readonly selectable: boolean | undefined
}

function cell(char: string): Cell {
  return {
    char,
    fg: null,
    bg: null,
    attrs: {},
    wide: false,
    continuation: false,
  }
}

function sourceBuffer(rows: readonly (readonly string[])[]): CellBuffer {
  return {
    cols: Math.max(0, ...rows.map((row) => row.length)),
    rows: rows.length,
    getCell(col, row) {
      return cell(rows[row]?.[col] ?? " ")
    },
  }
}

function recordingSink(width: number, height: number): { sink: RenderSink; writes: Write[] } {
  const writes: Write[] = []
  const sink = {
    width,
    height,
    emitSetCell(x: number, y: number, cell: CellPatch, selectable?: boolean) {
      writes.push({ x, y, cell, selectable })
    },
  } as unknown as RenderSink
  return { sink, writes }
}

function renderBuffer(width = 10, height = 6): TerminalBuffer {
  return new TerminalBuffer(width, height)
}

function rect(x: number, y: number, width: number, height: number): Rect {
  return { x, y, width, height }
}

function writeAt(writes: readonly Write[], x: number, y: number): Write {
  const write = writes.find((candidate) => candidate.x === x && candidate.y === y)
  if (!write) throw new Error(`missing write at ${x},${y}`)
  return write
}

describe("renderViewport", () => {
  it("paints blank cells across the whole opaque layout rect when the source is smaller", () => {
    const { sink, writes } = recordingSink(10, 6)

    renderViewport(
      { viewportState: { buffer: sourceBuffer([["A"]]) } } as unknown as AgNode,
      renderBuffer(),
      sink,
      rect(2, 1, 3, 2),
      0,
    )

    expect(writes).toHaveLength(6)
    expect(writeAt(writes, 2, 1).cell.char).toBe("A")
    expect(writeAt(writes, 3, 1).cell.char).toBe(" ")
    expect(writeAt(writes, 4, 2).cell.char).toBe(" ")
  })
})

describe("renderIsland", () => {
  it("carries guest hyperlinks and explicitly clears an unset guest hyperlink", () => {
    const { sink, writes } = recordingSink(10, 6)
    const href = "https://example.com"
    const linkedCell: Cell = { ...cell("L"), hyperlink: href }
    const unlinkedCell = cell("U")
    const source: CellBuffer = {
      cols: 2,
      rows: 1,
      getCell(col) {
        return col === 0 ? linkedCell : unlinkedCell
      },
    }

    renderIsland(
      {
        islandState: {
          handle: {
            size: {
              cols: 2,
              rows: 1,
              subscribe: () => () => {},
              requestResize: () => {},
            },
            output: {
              buffer: source,
              cursor: null,
              cursorVisible: false,
              subscribe: () => () => {},
              writeCells: () => {},
              invalidateAll: () => {},
            },
            dispose: () => {},
          },
        },
      } as unknown as AgNode,
      renderBuffer(),
      sink,
      rect(1, 1, 2, 1),
      0,
    )

    expect(writeAt(writes, 1, 1).cell.hyperlink).toBe(href)
    // Empty string is the non-nullish clear sentinel used by the terminal
    // buffer. An omitted/undefined value can inherit an ancestor hyperlink.
    expect(writeAt(writes, 2, 1).cell.hyperlink).toBe("")
  })

  it("paints a pending island as an inherited-background opaque blank rect", () => {
    const { sink, writes } = recordingSink(10, 6)
    const inheritedBg: Color = 7

    renderIsland(
      { islandState: { handle: null } } as unknown as AgNode,
      renderBuffer(),
      sink,
      rect(1, 1, 2, 2),
      0,
      inheritedBg,
      true,
    )

    expect(writes).toHaveLength(4)
    expect(writes.map((write) => write.cell)).toEqual([
      expect.objectContaining({ char: " ", bg: inheritedBg }),
      expect.objectContaining({ char: " ", bg: inheritedBg }),
      expect.objectContaining({ char: " ", bg: inheritedBg }),
      expect.objectContaining({ char: " ", bg: inheritedBg }),
    ])
    expect(writes.every((write) => write.selectable === true)).toBe(true)
  })
})
