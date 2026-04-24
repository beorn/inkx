import { describe, expect, test } from "vitest"
import React from "react"
import { createRenderer } from "@silvery/test"
import { DiffRenderer } from "../src/components/DiffRenderer.tsx"

/**
 * DiffRenderer unit tests — Myers/LCS diff via the `diff` package.
 *
 * Uses React.createElement (not JSX) so this file can stay `.test.ts` per
 * the bead spec; JSX would force `.test.tsx`.
 *
 * DiffRenderer is wrapped in a `borderStyle="single"` Box, so rendered
 * lines look like `│ + new-text                   │`. Assertions strip the
 * leading border + space via `stripBorder()` before matching markers.
 */

const render = createRenderer({ cols: 80, rows: 24 })

// Strip a single leading border glyph + one space, if present, from each
// visible line. Trims each line's trailing whitespace + border for easier
// matching. Blank + border-only lines are dropped.
function renderDiffLines(oldText: string, newText: string, filePath?: string): string[] {
  const app = render(React.createElement(DiffRenderer, { oldText, newText, filePath }))
  const raw = app.text.split("\n")
  const out: string[] = []
  for (const line of raw) {
    // Drop top/bottom border rows (└ ┘ ┌ ┐ ─ glyphs)
    if (/^[┌┐└┘─]+$/.test(line.trim())) continue
    // Strip left border (│ + optional space) and right border (space + │)
    let stripped = line.replace(/^│\s?/, "")
    stripped = stripped.replace(/\s*│\s*$/, "")
    out.push(stripped)
  }
  return out
}

function renderDiffText(oldText: string, newText: string, filePath?: string): string {
  return renderDiffLines(oldText, newText, filePath).join("\n")
}

describe("DiffRenderer", () => {
  test("all-different old/new marks every old line as removed and every new line as added", () => {
    const lines = renderDiffLines("alpha\nbeta\ngamma", "one\ntwo\nthree")
    const removed = lines.filter((l) => /^-\s/.test(l))
    const added = lines.filter((l) => /^\+\s/.test(l))
    expect(removed.some((l) => l.includes("alpha"))).toBe(true)
    expect(removed.some((l) => l.includes("beta"))).toBe(true)
    expect(removed.some((l) => l.includes("gamma"))).toBe(true)
    expect(added.some((l) => l.includes("one"))).toBe(true)
    expect(added.some((l) => l.includes("two"))).toBe(true)
    expect(added.some((l) => l.includes("three"))).toBe(true)
  })

  test("common prefix and suffix are kept as context (no +/- marker)", () => {
    const lines = renderDiffLines("header\nold-middle\nfooter", "header\nnew-middle\nfooter")
    const header = lines.find((l) => l.includes("header"))
    const footer = lines.find((l) => l.includes("footer"))
    expect(header).toBeDefined()
    expect(footer).toBeDefined()
    // header/footer render as context: two-space gutter, no +/-
    expect(header!).not.toMatch(/^[+-]\s/)
    expect(footer!).not.toMatch(/^[+-]\s/)
    // old-middle removed, new-middle added
    expect(lines.some((l) => /^-\s.*old-middle/.test(l))).toBe(true)
    expect(lines.some((l) => /^\+\s.*new-middle/.test(l))).toBe(true)
  })

  test("single-line modification produces exactly one removed and one added line", () => {
    const lines = renderDiffLines("only-line", "only-line-changed")
    const removed = lines.filter((l) => /^-\s/.test(l))
    const added = lines.filter((l) => /^\+\s/.test(l))
    expect(removed).toHaveLength(1)
    expect(added).toHaveLength(1)
    expect(removed[0]!).toContain("only-line")
    expect(added[0]!).toContain("only-line-changed")
  })

  test("file path header renders when provided", () => {
    const text = renderDiffText("a", "b", "src/foo.ts")
    expect(text).toContain("--- src/foo.ts")
  })

  test("long unchanged runs collapse with an elision marker", () => {
    const shared = Array.from({ length: 8 }, (_, i) => `ctx-${i}`).join("\n")
    const lines = renderDiffLines(`${shared}\nold-tail`, `${shared}\nnew-tail`)
    const text = lines.join("\n")
    expect(text).toMatch(/\.\.\.\s+\d+\s+lines unchanged/)
    // First two ctx lines shown
    expect(text).toContain("ctx-0")
    expect(text).toContain("ctx-1")
    // Middle ctx lines elided
    expect(text).not.toContain("ctx-3")
    expect(text).not.toContain("ctx-4")
    // Last two ctx lines shown
    expect(text).toContain("ctx-6")
    expect(text).toContain("ctx-7")
    // Tail change still rendered
    expect(lines.some((l) => /^-\s.*old-tail/.test(l))).toBe(true)
    expect(lines.some((l) => /^\+\s.*new-tail/.test(l))).toBe(true)
  })
})
