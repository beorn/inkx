/**
 * Table Component Tests
 *
 * Verifies the generic Table component: auto-sizing, fixed width, grow columns,
 * alignment, custom renderers, header visibility, empty data, and null handling.
 */

import { describe, test, expect, vi } from "vitest"
import { createRenderer } from "@silvery/test"
import { Text, Table, TreeTable } from "silvery"
import { Table as CanonicalTable } from "../../packages/ag-react/src/components/Table"
import { TreeTable as CanonicalTreeTable } from "../../packages/ag-react/src/ui/components/TreeTable"
import {
  Table as ComponentsTable,
  TreeTable as ComponentsTreeTable,
} from "../../packages/ag-react/src/ui/components"
import {
  Table as CanvasTable,
  TreeTable as CanvasTreeTable,
} from "../../packages/ag-react/src/ui/canvas"
import {
  Table as DisplayTable,
  TreeTable as DisplayTreeTable,
} from "../../packages/ag-react/src/ui/display"
import {
  TABLE_ANCHOR_ROWS,
  TABLE_ANCHOR_ROWS_WITH_NEW,
  TABLE_CURSOR_RESHUFFLED_ROWS,
  TABLE_CURSOR_ROWS,
  type TableInteractiveFixtureRow,
} from "../../examples/apps/storybook/shared/tableInteractiveFixtures"

const render = createRenderer({ cols: 80, rows: 20 })

// =============================================================================
// Test data
// =============================================================================

type Person = { name: string; age: number; city: string }

const people: readonly Person[] = [
  { name: "Alice", age: 30, city: "New York" },
  { name: "Bob", age: 25, city: "San Francisco" },
  { name: "Charlie", age: 35, city: "Chicago" },
]

const interactiveColumns = [
  { header: "RUN", key: "run", width: 8 },
  { header: "STATUS", key: "status", width: 12 },
  { header: "SUBJECT", key: "subject", grow: true },
] as const

async function settle(app: ReturnType<ReturnType<typeof createRenderer>>): Promise<void> {
  await app.waitForLayoutStable({ timeoutMs: 1000, maxPasses: 20 })
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
}

function expectCursorOn(app: ReturnType<ReturnType<typeof createRenderer>>, text: string): void {
  const rowIndex = app.lines.findIndex((line) => line.includes(text))
  expect(rowIndex, `${text} should be visible`).toBeGreaterThan(0)
  expect(app.cell(0, rowIndex).bg, `${text} should use the semantic cursor background`).not.toBe(
    null,
  )
  expect(app.cell(0, rowIndex).fg, `${text} should use the semantic cursor foreground`).not.toBe(
    null,
  )
}

// =============================================================================
// Tests
// =============================================================================

