/**
 * The width-allocation gate for tables (@si/apportion-consolidation).
 *
 * Acceptance criterion, operator-ruled, both directions of the same invariant:
 * across a width sweep no column may sit on width it cannot use while a
 * sibling is squeezed below what it needs. Concretely:
 *
 *  1. CAP — no column holds more than its longest cell content (max-content)
 *     while a sibling wraps below its own.
 *  2. FLOOR — no column renders below its longest unbreakable word
 *     (min-content) while a sibling holds more than ITS min-content. The
 *     quadratic flexShrink allocation this bead replaces fails exactly here:
 *     shrink weight is basis², so a long prose column absorbs nearly the whole
 *     deficit and stacks a few characters per line while short columns yield
 *     almost nothing.
 *
 * Fixture mirrors the measured defect specimen (the pm-plan I19 table):
 * short id / medium label / long prose with max-content around 200 cells.
 */
import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { displayWidth } from "@silvery/ag-term/unicode"
import { Box } from "../src/components/Box"
import { Table, type Column } from "../src/components/Table"
import { Text } from "../src/components/Text"
import { Content } from "../src/ui/components/Content"

const HEADERS = ["Rung", "What lands", "Why"]
const ROWS: string[][] = [
  [
    "0 · shadow",
    "shadow folds land first because everything else reads through them",
    "state was written down rather than derived, so a stale copy could disagree with reality and nothing noticed; " +
      "a jammed seat read as stopped for twelve hours and the wrong diagnosis prescribed the wrong remedy",
  ],
  [
    "1 · services",
    "service supervision and the spawner-written source receipt",
    "services running four-day-old code while reporting healthy is the exact failure the receipt makes impossible, " +
      "because status is never written, only folded, and generation drift is an integer comparison",
  ],
  [
    "5 · habwire",
    "reply-is-the-close across two logs",
    "a broadcast with no delivery proof reached six seats, missed the seventh, and nothing anywhere said so; " +
      "completion is asserted by the consumer, never inferred by the producer",
  ],
]

/** Total horizontal cell chrome under the document presentation (padding = 2, no separators). */
const CELL_CHROME = 2

type ObserverProbeRow = {
  readonly label: string
  readonly detail: string
}

const OBSERVER_PROBE_ROWS: readonly ObserverProbeRow[] = [
  {
    label: "observer",
    detail:
      "committed geometry should reallocate width without following height-only layout changes",
  },
]

const OBSERVER_PROBE_COLUMNS: readonly Column<ObserverProbeRow>[] = [
  { header: "Label", key: "label", shrink: true },
  { header: "Detail", key: "detail", shrink: true },
]

function observedTable(
  width: number,
  height: number,
  onCommit: React.ProfilerProps["onRender"],
): React.ReactElement {
  return (
    <Box width={width} height={height} flexDirection="column">
      <React.Profiler id="table-commits" onRender={onCommit}>
        <Table data={OBSERVER_PROBE_ROWS} columns={OBSERVER_PROBE_COLUMNS} />
      </React.Profiler>
    </Box>
  )
}

const maxContent = (columnIndex: number): number =>
  Math.max(
    displayWidth(HEADERS[columnIndex]!),
    ...ROWS.map((row) => displayWidth(row[columnIndex]!)),
  )

const minContent = (columnIndex: number): number =>
  Math.max(
    ...HEADERS[columnIndex]!.split(" ").map(displayWidth),
    ...ROWS.flatMap((row) => row[columnIndex]!.split(" ").map(displayWidth)),
  )

function renderTable(cols: number) {
  const render = createRenderer({ cols, rows: 60 })
  return render(
    <Box width={cols} flexDirection="column">
      <Content.Layout fill={false} prose={80} wide={120}>
        <Content.Row>
          <Content.Body width="auto">
            <Content.Table headers={HEADERS} rows={ROWS} />
          </Content.Body>
        </Content.Row>
      </Content.Layout>
    </Box>,
  )
}

type App = ReturnType<ReturnType<typeof createRenderer>>

/** The track cell Box owning a rendered text: nearest ancestor with cell chrome. */
function cellWidth(app: App, text: string): number {
  let node = app.getByText(text).resolve()
  while (node) {
    const props = node.props as Record<string, unknown>
    if (props.overflow === "hidden" && props.paddingRight !== undefined) {
      if (node.boxRect === null)
        throw new Error(`cell for ${JSON.stringify(text)} has no computed box`)
      return node.boxRect.width
    }
    node = node.parent
  }
  throw new Error(`no cell ancestor for ${JSON.stringify(text)}`)
}

function textHeight(app: App, text: string): number {
  const node = app.getByText(text).resolve()
  if (node === null || node.boxRect === null)
    throw new Error(`no rendered box for ${JSON.stringify(text)}`)
  return node.boxRect.height
}

