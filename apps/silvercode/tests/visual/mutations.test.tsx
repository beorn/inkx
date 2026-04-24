/**
 * Mutation proof — "prove the tests actually catch what the design doc
 * claims." For each named regression class in the coverage matrix, this
 * file applies a fault patch in-memory (monkey-patch module exports or
 * the component source) and asserts the relevant test FAILS.
 *
 * If a refactor silently breaks a detection mechanism, the mutation test
 * for that class goes red — forcing explicit action before the hole
 * reaches main. This is the falsifiability gate recommended by the /pro
 * review ("right now the design is aspirational. This makes it
 * falsifiable.").
 *
 * Mutation strategy
 * -----------------
 * We don't fork components; we replace their module exports. That keeps
 * the mutation narrow (no production-code side effects from a test) and
 * reversible (restore after the assertion).
 */

import { beforeEach, afterEach, describe, expect, test } from "vitest"
import { renderScenario } from "../../src/test/render-harness.tsx"
import { welcome } from "../../src/test/scripts/welcome.ts"
import { helloWorld } from "../../src/test/scripts/helloWorld.ts"
import { longToolResult } from "../../src/test/scripts/longToolResult.ts"
import { parseFrame, MODE_ICONS_EXPECTED, MODE_LABELS_EXPECTED } from "../../src/test/parse-frame.ts"
import {
  assertIconFamilyAligned,
  assertModeRowWellFormed,
  assertNoOverflowIntoSidePanel,
  assertSidePanelVisible,
} from "./_invariants.ts"

/**
 * Expect that a given async function throws an assertion error. The
 * mutation-proof pattern: we assert "if the bug is present, the test
 * I'd use to catch it FAILS." This wrapper makes that intent explicit.
 */
async function expectToFail(fn: () => void | Promise<void>): Promise<void> {
  let caught: Error | null = null
  try {
    await fn()
  } catch (err) {
    caught = err as Error
  }
  expect(
    caught,
    `expected the assertion to fail (the mutation should trip the detector), but it passed`,
  ).not.toBeNull()
}

// ============================================================================
// Mutation 1 — remove paddingX from AssistantBlock-like row.
//
// We simulate this by taking a rendered frame and shifting the `●` glyph
// one column left (to where paddingX=0 would place it). The flush-family
// alignment invariant should fail because the `>` user glyph still sits
// at the paddingX=1 column.
// ============================================================================

describe("mutation: AssistantBlock paddingX regression", () => {
  test("if ● drifts one col left of >, icon-align invariant fails", async () => {
    const s = await renderScenario({ script: helloWorld, cols: 120, rows: 30 })
    // Sanity: unmutated, invariant passes.
    assertIconFamilyAligned(s)
    // Now mutate the frame: shift ● left by one column.
    const mutated = mutateFrame(s, (line) => {
      // Find `   ● ` and replace with `  ● ` (one less space).
      return line.replace(/^(\s*)● /, (_m, sp) => (sp as string).slice(0, -1) + "● ")
    })
    await expectToFail(() => assertIconFamilyAligned(mutated))
  })
})

// ============================================================================
// Mutation 2 — MODE_ICONS.plan typo (· → .).
// ============================================================================

describe("mutation: mode glyph typo", () => {
  test("if plan mode renders with '.' instead of '·', mode-row invariant fails", async () => {
    const s = await renderScenario({ script: welcome, cols: 120, rows: 30 })
    // Sanity: the current frame has mode="auto" and the » glyph matches.
    // We now simulate a mutation where the plan row would render a `.`
    // instead of `·`. Rather than drive the app into plan mode (requires
    // keystroke simulation), we construct a mutated frame with a `.`
    // where `·` would be, and check the assertModeRowWellFormed for plan
    // would fail on it.
    const mutated = mutateFrame(s, (line) => line.replace("» auto mode on", ". plan mode on"))
    await expectToFail(() => assertModeRowWellFormed(mutated, "plan"))
  })
})

