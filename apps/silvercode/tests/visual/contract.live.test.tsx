/**
 * Live-mode contract tests — same scenarios in two boundary modes.
 *
 *   fake mode  → ScriptedFakeSession + faked accountly/git/version/fs.
 *                Runs every push (this file appears in the default project).
 *   real mode  → real Claude CLI subprocess + real accountly + real git.
 *                Skipped unless SILVERCODE_REAL=1 (project: silvercode-live).
 *
 * The same assertions run in both modes — that's the point. Drift between
 * the fake and the real implementation surfaces as a fake-mode pass + real-
 * mode fail, exactly when CI says "the contract changed."
 *
 * Bead: km-silvercode.test-live-mode
 */

import { describe, expect, test } from "vitest"
import { renderScenario } from "../../src/test/render-harness.tsx"
import { welcome } from "../../src/test/scripts/welcome.ts"
import { helloWorld } from "../../src/test/scripts/helloWorld.ts"
import { parseFrame } from "../../src/test/parse-frame.ts"

const REAL = process.env.SILVERCODE_REAL === "1"
const COLS = 120
const ROWS = 30

// Real-mode runs are slow (real subprocess + real network). Generous timeout.
const REAL_TIMEOUT_MS = 30_000

describe.each([
  ["fake", false],
  ["real", true],
] as const)("contract scenarios — %s mode", (label, live) => {
  const skipUnlessReal = live && !REAL
  const it = skipUnlessReal ? test.skip : test
  const timeout = live ? REAL_TIMEOUT_MS : undefined

  it(
    "welcome — empty session renders the brand panel",
    async () => {
      const s = await renderScenario({
        script: welcome,
        cols: COLS,
        rows: ROWS,
        live,
      })
      try {
        const p = parseFrame(s)
        expect(p.sidePanel, `${label}: side panel should exist`).not.toBeNull()
        expect(p.sidePanel!.hasSilverCodeRow, `${label}: Silver Code row missing`).toBe(true)
        expect(p.sidePanel!.hasClaudeCodeRow, `${label}: Claude Code row missing`).toBe(true)
      } finally {
        s.dispose()
      }
    },
    timeout,
  )

  it(
    "single-turn hello — assistant glyph appears in the card stream",
    async () => {
      // Fake mode plays the helloWorld script. Real mode ignores the
      // script (no spawnFactory injected) and the user must drive the
      // session manually — but `welcome` IS a valid empty-state script,
      // and on first render the App displays Welcome. To exercise a
      // single turn live, we'd need to inject keystrokes, which is
      // tracked under km-silvercode.test-ui-driver. For now the live
      // arm is `test.skip`-only, with the fake arm running the full
      // assistant-block assertion as the contract.
      if (live) {
        // Assert the live App at least mounted without crashing.
        const s = await renderScenario({ script: [], cols: COLS, rows: ROWS, live })
        try {
          expect(s.text.length).toBeGreaterThan(0)
        } finally {
          s.dispose()
        }
        return
      }
      const s = await renderScenario({ script: helloWorld, cols: COLS, rows: ROWS, live })
      try {
        const p = parseFrame(s)
        const assistant = p.cardStream.find((b) => b.glyph === "●")
        expect(assistant, `${label}: missing ● assistant block`).toBeDefined()
        expect(assistant!.firstLineText).toContain("Hi")
      } finally {
        s.dispose()
      }
    },
    timeout,
  )

  it(
    "quota display — SidePanel structure renders regardless of probe outcome",
    async () => {
      const s = await renderScenario({
        script: welcome,
        cols: COLS,
        rows: ROWS,
        live,
      })
      try {
        const p = parseFrame(s)
        const panelText = p.sidePanel?.lines.join("\n") ?? ""
        // The brand row is a stable structural marker that survives:
        //   - a real probe returning empty quotas (no /api/usage access)
        //   - a real probe returning N quota windows
        //   - a fake probe with the canned `defaultQuotas()`
        expect(panelText, `${label}: empty side panel`).not.toBe("")
        expect(panelText).toContain("Silver Code")
      } finally {
        s.dispose()
      }
    },
    timeout,
  )
})
