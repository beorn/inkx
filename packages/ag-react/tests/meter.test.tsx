/**
 * Meter — the rich two-segment gauge primitive: bg-painted fill, `░` empty
 * track, segment-fitted overlay label, digit-vs-unit two-tier label inks,
 * token-native defaults, and headless renderString output for CLI reuse.
 *
 * The 10-cell fit cases are the canonical parity set pinned when the fit
 * logic lived in @ag/accounts-core + ag's MetricProgressBar (21137); they
 * moved here with the primitive and must survive any Meter refactor.
 *
 * @failure Quota/utilization gauges lose their fitted reset labels, clip them
 *   mid-character, drop digit-vs-unit tinting, or paint unreadable
 *   label-on-backdrop combinations — the drifted-triplicate bug class that
 *   motivated unifying ag's MetricProgressBar and ag-cli's utilizationBar
 *   onto this single silvery primitive.
 * @level l1
 * @consumer @ag/code/19873-bottom-status-quota-bar-fit/21137-segment-label-fit; quota-bar unification (MetricProgressBar → silvery Meter)
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import {
  Box,
  Meter,
  Text,
  fitSegmentLabel,
  leadingUnitLabelCandidates,
  meterFilledCells,
  renderString,
} from "../src/index.js"

const RESET_LABELS = ["13h 20m", "13h"] as const
const isUnitChar = (char: string) => char >= "a" && char <= "z"

// ============================================================================
// Pure helpers
// ============================================================================

describe("fitSegmentLabel", () => {
  test.each([
    {
      name: "uses an exact-width empty segment at 10%",
      filledCells: 1,
      emptyCells: 9,
      expected: { paddedText: " 13h 20m ", segment: "empty", prefixCells: 0, suffixCells: 0 },
    },
    {
      name: "falls back to the leading semantic unit in the larger empty segment at 18%",
      filledCells: 2,
      emptyCells: 8,
      expected: { paddedText: " 13h ", segment: "empty", prefixCells: 3, suffixCells: 0 },
    },
    {
      name: "keeps the leading semantic unit in the larger filled segment at 56%",
      filledCells: 6,
      emptyCells: 4,
      expected: { paddedText: " 13h ", segment: "filled", prefixCells: 0, suffixCells: 1 },
    },
    {
      name: "keeps the full label in the filled segment at 91%",
      filledCells: 9,
      emptyCells: 1,
      expected: { paddedText: " 13h 20m ", segment: "filled", prefixCells: 0, suffixCells: 0 },
    },
  ])("$name", ({ filledCells, emptyCells, expected }) => {
    expect(fitSegmentLabel({ candidates: RESET_LABELS, filledCells, emptyCells })).toEqual(expected)
  })

  test("prefers the filled segment when equally large segments both fit", () => {
    expect(fitSegmentLabel({ candidates: ["1d"], filledCells: 5, emptyCells: 5 })).toEqual({
      paddedText: " 1d ",
      segment: "filled",
      prefixCells: 0,
      suffixCells: 1,
    })
  })

  test("omits the label instead of clipping when no semantic candidate fits", () => {
    expect(fitSegmentLabel({ candidates: RESET_LABELS, filledCells: 2, emptyCells: 4 })).toBeNull()
  })
})

describe("leadingUnitLabelCandidates", () => {
  test("builds whole leading-unit candidates instead of character slices", () => {
    expect(leadingUnitLabelCandidates(["13h", "20m", "4s"])).toEqual(["13h 20m", "13h"])
  })

  test("shrinks a duration by dropping the SMALLEST unit — never the tail unit", () => {
    expect(leadingUnitLabelCandidates(["3h", "4m"])).toEqual(["3h 4m", "3h"])
    expect(leadingUnitLabelCandidates(["3h", "4m"])).not.toContain("4m")
  })
})

describe("meterFilledCells", () => {
  test("rounds to nearest cell and clamps value + width", () => {
    expect(meterFilledCells(0.18, 10)).toBe(2)
    expect(meterFilledCells(0.56, 10)).toBe(6)
    expect(meterFilledCells(-1, 10)).toBe(0)
    expect(meterFilledCells(2, 10)).toBe(10)
    expect(meterFilledCells(0.5, 0)).toBe(0)
    expect(meterFilledCells(0.5, -3)).toBe(0)
  })

  test("non-finite value renders as an empty meter, not NaN cell counts", () => {
    expect(meterFilledCells(Number.NaN, 10)).toBe(0)
    expect(meterFilledCells(Number.POSITIVE_INFINITY, 10)).toBe(10)
  })
})

// ============================================================================
// Rendered fit parity — the canonical 10-cell cases (21137)
// ============================================================================

function renderFitApp(utilization: number) {
  const width = 10
  const render = createRenderer({ cols: width, rows: 1 })
  return render(
    <Box width={width} height={1}>
      <Meter
        value={utilization / 100}
        width={width}
        fillColor="$bg-success"
        emptyColor="$fg-muted"
        overlay={{
          candidates: RESET_LABELS,
          color: "$fg",
          secondaryColor: "$fg-muted",
          isSecondaryChar: isUnitChar,
        }}
      />
    </Box>,
  )
}

function rowText(app: ReturnType<ReturnType<typeof createRenderer>>, width: number): string {
  return Array.from({ length: width }, (_, column) => app.cell(column, 0).char).join("")
}

describe("Meter segment-label fit parity (canonical 10-cell cases)", () => {
  test.each([
    { utilization: 10, expected: "  13h 20m " },
    { utilization: 18, expected: "  ░░░ 13h " },
    { utilization: 56, expected: " 13h  ░░░░" },
    { utilization: 60, expected: " 13h  ░░░░" },
    { utilization: 86, expected: " 13h 20m ░" },
    { utilization: 91, expected: " 13h 20m ░" },
  ])(
    "renders the canonical 10-cell $utilization% case without clipping",
    ({ utilization, expected }) => {
      expect(rowText(renderFitApp(utilization), 10)).toBe(expected)
    },
  )

  test("preserves the empty-segment backdrop and readable label colors", () => {
    const app = renderFitApp(18)
    const dimCell = app.cell(2, 0)
    const labelPaddingCell = app.cell(5, 0)
    const labelCell = app.cell(6, 0)

    expect(dimCell.char).toBe("░")
    expect(dimCell.fg).not.toBeNull()
    expect(labelPaddingCell.char).toBe(" ")
    expect(labelPaddingCell.bg).toEqual(dimCell.fg)
    expect(labelCell.char).toBe("1")
    expect(labelCell.bg).toEqual(dimCell.fg)
    expect(labelCell.fg).not.toEqual(labelCell.bg)
  })

  test("tints unit letters with secondaryColor and digits with color", () => {
    const width = 10
    const render = createRenderer({ cols: width, rows: 2 })
    const app = render(
      <Box flexDirection="column" width={width} height={2}>
        <Meter
          value={0.18}
          width={width}
          fillColor="$bg-success"
          emptyColor="$fg-muted"
          overlay={{
            candidates: RESET_LABELS,
            color: "$fg-warning",
            secondaryColor: "$fg-error",
            isSecondaryChar: isUnitChar,
          }}
        />
        <Box flexDirection="row">
          <Text color="$fg-warning">W</Text>
          <Text color="$fg-error">E</Text>
        </Box>
      </Box>,
    )
    // "  ░░░ 13h " — digits at cols 6-7, the unit letter "h" at col 8.
    const digitCell = app.cell(6, 0)
    const unitCell = app.cell(8, 0)
    const warningRef = app.cell(0, 1)
    const errorRef = app.cell(1, 1)

    expect(digitCell.char).toBe("1")
    expect(unitCell.char).toBe("h")
    expect(digitCell.fg).toEqual(warningRef.fg)
    expect(unitCell.fg).toEqual(errorRef.fg)
    expect(unitCell.fg).not.toEqual(digitCell.fg)
  })

  test("paints the filled-segment label on the fill color, left-aligned", () => {
    const app = renderFitApp(56)
    // " 13h  ░░░░" — label cells 0-4 on the fill, suffix fill block at 5.
    const labelCell = app.cell(1, 0)
    const suffixCell = app.cell(5, 0)
    const trackCell = app.cell(6, 0)

    expect(labelCell.char).toBe("1")
    expect(labelCell.bg).not.toBeNull()
    expect(suffixCell.char).toBe(" ")
    expect(suffixCell.bg).toEqual(labelCell.bg)
    expect(trackCell.char).toBe("░")
    expect(trackCell.bg).not.toEqual(labelCell.bg)
  })

  test("per-segment ink overrides win over the shared label inks", () => {
    const width = 10
    const render = createRenderer({ cols: width, rows: 2 })
    const app = render(
      <Box flexDirection="column" width={width} height={2}>
        <Meter
          value={0.18}
          width={width}
          fillColor="$bg-success"
          emptyColor="$fg-muted"
          overlay={{
            candidates: RESET_LABELS,
            color: "$fg",
            empty: { color: "$fg-warning" },
            isSecondaryChar: isUnitChar,
          }}
        />
        <Text color="$fg-warning">W</Text>
      </Box>,
    )
    expect(app.cell(6, 0).char).toBe("1")
    expect(app.cell(6, 0).fg).toEqual(app.cell(0, 1).fg)
  })
})

// ============================================================================
// Track rendering without an overlay
// ============================================================================

describe("Meter track", () => {
  test("renders bg-painted fill plus emptyChar track, clamped to width", () => {
    const width = 10
    const render = createRenderer({ cols: width, rows: 1 })
    const app = render(
      <Box width={width} height={1}>
        <Meter value={0.3} width={width} fillColor="$bg-success" emptyColor="$fg-muted" />
      </Box>,
    )
    expect(rowText(app, width)).toBe("   ░░░░░░░")
    expect(app.cell(0, 0).bg).not.toBeNull()
    expect(app.cell(2, 0).bg).toEqual(app.cell(0, 0).bg)
    expect(app.cell(3, 0).bg).not.toEqual(app.cell(0, 0).bg)
  })

  test("value is clamped: over-full paints all cells, negative paints none", () => {
    const width = 6
    const render = createRenderer({ cols: width, rows: 2 })
    const app = render(
      <Box flexDirection="column" width={width} height={2}>
        <Meter value={1.7} width={width} fillColor="$bg-success" emptyColor="$fg-muted" />
        <Meter value={-0.4} width={width} fillColor="$bg-success" emptyColor="$fg-muted" />
      </Box>,
    )
    expect(rowText(app, width)).toBe("      ")
    expect(app.cell(5, 0).bg).not.toBeNull()
    expect(Array.from({ length: width }, (_, c) => app.cell(c, 1).char).join("")).toBe("░░░░░░")
  })

  test("token-native defaults: fill = $bg-accent, track ink = $fg-muted", () => {
    const width = 10
    const render = createRenderer({ cols: width, rows: 2 })
    const app = render(
      <Box flexDirection="column" width={width} height={2}>
        <Meter value={0.5} width={width} />
        <Box flexDirection="row">
          <Box backgroundColor="$bg-accent" width={1} height={1} />
          <Text color="$fg-muted">░</Text>
        </Box>
      </Box>,
    )
    expect(app.cell(0, 0).bg).toEqual(app.cell(0, 1).bg)
    expect(app.cell(5, 0).char).toBe("░")
    expect(app.cell(5, 0).fg).toEqual(app.cell(1, 1).fg)
  })

  test("solid block track: emptyBackgroundColor paints the track and the label backdrop", () => {
    const width = 10
    const render = createRenderer({ cols: width, rows: 2 })
    const app = render(
      <Box flexDirection="column" width={width} height={2}>
        <Meter
          value={0.18}
          width={width}
          fillColor="$bg-success"
          emptyChar=" "
          emptyColor="$fg"
          emptyBackgroundColor="$bg-muted"
          overlay={{
            candidates: RESET_LABELS,
            color: "$fg",
            secondaryColor: "$fg-muted",
            isSecondaryChar: isUnitChar,
          }}
        />
        <Box backgroundColor="$bg-muted" width={1} height={1} />
      </Box>,
    )
    // "     13h  " shape: solid track cells + right-aligned label on the track paint.
    const trackCell = app.cell(2, 0)
    const labelCell = app.cell(6, 0)
    const backdropRef = app.cell(0, 1)
    expect(trackCell.char).toBe(" ")
    expect(trackCell.bg).toEqual(backdropRef.bg)
    expect(labelCell.char).toBe("1")
    expect(labelCell.bg).toEqual(backdropRef.bg)
    expect(labelCell.fg).not.toEqual(labelCell.bg)
  })
})

// ============================================================================
// Headless renderString — the CLI (ag status) reuse path
// ============================================================================

describe("Meter via renderString (headless CLI feasibility)", () => {
  const meter = (
    <Meter
      value={0.18}
      width={10}
      fillColor="$bg-success"
      emptyColor="$fg-muted"
      overlay={{
        candidates: RESET_LABELS,
        color: "$fg",
        secondaryColor: "$fg-muted",
        isSecondaryChar: isUnitChar,
      }}
    />
  )

  test("plain output reproduces the exact bar cell shape at a fixed width", async () => {
    const plain = await renderString(meter, {
      width: 10,
      height: 1,
      plain: true,
      trimTrailingWhitespace: false,
    })
    expect(plain).toBe("  ░░░ 13h ")
  })

  test("styled output is stdout-safe: SGR-only escapes, no cursor or mode sequences", async () => {
    const styled = await renderString(meter, {
      width: 10,
      height: 1,
      trimTrailingWhitespace: false,
    })
    // Visible cells survive styling untouched.
    // eslint-disable-next-line no-control-regex
    expect(styled.replace(/\x1B\[[0-9;]*m/g, "")).toBe("  ░░░ 13h ")
    // Every escape sequence is an SGR color/attr sequence — nothing that
    // moves the cursor, switches screens, or leaves modes armed.
    // eslint-disable-next-line no-control-regex
    expect(styled.replace(/\x1B\[[0-9;]*m/g, "")).not.toContain("\x1B")
    // Styling actually happened (filled bg + track fg present).
    expect(styled).toContain("\x1B[")
  })

  test.each([
    { colorLevel: "256" as const, expected: /\x1B\[(?:38|48);5;\d+m/u },
    { colorLevel: "truecolor" as const, expected: /\x1B\[(?:38|48);2;\d+;\d+;\d+m/u },
  ])("honors an explicit $colorLevel output tier", async ({ colorLevel, expected }) => {
    const styled = await renderString(meter, {
      width: 10,
      height: 1,
      colorLevel,
      trimTrailingWhitespace: false,
    })
    expect(styled).toMatch(expected)
  })
})