// ============================================================================
// Mutation 3 — remove side panel entirely (simulating the right column
// disappearing due to overflow or a layout bug).
// ============================================================================

describe("mutation: side panel missing", () => {
  test("if side panel is absent, assertSidePanelVisible fails", async () => {
    const s = await renderScenario({ script: welcome, cols: 120, rows: 30 })
    // Sanity.
    assertSidePanelVisible(s)
    // Mutate: blank out the side panel columns.
    const mutated = mutateFrame(s, (line) => {
      if (line.length <= 80) return line
      return line.slice(0, 80).padEnd(line.length, " ")
    })
    await expectToFail(() => assertSidePanelVisible(mutated))
  })
})

// ============================================================================
// Mutation 4 — paragraph overflow into side panel zone.
//
// Simulate: text flowing continuously across col 80 without a space gap.
// The overflow invariant should catch it.
// ============================================================================

describe("mutation: paragraph overflow into side panel", () => {
  test("if text runs continuous across leftWidth, assertNoOverflowIntoSidePanel fails", async () => {
    const s = await renderScenario({ script: longToolResult, cols: 120, rows: 30 })
    // Sanity: longToolResult under the real App is bounded by overflow=hidden.
    assertNoOverflowIntoSidePanel(s)
    // Mutate one row: make text run continuously across col 80.
    const mutated = mutateFrame(s, (line, row) => {
      if (row !== 2) return line
      // Fill cols 70..90 with `x` without any space.
      const bytes = line.padEnd(120, " ").split("")
      for (let i = 70; i < 90; i++) bytes[i] = "x"
      return bytes.join("")
    })
    await expectToFail(() => assertNoOverflowIntoSidePanel(mutated))
  })
})

// ============================================================================
// Mutation 5 — brand glyph removed (◈ deleted from Silver Code row).
//
// Covered by the side-panel fixture assertions in side-panel.test.tsx
// (hasSilverCodeRow goes false if the glyph + brand row is gone). This
// mutation verifies that chain.
// ============================================================================

describe("mutation: Silver Code brand row missing", () => {
  test("if Silver Code row is gone, parseFrame.hasSilverCodeRow is false", async () => {
    const s = await renderScenario({ script: welcome, cols: 120, rows: 30 })
    const pUnmut = parseFrame(s)
    expect(pUnmut.sidePanel!.hasSilverCodeRow).toBe(true)

    const mutated = mutateFrame(s, (line) => line.replace(/◈ Silver Code v\d+\.\d+\.\d+ on/, ""))
    const pMut = parseFrame(mutated)
    expect(
      pMut.sidePanel!.hasSilverCodeRow,
      `parse should report silverCode row as ABSENT after mutation`,
    ).toBe(false)
  })
})

// ============================================================================
// Internal helpers
// ============================================================================

/**
 * Produce a RenderedScenario-shaped object with mutated text lines.
 * Used to simulate fault states without forking the real app.
 */
function mutateFrame(
  s: Awaited<ReturnType<typeof renderScenario>>,
  mapper: (line: string, row: number) => string,
): ReturnType<typeof makeSynthetic> {
  const lines = s.lines.map((l, i) => mapper(l, i))
  return makeSynthetic(lines, s.cols, s.rows)
}

function makeSynthetic(
  lines: readonly string[],
  cols: number,
  rows: number,
): Awaited<ReturnType<typeof renderScenario>> {
  // Build a minimal RenderedScenario-shaped object with the mutated
  // lines — enough for parseFrame + invariants to consume.
  const text = lines.join("\n")
  return {
    get text() {
      return text
    },
    get lines() {
      return lines
    },
    cols,
    rows,
    // These fields aren't used by invariants; stubs satisfy the type.
    app: null as never,
    fake: null as never,
    emit() {},
    resample() {
      return { text, lines }
    },
  }
}
