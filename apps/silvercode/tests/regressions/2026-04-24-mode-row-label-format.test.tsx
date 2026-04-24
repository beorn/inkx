/**
 * Regression — 2026-04-24 mode row label format
 *
 * User report
 * -----------
 * The mode row in the side panel used to render only a compact "auto" or
 * "plan" label; a recent polish pass added the "mode on" suffix
 * ("auto mode on", "plan mode on"). Before the full string was wired,
 * a transitional commit rendered the icon + mode name but dropped the
 * " mode on" suffix — so plan mode showed as just "· plan" on one row.
 *
 * What this guards
 * ----------------
 * The side-panel mode row must contain the exact label defined in
 * SidePanel.MODE_LABELS. If the component drifts (typo, partial label,
 * missing "mode on" suffix), the regression fires.
 *
 * Related: assertModeRowWellFormed in tests/visual/_invariants.ts.
 *
 * Scope bead: km-silvercode.test-system (this file is the regression
 * seed referenced in apps/silvercode/docs/test-system-design.md).
 */

import { describe, expect, test } from "vitest"
import { renderScenario } from "../../src/test/render-harness.tsx"
import { welcome } from "../../src/test/scripts/welcome.ts"
import { parseFrame, MODE_LABELS_EXPECTED, MODE_ICONS_EXPECTED } from "../../src/test/parse-frame.ts"

describe("regression 2026-04-24: mode row label format", () => {
  test("default-mode side panel renders the full 'auto mode on' label", async () => {
    const s = await renderScenario({ script: welcome, cols: 120, rows: 30 })
    const p = parseFrame(s)
    const row = p.sidePanel?.modeRow
    expect(row, "mode row missing from side panel").toBeDefined()
    expect(row!.label, "mode label must be the canonical 'auto mode on'").toBe(MODE_LABELS_EXPECTED.auto)
    expect(row!.icon, "mode icon must match expected").toBe(MODE_ICONS_EXPECTED.auto)
    // Icon + single space + label — same row, visually.
    const rowText = p.sidePanel!.lines[row!.row]!
    const expected = `${MODE_ICONS_EXPECTED.auto} ${MODE_LABELS_EXPECTED.auto}`
    expect(rowText, `expected the row to contain "${expected}"`).toContain(expected)
  })
})
