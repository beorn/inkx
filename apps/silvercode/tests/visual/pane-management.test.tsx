/**
 * Pane management — visual regression for the minimal-chrome layout.
 *
 * Bead: km-silvercode.pane-management
 *
 * The acceptance constraint that this file gates: the v1 grid renders
 * panes separated by a SINGLE column of `│` glyphs (one divider per
 * gap), the active pane shows a left-edge `▎` accent bar, and inactive
 * panes paint NO border / outline / header strip. Anything that
 * regresses to "borders around every pane" must be caught here.
 *
 * Wiring follows the queue-cursor.test.tsx pattern: real `<App/>` driven
 * through `createTermless` + `run()` so the App's `useScopeEffect` resolves
 * properly under silvery's app-root scope. createRenderer alone bypasses
 * scope — see `useScope() called without a <ScopeProvider> ancestor` in
 * the alternate path.
 */

import type { AgentSession } from "@km/agent-harness"
import React from "react"
import { describe, expect, test } from "vitest"
import { createTermless } from "@silvery/test"
import { run } from "silvery/runtime"
import { App } from "../../src/App.tsx"
import { createFakeSession, type ScriptedFakeSession } from "../../src/test/fake-session.ts"
import { installFakes } from "../../src/test/fake-boundaries.ts"

const COLS = 160
const ROWS = 40

const settle = (ms = 150) => new Promise<void>((r) => setTimeout(r, ms))

type TermlessTerm = ReturnType<typeof createTermless>

async function bootGrid(layout: "single" | "grid-2" | "grid-4" = "grid-2"): Promise<{
  term: TermlessTerm
  fakes: ScriptedFakeSession[]
  handle: Awaited<ReturnType<typeof run>>
  fakesInstalled: ReturnType<typeof installFakes>
}> {
  const fakesInstalled = installFakes({})
  const fakes = [createFakeSession(), createFakeSession(), createFakeSession(), createFakeSession()]
  let i = 0
  const term = createTermless({ cols: COLS, rows: ROWS })
  const handle = await run(
    <App
      cwd="/tmp/silvercode-test-panes"
      bare
      layout={layout}
      track="claude"
      model="claude-sonnet-4-6"
      spawnFactory={() => fakes[i++ % fakes.length]! as unknown as AgentSession}
    />,
    term,
  )
  // Boot: spawnSession resolves on a microtask; welcome screen wants
  // a few render passes to settle.
  await settle(200)
  return { term, fakes, handle, fakesInstalled }
}

describe("pane management — minimal chrome", () => {
  test("two panes render with a single divider column between them (no per-pane borders)", async () => {
    const { term, handle, fakesInstalled } = await bootGrid("grid-2")
    try {
      const text = term.screen?.getText() ?? ""

      // Divider present — the pane-grid emits a vertical column of `│`
      // between adjacent panes. Two panes → at least one divider
      // column.
      expect(text.includes("│")).toBe(true)

      // No per-pane borders. A naive implementation might wrap each
      // SessionCard in `<Box borderStyle="single">` — that would
      // surface single-line corner glyphs. With the chrome-minimal
      // design, none of these should appear.
      expect(text).not.toContain("┌─")
      expect(text).not.toContain("─┐")
      expect(text).not.toContain("└─")
      expect(text).not.toContain("─┘")
    } finally {
      handle.unmount()
      fakesInstalled.dispose()
    }
  })

  test("active pane renders the left-edge accent bar", async () => {
    const { term, handle, fakesInstalled } = await bootGrid("grid-2")
    try {
      // SessionCard paints `▎` in $accent on the focused pane's left
      // edge — that glyph IS the active-pane visual cue. Its presence
      // is the contract.
      expect(term.screen?.getText() ?? "").toContain("▎")
    } finally {
      handle.unmount()
      fakesInstalled.dispose()
    }
  })

  test("no per-pane header strip is rendered", async () => {
    const { term, handle, fakesInstalled } = await bootGrid("grid-2")
    try {
      // A header strip would carry add / close / minimize buttons. The
      // bead spec defers headers to v2 — these glyphs / labels must NOT
      // appear today. Asserting on `[+]` / `[×]` / `[_]` is a stable
      // proxy for "no chrome on the pane top".
      const text = term.screen?.getText() ?? ""
      expect(text).not.toContain("[+]")
      expect(text).not.toContain("[×]")
      expect(text).not.toContain("[_]")
    } finally {
      handle.unmount()
      fakesInstalled.dispose()
    }
  })

  test("inactive pane has no border/outline of its own", async () => {
    const { term, handle, fakesInstalled } = await bootGrid("grid-2")
    try {
      // A naive implementation might wrap each SessionCard in a
      // `<Box borderStyle="single">`. That would emit four corner
      // glyphs PER pane (≥8 corners with 2 panes). With the chrome-
      // minimal design we expect 0 — at most 1 from some unrelated UI
      // element drawing a corner. We're really guarding against the
      // "8+ corners" regression.
      const text = term.screen?.getText() ?? ""
      const cornerGlyphs = (text.match(/[┌┐└┘]/g) ?? []).length
      expect(cornerGlyphs).toBeLessThan(2)
    } finally {
      handle.unmount()
      fakesInstalled.dispose()
    }
  })
})
