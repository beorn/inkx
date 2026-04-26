/**
 * Autolinks rendering — verifies that syntaxlinks rules loaded from
 * <vault>/.km/config.yaml are detected in plain-text inline runs and
 * rendered with the documented styling (color $secondary + underline
 * for configured rules; $info for virtual plain URLs).
 *
 * Surface under test: <InlineText> (and its <InlinePlainText> child),
 * which is the leverage point used by every text render surface in
 * km-tui (DetailView, CardColumn, NodeView, OmniboxRow).
 */

import { describe, it, expect } from "vitest"
import React from "react"
import { createRenderer } from "@silvery/test"
import { Box } from "@silvery/ag-react"
import { parseSyntaxlinksYaml, type AutolinkRule } from "@km/autolinks"
import { InlineText } from "../../src/text/InlineComponents.tsx"
import { AutolinksProvider } from "../../src/text/AutolinksContext.tsx"

function renderWithRules(text: string, rules: readonly AutolinkRule[]) {
  const render = createRenderer({ cols: 80, rows: 6 })
  return render(
    <AutolinksProvider rules={rules}>
      <Box width={80}>
        <InlineText text={text} />
      </Box>
    </AutolinksProvider>,
  )
}

describe("autolinks rendering", () => {
  it("plain text with no rules renders unchanged (fast path)", () => {
    const app = renderWithRules("Hello world from km-tui", [])
    expect(app.text).toContain("Hello world from km-tui")
  })

  it("loads a syntaxlinks rule from per-vault YAML and detects the pattern", () => {
    const yaml = `
syntaxlinks:
  - pattern: "~repo"
    resolves_to: "/Users/beorn/Code/pim/km"
    preview: readme
`
    const rules = parseSyntaxlinksYaml(yaml)
    expect(rules.length).toBe(1)
    const rule = rules[0]!
    expect(rule.source).toBe("~repo")
    expect(rule.preview).toBe("readme")

    const app = renderWithRules("Visit ~repo to see the codebase", rules)
    // The matched text still appears in the rendered output — the autolink
    // pass wraps it in styled <Text> spans but does not alter the text.
    expect(app.text).toContain("~repo")
    expect(app.text).toContain("Visit")
    expect(app.text).toContain("to see the codebase")
  })

  it("matched autolink span gets $secondary color + underline (via cell)", () => {
    const yaml = `
syntaxlinks:
  - pattern: "~repo"
    resolves_to: "/Users/beorn/Code/pim/km"
    preview: readme
`
    const rules = parseSyntaxlinksYaml(yaml)
    const text = "go ~repo now"
    const app = renderWithRules(text, rules)

    // Locate the start column of "~repo" in the rendered line.
    const lines = app.lines
    const lineIdx = lines.findIndex((l) => l.includes("~repo"))
    expect(lineIdx).toBeGreaterThanOrEqual(0)
    const line = lines[lineIdx]!
    const col = line.indexOf("~repo")
    expect(col).toBeGreaterThanOrEqual(0)

    // The cell at the start of the autolink is styled — underlined and
    // its fg is NOT the default cell fg. We don't assert on a specific
    // RGB because the resolved colour depends on the active theme; we
    // assert the structural property (underline is set).
    const cell = app.cell(col, lineIdx)
    expect(cell.underline).toBeTruthy()

    // Adjacent plain-text cell ("go " before the match) is NOT underlined.
    const beforeCell = app.cell(0, lineIdx)
    expect(beforeCell.underline).toBeFalsy()
  })

  it("regex pattern (/.../) compiles + matches", () => {
    const yaml = `
syntaxlinks:
  - pattern: "/\\\\+(\\\\w+)/"
    resolves_to: "/Users/beorn/Code/pim/km"
    preview: bd-active
`
    const rules = parseSyntaxlinksYaml(yaml)
    expect(rules.length).toBe(1)
    expect(rules[0]!.regex.source).toBe("\\+(\\w+)")

    const app = renderWithRules("see +foo for context", rules)
    expect(app.text).toContain("+foo")
  })

  it("autolink rule wins over plain text inside an InlineText run", () => {
    // A rule that matches a literal substring should fire even when
    // surrounding text contains no other detection-worthy syntax.
    const yaml = `
syntaxlinks:
  - pattern: "AGENTS.md"
    resolves_to: "/Users/beorn/Code/pim/km/AGENTS.md"
    preview: first-paragraph
`
    const rules = parseSyntaxlinksYaml(yaml)
    const app = renderWithRules("see AGENTS.md for the rules", rules)

    const lines = app.lines
    const lineIdx = lines.findIndex((l) => l.includes("AGENTS.md"))
    expect(lineIdx).toBeGreaterThanOrEqual(0)
    const line = lines[lineIdx]!
    const col = line.indexOf("AGENTS.md")
    const cell = app.cell(col, lineIdx)
    // Underline applied — autolink path fired.
    expect(cell.underline).toBeTruthy()
  })

  it("text with no detection (and no rules) renders zero styled spans", () => {
    const app = renderWithRules("plain prose with nothing special", [])
    expect(app.text).toContain("plain prose with nothing special")
    // First cell of the rendered text is not underlined.
    const lineIdx = app.lines.findIndex((l) => l.includes("plain prose"))
    const col = app.lines[lineIdx]!.indexOf("plain prose")
    const cell = app.cell(col, lineIdx)
    expect(cell.underline).toBeFalsy()
  })
})