describe("table width allocation (@si/apportion-consolidation gate)", () => {
  test("realizes a feasible many-column allocation without grow tracks escaping their bands", () => {
    const bands = [
      [6, 6],
      [8, 12],
      [9, 9],
      [2, 4],
      [4, 4],
      [13, 13],
      [2, 25],
      [2, 25],
      [2, 25],
      [2, 5],
      [2, 23],
      [2, 12],
      [10, 80],
      [2, 7],
      [2, 32],
      [9, 9],
      [10, 11],
    ] as const
    const grow = [
      false,
      false,
      false,
      false,
      false,
      true,
      true,
      true,
      false,
      true,
      true,
      true,
      true,
      true,
      false,
      false,
      false,
    ]
    const values = bands.map(([, max], index) => String.fromCodePoint(0x41 + index).repeat(max))
    const row = Object.fromEntries(values.map((value, index) => [`c${index}`, value])) as Record<
      string,
      string
    >
    const columns: Column<Record<string, string>>[] = bands.map(([min, max], index) => ({
      header: `C${index}`,
      key: `c${index}`,
      minWidth: min,
      maxWidth: max,
      grow: grow[index],
      render: () => <Text>{values[index]!}</Text>,
    }))
    const render = createRenderer({ cols: 120, rows: 10 })
    const app = render(
      <Box width={120} flexDirection="column">
        <Table data={[row]} columns={columns} padding={0} />
      </Box>,
    )
    const widths = values.map((value) => cellWidth(app, value))

    expect(widths.reduce((total, width) => total + width, 0)).toBe(120)
    expect(
      widths.flatMap((width, index) => {
        const [min, max] = bands[index]!
        return width < min || width > max
          ? [`track ${index}: ${width} outside [${min},${max}]`]
          : []
      }),
    ).toEqual([])
  })

  test("FLOOR: no column below its min-content while a sibling holds more than its own min-content", () => {
    const violations: string[] = []
    for (let cols = 70; cols <= 160; cols += 10) {
      const app = renderTable(cols)
      const widths = HEADERS.map((header) => cellWidth(app, header))

      for (let i = 0; i < HEADERS.length; i++) {
        const starved = widths[i]! < minContent(i) + CELL_CHROME
        if (!starved) continue
        const donor = widths.some((w, j) => j !== i && w > minContent(j) + CELL_CHROME)
        if (donor) {
          violations.push(
            `cols=${cols}: column ${JSON.stringify(HEADERS[i])} at ${widths[i]} cells is below its ` +
              `min-content ${minContent(i) + CELL_CHROME} while a sibling holds spare width; ` +
              `column widths ${JSON.stringify(widths)}, ` +
              `min-contents ${JSON.stringify(HEADERS.map((_, j) => minContent(j) + CELL_CHROME))}`,
          )
        }
      }
    }
    expect(violations, `\n${violations.join("\n")}`).toEqual([])
  })

  test("CAP: no column holds beyond its max-content while a sibling wraps", () => {
    const violations: string[] = []
    for (let cols = 70; cols <= 160; cols += 10) {
      const app = renderTable(cols)
      const widths = HEADERS.map((header) => cellWidth(app, header))
      const anyWrapping = HEADERS.some((_, i) => ROWS.some((row) => textHeight(app, row[i]!) > 1))
      if (!anyWrapping) continue

      for (let i = 0; i < HEADERS.length; i++) {
        const allowed = maxContent(i) + CELL_CHROME
        if (widths[i]! > allowed) {
          violations.push(
            `cols=${cols}: column ${JSON.stringify(HEADERS[i])} holds ${widths[i]} cells for ` +
              `${maxContent(i)} chars of content (allowed ${allowed}) while a sibling wraps; ` +
              `column widths ${JSON.stringify(widths)}`,
          )
        }
      }
    }
    expect(violations, `\n${violations.join("\n")}`).toEqual([])
  })

  test("committed width changes reallocate once while height-only commits schedule no follow-up", async () => {
    let commits = 0
    const countCommit: React.ProfilerProps["onRender"] = () => {
      commits++
    }
    const render = createRenderer({ cols: 140, rows: 50, autoRender: true })
    const app = render(observedTable(100, 20, countCommit))
    await app.waitForLayoutStable()
    const wideDetail = cellWidth(app, "Detail")

    commits = 0
    app.rerender(observedTable(70, 20, countCommit))
    await app.waitForLayoutStable()
    const narrowDetail = cellWidth(app, "Detail")

    expect(narrowDetail).toBeLessThan(wideDetail)
    expect(commits, "one width allocation plus the bounded parent/child commit chain").toBe(3)

    commits = 0
    app.rerender(observedTable(70, 24, countCommit))
    await app.waitForLayoutStable()

    expect(commits, "height-only geometry must not wake the width-only table consumer").toBe(1)
  })
})