describe("Table", () => {
  test("all public barrels expose the canonical Table family", () => {
    expect(Table).toBe(CanonicalTable)
    expect(ComponentsTable).toBe(CanonicalTable)
    expect(CanvasTable).toBe(CanonicalTable)
    expect(DisplayTable).toBe(CanonicalTable)
    expect(TreeTable).toBe(CanonicalTreeTable)
    expect(ComponentsTreeTable).toBe(CanonicalTreeTable)
    expect(CanvasTreeTable).toBe(CanonicalTreeTable)
    expect(DisplayTreeTable).toBe(CanonicalTreeTable)
  })

  test("renders header row with column names", () => {
    const app = render(
      <Table
        columns={[
          { header: "Name", key: "name" },
          { header: "Age", key: "age" },
        ]}
        data={people}
      />,
    )
    expect(app.text).toContain("Name")
    expect(app.text).toContain("Age")
  })

  test("renders data rows with correct values", () => {
    const app = render(
      <Table
        columns={[
          { header: "Name", key: "name" },
          { header: "Age", key: "age" },
        ]}
        data={people}
      />,
    )
    expect(app.text).toContain("Alice")
    expect(app.text).toContain("30")
    expect(app.text).toContain("Bob")
    expect(app.text).toContain("25")
    expect(app.text).toContain("Charlie")
    expect(app.text).toContain("35")
  })

  test("auto-sizes columns based on data content", () => {
    const app = render(
      <Table
        columns={[
          { header: "Name", key: "name" },
          { header: "City", key: "city" },
        ]}
        data={people}
      />,
    )
    // With default padding=2, "Charlie" (7 chars) + 2 = 9 column width
    // "San Francisco" (13 chars) + 2 = 15 column width
    // Each row should have Name and City separated by space from fixed width boxes
    const lines = app.lines
    // Header line: "Name" in a 9-wide box, "City" in a 15-wide box
    // "Charlie" is the longest name (7), header "Name" is 4 — max is 7, +2 padding = 9
    // "San Francisco" is the longest city (13), header "City" is 4 — max is 13, +2 padding = 15
    expect(lines[0]).toMatch(/^Name/)
    expect(lines[0]).toMatch(/City/)
    // Verify that "Alice" and "New York" appear on the same line
    const aliceLine = lines.find((l) => l.includes("Alice"))
    expect(aliceLine).toBeDefined()
    expect(aliceLine).toContain("New York")
  })

  test("respects fixed width columns", () => {
    const app = render(
      <Table
        columns={[
          { header: "Name", key: "name", width: 20 },
          { header: "Age", key: "age" },
        ]}
        data={people}
      />,
    )
    const lines = app.lines
    // The header "Name" should be in a 20-wide box
    // So "Age" should start at column 20
    const headerLine = lines[0]!
    expect(headerLine).toMatch(/^Name/)
    // "Age" starts after the 20-char wide Name column
    const ageIndex = headerLine.indexOf("Age")
    expect(ageIndex).toBe(20)
  })

  test("grow column takes remaining space", () => {
    const app = render(
      <Table
        columns={[
          { header: "Name", key: "name" },
          { header: "Bio", key: "city", grow: true },
        ]}
        data={people}
      />,
    )
    // The grow column should expand to fill remaining space
    // With 80 cols, the Name column auto-sizes, the Bio column grows
    expect(app.text).toContain("Name")
    expect(app.text).toContain("Bio")
    expect(app.text).toContain("Alice")
    expect(app.text).toContain("New York")
  })

  test("right-aligned columns", () => {
    const app = render(
      <Table
        columns={[
          { header: "Name", key: "name", width: 15 },
          { header: "Age", key: "age", width: 10, align: "right" },
        ]}
        data={[{ name: "Alice", age: 30 }]}
      />,
    )
    const lines = app.lines
    // In the age column (width 10, right-aligned), "30" should be right-justified
    // The age column starts at position 15
    const dataLine = lines[1]!
    // "30" right-aligned in a 10-char box means it's at the end of the box
    const ageSection = dataLine.slice(15, 25)
    expect(ageSection.trimEnd()).toMatch(/\s+30$|30$/)
  })

  test("custom render function", () => {
    const app = render(
      <Table
        columns={[
          { header: "Name", key: "name" },
          {
            header: "Status",
            render: (item: Person) => (
              <Text color={item.age >= 30 ? "$fg-success" : "$fg-warning"}>
                {item.age >= 30 ? "senior" : "junior"}
              </Text>
            ),
          },
        ]}
        data={people}
      />,
    )
    expect(app.text).toContain("Alice")
    expect(app.text).toContain("senior")
    expect(app.text).toContain("Bob")
    expect(app.text).toContain("junior")
  })

  test("custom React cells stay one measured row so later rows remain visible", () => {
    const narrow = createRenderer({ cols: 24, rows: 8 })
    const app = narrow(
      <Table
        columns={[
          {
            header: "NAME",
            grow: true,
            render: (row: { name: string; state: string }) => <Text>{row.name}</Text>,
          },
          { header: "STATE", key: "state", width: 7 },
        ]}
        data={[
          { name: "root-with-long-name", state: "ONE1" },
          { name: "child-with-long-name", state: "TWO2" },
          { name: "deep-with-long-name", state: "THR3" },
        ]}
      />,
    )

    const rowIndexes = ["ONE1", "TWO2", "THR3"].map((state) =>
      app.lines.findIndex((line) => line.includes(state)),
    )
    expect(rowIndexes).toEqual([1, 2, 3])
    expect(app.lines[1]).toContain("root")
    expect(app.lines[2]).toContain("child")
    expect(app.lines[3]).toContain("deep")
  })

  test("uses a rendered column's key for shared intrinsic sizing", () => {
    const app = render(
      <Table
        columns={[
          {
            header: "STATE",
            key: "state",
            render: (item) => <Text color="$fg-success">{item.state}</Text>,
          },
          { header: "NEXT", key: "next" },
        ]}
        data={[{ state: "integrated", next: "visible" }]}
      />,
    )

    expect(app.lines[0]!.indexOf("NEXT")).toBe("integrated".length + 2)
  })

  test("uses intrinsic content as the basis for growing columns", () => {
    const narrow = createRenderer({ cols: 30, rows: 10 })
    const app = narrow(
      <Table
        columns={[
          { header: "A", key: "a", grow: true },
          { header: "B", key: "b", grow: true },
        ]}
        data={[{ a: "substantive", b: "x" }]}
      />,
    )

    expect(app.lines[0]!.indexOf("B")).toBeGreaterThan(15)
  })

  test("a grow column never squeezes fixed siblings below their content", () => {
    // The bossi `ls` regression: at 80 cols a long grow column (process args)
    // overflowed the container and flexbox shrank EVERY track proportionally,
    // crushing the fixed siblings to one-glyph stubs ("P…  S…  C…  …").
    // Contract: non-grow auto columns keep their intrinsic (content) width;
    // only the grow column gives way — the terminal edge truncates IT, never
    // its siblings.
    const app = render(
      <Table
        columns={[
          { header: "PID", key: "pid" },
          { header: "SEAT", key: "seat" },
          { header: "CPU", key: "cpu", align: "right" },
          { header: "RSS", key: "rss", align: "right" },
          { header: "COMMAND", key: "command", grow: true },
        ]}
        data={[
          {
            pid: "726",
            seat: "unknown",
            cpu: "46.3",
            rss: "636M",
            command:
              "/Applications/cmux.app/Contents/MacOS/cmux --with-a-very-long-argument-list --that-overflows-eighty-columns --by-a-large-margin --so-shrink-must-engage",
          },
          { pid: "5994", seat: "daemon", cpu: "20.2", rss: "1204M", command: "claude" },
        ]}
      />,
    )
    const lines = app.text.split("\n")
    const header = lines.find((line) => line.includes("COMMAND"))
    expect(header).toBeDefined()
    // Every fixed header survives in full — no proportional crush.
    expect(header).toMatch(/PID\s+SEAT\s+CPU\s+RSS\s+COMMAND/)
    const row = lines.find((line) => line.includes("46.3"))
    expect(row).toBeDefined()
    expect(row).toContain("726")
    expect(row).toContain("unknown")
    expect(row).toContain("636M")
    // The grow column is the one that yields at the edge.
    expect(row!.length).toBeLessThanOrEqual(80)
  })

  test("headers follow their column's alignment", () => {
    // A right-aligned column right-aligns its TITLE too — one `align` knob
    // governs both header and cells (title narrower than its track so the
    // alignment is observable).
    const app = render(
      <Table
        columns={[
          { header: "Name", key: "name" },
          { header: "Id", key: "id", align: "right" },
        ]}
        data={[
          { name: "Alice", id: "100" },
          { name: "Bob", id: "250" },
        ]}
      />,
    )
    const lines = app.text.split("\n")
    const header = lines.find((line) => line.includes("Id"))!
    const row = lines.find((line) => line.includes("Alice"))!
    // Right-flushed title ends exactly where the right-aligned content ends.
    expect(header.trimEnd().endsWith("Id")).toBe(true)
    expect(header.trimEnd().length).toBe(row.trimEnd().length)
  })

  test("showHeader=false hides header", () => {
    const app = render(
      <Table
        columns={[
          { header: "Name", key: "name" },
          { header: "Age", key: "age" },
        ]}
        data={people}
        showHeader={false}
      />,
    )
    // Header text should not be present as a header row
    // Data should still render
    expect(app.text).toContain("Alice")
    expect(app.text).toContain("Bob")
    // The first line should be data, not the header
    const firstLine = app.lines[0]!
    expect(firstLine).toContain("Alice")
  })

  test("empty data shows only header", () => {
    const app = render(
      <Table<Person>
        columns={[
          { header: "Name", key: "name" },
          { header: "Age", key: "age" },
        ]}
        data={[]}
      />,
    )
    expect(app.text).toContain("Name")
    expect(app.text).toContain("Age")
    // Only the header line should be present
    const nonEmptyLines = app.lines.filter((l) => l.trim().length > 0)
    expect(nonEmptyLines).toHaveLength(1)
  })

  test("handles undefined/null values gracefully", () => {
    type Partial = { name: string; email?: string | null }
    const data: Partial[] = [
      { name: "Alice", email: "alice@example.com" },
      { name: "Bob", email: null },
      { name: "Charlie", email: undefined },
    ]
    const app = render(
      <Table
        columns={[
          { header: "Name", key: "name" },
          { header: "Email", key: "email" },
        ]}
        data={data}
      />,
    )
    expect(app.text).toContain("Alice")
    expect(app.text).toContain("alice@example.com")
    expect(app.text).toContain("Bob")
    expect(app.text).toContain("Charlie")
    // Should not contain "null" or "undefined" as text
    expect(app.text).not.toContain("null")
    expect(app.text).not.toContain("undefined")
  })

  test("header uses custom color", () => {
    const app = render(
      <Table
        columns={[{ header: "X", key: "name" }]}
        data={[{ name: "A" }]}
        headerColor="$fg-success"
      />,
    )
    expect(app.text).toContain("X")
    expect(app.text).toContain("A")
  })

  test("custom padding affects column spacing", () => {
    const app = render(
      <Table
        columns={[
          { header: "A", key: "name" },
          { header: "B", key: "age" },
        ]}
        data={[{ name: "X", age: 1 }]}
        padding={4}
      />,
    )
    const lines = app.lines
    // With padding=4, column A width = max("A".length, "X".length) + 4 = 5
    // "B" header should start at position 5
    const headerLine = lines[0]!
    const bIndex = headerLine.indexOf("B")
    expect(bIndex).toBe(5)
  })

  test("flexes bounded columns and truncates content before hiding later columns", () => {
    const narrow = createRenderer({ cols: 32, rows: 10 })
    const app = narrow(
      <Table
        columns={[
          { header: "PR", key: "pr" },
          { header: "STATE", key: "state", maxWidth: 8 },
          { header: "PATH", key: "path", grow: true, minWidth: 8 },
        ]}
        data={[
          {
            pr: "PR8",
            state: "rejected:merge-command-failed",
            path: "task/x",
          },
        ]}
      />,
    )

    expect(app.lines[0]).toContain("PATH")
    expect(app.lines[1]).toContain("task/x")
    expect(app.lines[1]).toContain("…")
    expect(app.lines[1]).toMatch(/… {2}task\/x/u)
  })

  test("omitting interaction preserves the exact passive ANSI byte stream", () => {
    const passive = createRenderer({ cols: 24, rows: 6 })
    const props = {
      columns: [
        { header: "ID", key: "id" as const, align: "right" as const, width: 4 },
        { header: "NAME", key: "name" as const, grow: true },
      ],
      data: [
        { id: "7", name: "alpha" },
        { id: "42", name: "beta" },
      ],
    }

    const omitted = passive(<Table {...props} />)
    const explicitlyPassive = passive(<Table {...props} interactive={false} />)

    expect(omitted.ansi).toBe(
      "\u001b[38;2;129;161;193m\u001b[1mID\u001b[22m\u001b[39m  \u001b[1m\u001b[38;2;129;161;193mNAME\u001b[22m\u001b[39m\n 7  alpha\n42  beta",
    )
    expect(explicitlyPassive.ansi).toBe(omitted.ansi)
  })

  test("interactive cursor delegates j/k, arrows, g/G and survives an ID-preserving reshuffle", async () => {
    const onCursorIdChange = vi.fn()
    const interactive = createRenderer({ cols: 64, rows: 10 })
    const renderTable = (data: readonly TableInteractiveFixtureRow[]) => (
      <Table
        interactive
        active
        height={6}
        columns={interactiveColumns}
        data={data}
        getRowId={(item) => item.id}
        defaultCursorId="run-05"
        onCursorIdChange={onCursorIdChange}
      />
    )
    const app = interactive(renderTable(TABLE_CURSOR_ROWS))

    expectCursorOn(app, "Run 05")
    await app.press("j")
    expectCursorOn(app, "Run 06")
    await app.press("ArrowDown")
    expectCursorOn(app, "Run 07")
    await app.press("k")
    expectCursorOn(app, "Run 06")

    app.rerender(renderTable(TABLE_CURSOR_RESHUFFLED_ROWS))
    expectCursorOn(app, "Run 06")

    await app.press("G")
    expectCursorOn(app, "Run 18")
    await app.press("g")
    expectCursorOn(app, "Run 09")
    await app.press("ArrowUp")
    expectCursorOn(app, "Run 09")

    expect(onCursorIdChange).toHaveBeenCalledWith("run-06")
  })

  test("a removed cursor ID falls back to its prior numeric slot", async () => {
    const interactive = createRenderer({ cols: 64, rows: 10 })
    const renderTable = (data: readonly TableInteractiveFixtureRow[]) => (
      <Table
        interactive
        height={6}
        columns={interactiveColumns}
        data={data}
        getRowId={(item) => item.id}
        defaultCursorId="run-05"
      />
    )
    const app = interactive(renderTable(TABLE_CURSOR_ROWS))
    expectCursorOn(app, "Run 05")

    app.rerender(renderTable(TABLE_CURSOR_ROWS.filter((item) => item.id !== "run-05")))
    await settle(app)

    expectCursorOn(app, "Run 06")
  })

  test("a controlled cursor reports the next ID and moves only when its owner updates", async () => {
    const onCursorIdChange = vi.fn()
    const interactive = createRenderer({ cols: 64, rows: 10 })
    const renderTable = (data: readonly TableInteractiveFixtureRow[], cursorId: string) => (
      <Table
        interactive
        active
        height={6}
        columns={interactiveColumns}
        data={data}
        getRowId={(item) => item.id}
        cursorId={cursorId}
        onCursorIdChange={onCursorIdChange}
      />
    )
    const app = interactive(renderTable(TABLE_CURSOR_ROWS, "run-05"))

    await app.press("j")
    expect(onCursorIdChange).toHaveBeenLastCalledWith("run-06")
    expectCursorOn(app, "Run 05")

    app.rerender(renderTable(TABLE_CURSOR_RESHUFFLED_ROWS, "run-06"))
    expectCursorOn(app, "Run 06")
  })

  test("a controlled cursor does not select a replacement row when its ID disappears", async () => {
    const onCursorIdChange = vi.fn()
    const onActivate = vi.fn()
    const interactive = createRenderer({ cols: 40, rows: 8 })
    const rows = [
      { id: "a", run: "A", status: "idle", subject: "alpha" },
      { id: "b", run: "B", status: "idle", subject: "bravo" },
      { id: "c", run: "C", status: "idle", subject: "charlie" },
    ] satisfies readonly TableInteractiveFixtureRow[]
    const renderTable = (data: readonly TableInteractiveFixtureRow[], cursorId: string) => (
      <Table
        interactive
        active
        height={4}
        columns={interactiveColumns}
        data={data}
        getRowId={(item) => item.id}
        cursorId={cursorId}
        onCursorIdChange={onCursorIdChange}
        onActivate={onActivate}
      />
    )
    const app = interactive(renderTable(rows, "b"))
    expectCursorOn(app, "bravo")

    const withoutB = [rows[0]!, rows[2]!]
    app.rerender(renderTable(withoutB, "b"))
    await settle(app)

    const rowA = app.lines.findIndex((line) => line.includes("alpha"))
    const rowC = app.lines.findIndex((line) => line.includes("charlie"))
    expect(
      app.cell(0, rowA).bg,
      "A must stay unselected while controlled cursorId=b is absent",
    ).toBe(null)
    expect(app.cell(0, rowC).bg, "C must not inherit the missing controlled cursor").toBe(null)
    await app.press("Enter")
    expect(onActivate).not.toHaveBeenCalled()
    expect(onCursorIdChange).not.toHaveBeenCalled()

    app.rerender(renderTable(withoutB, "c"))
    expectCursorOn(app, "charlie")
  })

  test("Enter and click activate the addressed row exactly once", async () => {
    const onActivate = vi.fn()
    const interactive = createRenderer({ cols: 64, rows: 10 })
    const app = interactive(
      <Table
        interactive
        active
        height={8}
        columns={interactiveColumns}
        data={TABLE_CURSOR_ROWS}
        getRowId={(item) => item.id}
        defaultCursorId="run-03"
        onActivate={onActivate}
      />,
    )

    await app.press("Enter")
    expect(onActivate).toHaveBeenCalledTimes(1)
    expect(onActivate).toHaveBeenLastCalledWith(TABLE_CURSOR_ROWS[2])

    const runSevenRow = app.lines.findIndex((line) => line.includes("Run 07"))
    expect(runSevenRow).toBeGreaterThan(0)
    await app.click(1, runSevenRow)

    expect(onActivate).toHaveBeenCalledTimes(2)
    expect(onActivate).toHaveBeenLastCalledWith(TABLE_CURSOR_ROWS[6])
  })

  test("an empty followed Table acquires the live tail when its first batch arrives", async () => {
    const interactive = createRenderer({ cols: 64, rows: 10 })
    const renderTable = (data: readonly TableInteractiveFixtureRow[]) => (
      <Table
        interactive
        active
        height={5}
        follow="end"
        columns={interactiveColumns}
        data={data}
        getRowId={(item) => item.id}
      />
    )
    const app = interactive(renderTable([]))

    app.rerender(renderTable(TABLE_ANCHOR_ROWS))
    await settle(app)

    expectCursorOn(app, "Run 15")
    expect(app.text).not.toContain("new")

    app.rerender(renderTable(TABLE_CURSOR_ROWS))
    await settle(app)

    expectCursorOn(app, "Run 15")
    expect(app.text).not.toContain("new")
  })

  test("anchoring counts unseen row IDs, ignores reshuffles/removals, and G resumes follow", async () => {
    const interactive = createRenderer({ cols: 64, rows: 10 })
    const renderTable = (data: readonly TableInteractiveFixtureRow[]) => (
      <Table
        interactive
        active
        height={5}
        follow="end"
        anchorKey="main:all"
        columns={interactiveColumns}
        data={data}
        getRowId={(item) => item.id}
        defaultCursorId="run-15"
      />
    )
    const app = interactive(renderTable(TABLE_ANCHOR_ROWS))
    await settle(app)

    await app.press("k")
    expectCursorOn(app, "Run 14")
    app.rerender(renderTable(TABLE_ANCHOR_ROWS_WITH_NEW))
    await settle(app)
    expect(app.text).toContain("3 new")

    const reorderedWithoutOne = [
      TABLE_ANCHOR_ROWS_WITH_NEW[2]!,
      ...TABLE_ANCHOR_ROWS_WITH_NEW.slice(0, 2),
      ...TABLE_ANCHOR_ROWS_WITH_NEW.slice(3).filter((item) => item.id !== "run-02"),
    ]
    app.rerender(renderTable(reorderedWithoutOne))
    expect(app.text).toContain("3 new")

    await app.press("G")
    await settle(app)
    expect(app.text).not.toContain("3 new")
  })

  test("changing anchorKey acknowledges the current stable-ID baseline", async () => {
    const interactive = createRenderer({ cols: 64, rows: 10 })
    const renderTable = (data: readonly TableInteractiveFixtureRow[], anchorKey: string) => (
      <Table
        interactive
        active
        height={5}
        follow="end"
        anchorKey={anchorKey}
        columns={interactiveColumns}
        data={data}
        getRowId={(item) => item.id}
        defaultCursorId="run-15"
      />
    )
    const app = interactive(renderTable(TABLE_ANCHOR_ROWS, "main:all"))
    await settle(app)

    await app.press("k")
    app.rerender(renderTable(TABLE_ANCHOR_ROWS_WITH_NEW, "main:all"))
    expect(app.text).toContain("3 new")

    app.rerender(renderTable(TABLE_ANCHOR_ROWS_WITH_NEW, "main:failed"))
    expect(app.text).not.toContain("3 new")
  })
})
