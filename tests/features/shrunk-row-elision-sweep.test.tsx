/**
 * A shrinking row of truncating Text never drops content without a marker.
 *
 * Reported from a breadcrumb trail in a narrow top bar: path segments were not
 * rendering elided, they were VANISHING — "maddoc" painted as "m", "apps" as
 * "a", with no "…" anywhere to say a cut had happened. Silent content loss, not
 * a cosmetic marker bug.
 *
 * The behaviour is NON-MONOTONIC in container width. It is not "breaks below N
 * columns": correct and broken widths interleave, one column apart, because
 * which segment is affected depends on where each segment's fractional start
 * edge falls after flex shrink redistributes the deficit. That is why the
 * acceptance criterion here is a continuous SWEEP and not a handful of widths —
 * before the fix, a test pinned at 15 or 19 or 25 passed while 14, 16 and 26
 * were dropping content.
 *
 * Assertions are on the OUTCOME — what the row painted at each width — never on
 * the layout numbers or the rounding that produced them.
 */
import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Breadcrumb, Text } from "silvery"

const ELLIPSIS = "…"
const SEPARATOR = "/"
const LABELS = ["@hh", "km", "apps", "maddoc", "src", "file-app.tsx"]
const NATURAL_WIDTH = LABELS.join(SEPARATOR).length
/**
 * One cell per element (each label plus each separator). At and above this the
 * row fits its own minimum, so every element owns at least one cell and there
 * is always somewhere to paint a marker. Below it the row genuinely cannot show
 * one cell per element and the ancestor's `overflow="hidden"` clips the tail —
 * a different regime, covered separately.
 */
const MIN_ROW_WIDTH = LABELS.length * 2 - 1
const SWEEP_MAX = 80

/**
 * A field is acceptable when it is the whole label, or a prefix of the label
 * with a marker showing the rest was cut. Anything else — a bare prefix, a
 * stray space, an empty field — is content the reader was never told about.
 */
function describeBadFields(line: string): string[] {
  const fields = line.split(SEPARATOR)
  if (fields.length !== LABELS.length) {
    return [
      `row split into ${fields.length} segments, expected ${LABELS.length}: ${JSON.stringify(fields)}`,
    ]
  }
  const bad: string[] = []
  for (const [index, label] of LABELS.entries()) {
    const field = fields[index]!
    if (field === label) continue
    if (field.endsWith(ELLIPSIS) && label.startsWith(field.slice(0, -1))) continue
    bad.push(`"${label}" painted as ${JSON.stringify(field)}`)
  }
  return bad
}

function renderTrailAt(width: number): string {
  const render = createRenderer({ cols: SWEEP_MAX + 40, rows: 4 })
  const app = render(
    <Box width={width} height={1}>
      <Box flexGrow={1} minWidth={0} overflow="hidden">
        <Breadcrumb
          items={LABELS.map((label) => ({ label }))}
          currentIndex={-1}
          separatorSpacing="compact"
        />
      </Box>
    </Box>,
  )
  return (app.lines[0] ?? "").replace(/\s+$/, "")
}

describe("shrinking row of truncating Text — elision sweep", () => {
  test("every width from one-cell-each to 80 renders each segment whole or marked", () => {
    const broken: string[] = []
    for (let width = MIN_ROW_WIDTH; width <= SWEEP_MAX; width++) {
      const line = renderTrailAt(width)
      const bad = describeBadFields(line)
      if (bad.length > 0) broken.push(`w=${width} [${line}] — ${bad.join(", ")}`)
    }
    const swept = SWEEP_MAX - MIN_ROW_WIDTH + 1
    expect(
      broken,
      `content was cut with no elision marker at ${broken.length} of ${swept} swept widths:\n${broken.join("\n")}`,
    ).toEqual([])
  })

  test("the row still renders in full once it fits", () => {
    expect(renderTrailAt(NATURAL_WIDTH)).toBe(LABELS.join(SEPARATOR))
    expect(renderTrailAt(SWEEP_MAX)).toBe(LABELS.join(SEPARATOR))
  })

  test("below one cell per element the clipped tail still leaves a marker visible", () => {
    // The row cannot fit one cell per element here, so the ancestor clips it.
    // What must not happen is a row that shows only whole labels and no sign of
    // the cut — the reader has to be able to tell the trail is incomplete.
    for (let width = 1; width < MIN_ROW_WIDTH; width++) {
      const line = renderTrailAt(width)
      expect(line, `width ${width} painted ${JSON.stringify(line)}`).toContain(ELLIPSIS)
    }
  })

  test("the invariant holds when the width changes under one live app, not just on fresh renders", () => {
    // A real terminal resizes an app that is already mounted, so every width in
    // the sweep is reached incrementally. SILVERY_STRICT compares incremental
    // against fresh on each of these rerenders; the elision assertion runs on
    // top of it, so a marker that only survives a from-scratch render fails here.
    const render = createRenderer({ cols: SWEEP_MAX + 40, rows: 4 })
    const trail = (width: number) => (
      <Box width={width} height={1}>
        <Box flexGrow={1} minWidth={0} overflow="hidden">
          <Breadcrumb
            items={LABELS.map((label) => ({ label }))}
            currentIndex={-1}
            separatorSpacing="compact"
          />
        </Box>
      </Box>
    )

    const broken: string[] = []
    const app = render(trail(SWEEP_MAX))
    for (let width = SWEEP_MAX; width >= MIN_ROW_WIDTH; width--) {
      app.rerender(trail(width))
      const line = (app.lines[0] ?? "").replace(/\s+$/, "")
      const bad = describeBadFields(line)
      if (bad.length > 0) broken.push(`w=${width} [${line}] — ${bad.join(", ")}`)
    }
    expect(
      broken,
      `content cut with no marker while shrinking live at ${broken.length} widths:\n${broken.join("\n")}`,
    ).toEqual([])
  })

  test("a plain row of truncating Text is elided per segment, not silently cut", () => {
    // Same invariant without the Breadcrumb component in the way: the elision
    // belongs to the pipeline's text path, not to one component's markup.
    const broken: string[] = []
    for (let width = MIN_ROW_WIDTH; width <= SWEEP_MAX; width++) {
      const render = createRenderer({ cols: SWEEP_MAX + 40, rows: 4 })
      const app = render(
        <Box width={width} height={1}>
          <Box flexGrow={1} minWidth={0} overflow="hidden">
            {LABELS.map((label, index) => (
              <React.Fragment key={label}>
                {index > 0 && <Text wrap="truncate">{SEPARATOR}</Text>}
                <Text wrap="truncate">{label}</Text>
              </React.Fragment>
            ))}
          </Box>
        </Box>,
      )
      const line = (app.lines[0] ?? "").replace(/\s+$/, "")
      const bad = describeBadFields(line)
      if (bad.length > 0) broken.push(`w=${width} [${line}] — ${bad.join(", ")}`)
    }
    expect(
      broken,
      `content cut with no marker at ${broken.length} widths:\n${broken.join("\n")}`,
    ).toEqual([])
  })
})
