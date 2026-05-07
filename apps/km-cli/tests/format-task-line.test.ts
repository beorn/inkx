/**
 * `formatTaskLine` rendering tests.
 *
 * Pinned bug: source markdown like
 *
 *     - [ ] Code ownership file — want to do this
 *           first. See [[link]].
 *
 * round-trips through mdast as a single list item whose `content`
 * contains a literal `\n`. The formatter is named `formatTaskLine`
 * (singular line) and is rendered on a `console.log()` that already
 * carries an indent — embedded newlines therefore reset to column 0
 * and break the indentation. The CLI list view is one-task-per-line,
 * so we collapse internal whitespace runs (newlines + their
 * surrounding spaces) to a single space.
 */
import { describe, expect, test } from "vitest"
import { formatTaskLine } from "../src/commands/tasks/formatters.ts"
import type { KNode } from "@km/core"

function makeTaskNode(content: string): KNode {
  return {
    id: "01HZZ00000000000000000task",
    type: "p",
    parent_id: null,
    parent_idx: 0,
    item: { list: "-", task: { marker: "[ ]", status: "todo" } },
    content,
    data: {},
    created_at: 0,
    updated_at: 0,
    version: "v0",
  } as KNode
}

// Strip ANSI escape sequences so assertions only inspect text.
function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\[[0-9;]*m/g, "")
}

describe("formatTaskLine", () => {
  test("flattens an embedded newline + continuation indent into a single space", () => {
    const content =
      "Code ownership file — want to do this but need to decide the shape\n      first. See [[Beads/km-process.codeowners]]."
    const out = stripAnsi(formatTaskLine(makeTaskNode(content)))

    expect(out).not.toContain("\n")
    expect(out).toContain(
      "Code ownership file — want to do this but need to decide the shape first. See [[Beads/km-process.codeowners]].",
    )
  })

  test("collapses multiple newlines and arbitrary leading whitespace on the continuation", () => {
    const content = "first line\n\n\t  second line"
    const out = stripAnsi(formatTaskLine(makeTaskNode(content)))

    expect(out).not.toContain("\n")
    expect(out).toContain("first line second line")
  })

  test("leaves single-line content untouched", () => {
    const out = stripAnsi(formatTaskLine(makeTaskNode("plain title")))
    expect(out).toMatch(/\[ ] plain title$/)
  })
})
