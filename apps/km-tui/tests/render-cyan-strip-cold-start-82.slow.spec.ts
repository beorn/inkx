/**
 * Regression: cold-start cyan strip at 82×75 (no interaction).
 *
 * Bead: @km/silvery/render-light-blue-bg-strip-residue, Round 11.
 *
 * The bug, distilled: at 82×75 against ~/Bear/Vault, Frame 1 emits 14 cells
 * of $mutedbg bg (rgb 52,58,70) with empty content at row 72 (1-indexed)
 * cols 65-78. The cells correspond to the natural-flow position of the
 * inline-code child `~vault/@inbox/` from RESOLVER.md when its parent text
 * wraps into multiple lines.
 *
 * This test loads the real vault at the user's exact terminal size and
 * scans Frame 1 for any cells with bg=$mutedbg AND empty/space char.
 * Such cells are the bug.
 */

import { describe, test, expect } from "vitest"
import { existsSync } from "node:fs"
import { testBoard } from "./helpers/real-board.ts"
import { deriveTheme, defaultDarkScheme } from "@silvery/ansi"
import { nord, tokyoNight } from "@silvery/theme/schemes"
import { diagnosticTheme } from "@silvery/test"

const nordTheme = deriveTheme(nord)
const tokyoNightTheme = deriveTheme(tokyoNight)
const defaultDarkTheme = deriveTheme(defaultDarkScheme)

const REAL_VAULT = "/Users/beorn/Bear/Vault"
const haveVault = existsSync(REAL_VAULT)

const skipIf = !haveVault

function rgbFromCell(bg: unknown): { r: number; g: number; b: number } | null {
  if (!bg) return null
  if (typeof bg === "string" && bg.startsWith("#") && bg.length === 7) {
    return {
      r: parseInt(bg.slice(1, 3), 16),
      g: parseInt(bg.slice(3, 5), 16),
      b: parseInt(bg.slice(5, 7), 16),
    }
  }
  if (typeof bg === "object" && bg !== null && "r" in bg) {
    return bg as { r: number; g: number; b: number }
  }
  return null
}

/**
 * Targeted strip detector — finds cells with bg=$mutedbg (legacy code-variant
 * background) AND no character content. The cyan-strip bug emitted exactly
 * this pattern: inline-code bg-paint leaking past its content into trailing
 * whitespace.
 *
 * The bug fix (silvery `applyBgSegmentsToLine` clip-parity) ensures bg paint
 * never extends past the rendered char run, so this set is empty post-fix.
 */
function findMutedbgPhantoms(
  app: { width: number; height: number; cell: (c: number, r: number) => { bg: unknown; char: string } },
  mutedbgRgb: { r: number; g: number; b: number },
): Array<{ col: number; row: number }> {
  const hits: Array<{ col: number; row: number }> = []
  for (let r = 0; r < app.height; r++) {
    for (let c = 0; c < app.width; c++) {
      const cell = app.cell(c, r)
      const bg = rgbFromCell(cell.bg)
      if (!bg) continue
      if (bg.r !== mutedbgRgb.r || bg.g !== mutedbgRgb.g || bg.b !== mutedbgRgb.b) continue
      // Skip cells with real character content (legit inline-code paints)
      if (cell.char && cell.char !== " ") continue
      hits.push({ col: c, row: r })
    }
  }
  return hits
}

function mutedbgOf(theme: { flat?: Record<string, unknown>; mutedbg?: unknown }): {
  r: number
  g: number
  b: number
} {
  const flat = (theme as { flat?: Record<string, unknown> }).flat ?? theme
  const candidate = (flat as Record<string, unknown>)["mutedbg"] ?? (theme as { mutedbg?: unknown }).mutedbg
  const rgb = rgbFromCell(candidate)
  if (!rgb) throw new Error(`Could not resolve $mutedbg from theme: ${JSON.stringify(candidate)}`)
  return rgb
}

describe.skipIf(skipIf)("regression: cyan-strip cold-start 82x75 (P1)", () => {
  // Multi-theme matrix — the bug evaded detection for 11 rounds because the
  // default test theme (ansi16) collapsed $mutedbg to canvas. Run across
  // diagnostic + real-world themes so any bg-leak is visible regardless of
  // which token paints it.
  // Multi-theme matrix — the bug evaded detection for 11 rounds because
  // tests defaulted to ansi16 where $mutedbg = canvas (line 297 of
  // deriveAnsi16Theme: `mutedbg: p.black` = scheme.background). The
  // detector cannot distinguish "canvas cell" from "leaked mutedbg cell"
  // when the colors are identical. The diagnostic theme exists to ensure
  // every distinct token resolves to a distinct visible RGB.
  //
  // ansi16-dark is intentionally NOT in this matrix — it's the structural
  // collapse this regression-net is built to detect-around-of, not against.
  const themeMatrix = [
    { name: "diagnostic", theme: diagnosticTheme },
    { name: "nord", theme: nordTheme },
    { name: "tokyo-night", theme: tokyoNightTheme },
    { name: "default-dark", theme: defaultDarkTheme },
  ]

  test.each(themeMatrix)("no phantom $mutedbg cells in Frame 1 ($name)", { timeout: 60000 }, async ({ theme }) => {
    const board = await testBoard(REAL_VAULT, {
      columns: 82,
      rows: 75,
      parseDeferred: true,
      theme,
    })
    const app = board._result
    expect(app.width).toBe(82)
    expect(app.height).toBe(75)

    const mutedbg = mutedbgOf(theme as { flat?: Record<string, unknown>; mutedbg?: unknown })
    const phantoms = findMutedbgPhantoms(app, mutedbg)
    expect(phantoms).toEqual([])
  })
})
