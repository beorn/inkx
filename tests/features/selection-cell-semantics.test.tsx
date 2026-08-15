import React from "react"
import { describe, expect, test } from "vitest"
import { Box, Text } from "@silvery/ag-react"
import { createRenderer, formatSelectableCells, readCellRow } from "@silvery/test"

describe("selection cell semantics", () => {
  test("nested virtual userSelect=none excludes only that text span", () => {
    const render = createRenderer({ cols: 12, rows: 2 })
    const app = render(
      <Text>
        A<Text userSelect="none">NO</Text>B
      </Text>,
    )
    const buffer = app.lastBuffer()
    if (!buffer) throw new Error("expected render buffer")

    expect(
      readCellRow(buffer, 0)
        .slice(0, 4)
        .map((cell) => cell.selectable),
    ).toEqual([true, false, false, true])
    expect(formatSelectableCells(buffer)).toMatchInlineSnapshot(`
      "AnoB........"
    `)

    app.rerender(
      <Text>
        A<Text userSelect="text">NO</Text>B
      </Text>,
    )
    expect(
      readCellRow(app.lastBuffer()!, 0)
        .slice(0, 4)
        .map((cell) => cell.selectable),
    ).toEqual([true, true, true, true])

    app.rerender(
      <Text>
        A<Text userSelect="none">NO</Text>B
      </Text>,
    )
    expect(
      readCellRow(app.lastBuffer()!, 0)
        .slice(0, 4)
        .map((cell) => cell.selectable),
    ).toEqual([true, false, false, true])
  })

  test("table-driven invariant: text-origin cells selectable, structural cells not selectable", () => {
    const render = createRenderer({ cols: 24, rows: 6 })
    const app = render(
      <Box width={24} height={6} flexDirection="column" backgroundColor="blue">
        <Text>Alpha Beta</Text>
        <Box height={1} />
        <Box userSelect="none" height={1}>
          <Text>NoCopy</Text>
        </Box>
        <Box height={1}>
          <Text>Wide 漢 Tail</Text>
        </Box>
        <Text>{"   "}</Text>
      </Box>,
    )
    const buffer = app.lastBuffer()
    if (!buffer) throw new Error("expected render buffer")

    const cases = [
      { row: 0, selectable: "Alpha Beta", structuralStart: 10 },
      { row: 1, selectable: "", structuralStart: 0 },
      { row: 2, selectable: "", structuralStart: 0 },
      { row: 3, selectable: "Wide 漢 Tail", structuralStart: 12 },
      { row: 4, selectable: "", structuralStart: 0 },
    ] as const

    for (const c of cases) {
      const row = readCellRow(buffer, c.row)
      for (let x = 0; x < c.selectable.length; x++) {
        expect(row[x]?.selectable, `row ${c.row} col ${x} should be selectable`).toBe(true)
      }
      for (let x = c.structuralStart; x < row.length; x++) {
        expect(row[x]?.selectable, `row ${c.row} col ${x} should be structural`).toBe(false)
      }
    }

    expect(formatSelectableCells(buffer)).toMatchInlineSnapshot(`
      "Alpha_Beta..............
      ........................
      nocopy..................
      Wide_漢^_Tail............
      ........................
      ........................"
    `)
  })
})
