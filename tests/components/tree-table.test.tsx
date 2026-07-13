/**
 * @failure TreeTable can lose hierarchy rails, column alignment, truncation, or custom cells.
 * @level l1
 * @consumer silvery TreeTable consumers
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { Text, TreeTable, type TableColumn } from "silvery"

type Row = {
  name: string
  state: string
  expanded?: boolean
  children?: readonly Row[]
}

const TREE: readonly Row[] = [
  {
    name: "alpha",
    state: "root",
    children: [
      {
        name: "branch",
        state: "wip",
        children: [{ name: "deep", state: "done" }],
      },
      { name: "last", state: "todo" },
    ],
  },
  { name: "omega", state: "idle" },
]

const columns = [
  { header: "NAME", key: "name", grow: true },
  { header: "STATE", key: "state", width: 8, align: "right" },
] as const satisfies readonly [TableColumn<Row>, ...TableColumn<Row>[]]

describe("TreeTable", () => {
  test("renders rootless unicode rails with deep continuation and aligned columns", () => {
    const render = createRenderer({ cols: 48, rows: 12 })
    const app = render(
      <TreeTable
        data={TREE}
        columns={columns}
        getChildren={(row) => row.children}
        guideStyle="unicode"
      />,
    )

    const root = app.lines.find((line) => line.includes("alpha"))!
    const branch = app.lines.find((line) => line.includes("branch"))!
    const deep = app.lines.find((line) => line.includes("deep"))!
    const last = app.lines.find((line) => line.includes("last"))!

    expect(root).toMatch(/^alpha/u)
    expect(root).not.toMatch(/[│├└]/u)
    expect(branch).toContain("├── branch")
    expect(deep).toContain("│   └── deep")
    expect(last).toContain("└── last")
    expect(branch.trimEnd().length).toBe(app.lines[0]!.trimEnd().length)
  })

  test("renders ASCII guides without Unicode rail glyphs", () => {
    const render = createRenderer({ cols: 48, rows: 12 })
    const app = render(
      <TreeTable
        data={TREE}
        columns={columns}
        getChildren={(row) => row.children}
        guideStyle="ascii"
      />,
    )

    expect(app.text).toContain("|-- branch")
    expect(app.text).toContain("|   `-- deep")
    expect(app.text).toContain("`-- last")
    expect(app.text).not.toMatch(/[│├└]/u)
  })

  test("renders only children returned by the consumer", () => {
    const data: readonly Row[] = [
      {
        name: "root",
        state: "open",
        expanded: true,
        children: [
          {
            name: "folded",
            state: "closed",
            expanded: false,
            children: [{ name: "hidden", state: "idle" }],
          },
        ],
      },
    ]
    const render = createRenderer({ cols: 40, rows: 8 })
    const app = render(
      <TreeTable
        data={data}
        columns={columns}
        getChildren={(row) => (row.expanded ? row.children : [])}
        guideStyle="unicode"
      />,
    )

    expect(app.text).toContain("root")
    expect(app.text).toContain("└── folded")
    expect(app.text).not.toContain("hidden")
  })

  test("keeps later columns visible while the growing tree column truncates", () => {
    const render = createRenderer({ cols: 28, rows: 8 })
    const app = render(
      <TreeTable<Row>
        data={[
          {
            name: "root-with-a-long-name",
            state: "running",
            children: [{ name: "child-with-an-even-longer-name", state: "blocked" }],
          },
        ]}
        columns={columns}
        getChildren={(row) => row.children}
        guideStyle="unicode"
      />,
    )

    const child = app.lines.find((line) => line.includes("blocked"))!
    expect(child).toContain("…")
    expect(child).toContain("blocked")
    expect(child.length).toBeLessThanOrEqual(28)
  })

  test("preserves custom React cells in tree and non-tree columns", () => {
    const customColumns = [
      {
        header: "NAME",
        key: "name",
        grow: true,
        render: (row: Row) => <Text color="$fg-accent">{row.name.toUpperCase()}</Text>,
      },
      {
        header: "STATE",
        key: "state",
        render: (row: Row) => <Text color="$fg-success">[{row.state}]</Text>,
      },
    ] as const satisfies readonly [TableColumn<Row>, ...TableColumn<Row>[]]
    const render = createRenderer({ cols: 40, rows: 8 })
    const app = render(
      <TreeTable<Row>
        data={[{ name: "root", state: "open", children: [{ name: "child", state: "done" }] }]}
        columns={customColumns}
        getChildren={(row) => row.children}
        guideStyle="unicode"
      />,
    )

    expect(app.text).toContain("ROOT")
    expect(app.text).toContain("└── CHILD")
    expect(app.text).toContain("[done]")
  })
})
