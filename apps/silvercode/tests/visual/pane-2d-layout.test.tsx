/**
 * Pane 2D layout — visual regression for the binary-split tree.
 *
 * Bead: km-silvercode.pane-2d-layout
 *
 * Asserts the 2D-grid contract that distinguishes v2 from v1's flat-row
 * PaneGrid:
 *
 *   1. A horizontal split (Ctrl+W s) renders a `─` row divider.
 *   2. Mixed splits (Ctrl+W v then Ctrl+W s on the right pane) render
 *      both a `│` column divider AND a `─` row divider — i.e. the tree
 *      grew a column-split as the right child of a row-split.
 *   3. Ctrl+W z (zoom) hides ALL dividers across the 2D tree — the
 *      focused pane fills the entire grid area.
 *
 * Wiring follows pane-management.test.tsx: real `<App/>` driven through
 * createTermless so silvery's app-root scope is in place. We feed key
 * bytes (`\x17` = Ctrl+W, `\x1a` = Ctrl+Z, etc) as if typed at the
 * terminal — same path a real user hits.
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

const settle = (ms = 200) => new Promise<void>((r) => setTimeout(r, ms))

type TermlessTerm = ReturnType<typeof createTermless>

function feed(term: TermlessTerm, data: string): void {
  ;(term as unknown as { sendInput: (s: string) => void }).sendInput(data)
}

// ASCII control bytes — what the terminal driver produces when the user
// holds Ctrl and presses the matching letter. Ctrl+W = ETB (0x17). We
// don't send a raw Ctrl+Z anywhere because it would SIGTSTP the host
// process; the chord follow-up is the literal `z` character.
const CTRL_W = "\x17"

async function bootGrid(layout: "single" | "grid-2" = "single"): Promise<{
  term: TermlessTerm
  fakes: ScriptedFakeSession[]
  handle: Awaited<ReturnType<typeof run>>
  fakesInstalled: ReturnType<typeof installFakes>
}> {
  const fakesInstalled = installFakes({})
  // Provision enough fakes for any chord-driven splits the test runs.
  const fakes = Array.from({ length: 6 }, () => createFakeSession())
  let i = 0
  const term = createTermless({ cols: COLS, rows: ROWS })
  const handle = await run(
    <App
      cwd="/tmp/silvercode-test-2d"
      bare
      layout={layout}
      track="claude"
      model="claude-sonnet-4-6"
      spawnFactory={() => fakes[i++ % fakes.length]! as unknown as AgentSession}
    />,
    term,
  )
  await settle(200)
  return { term, fakes, handle, fakesInstalled }
}

describe("pane management — 2D binary-split tree", () => {
  test("Ctrl+W s — horizontal split renders a row divider (`─`)", async () => {
    const { term, handle, fakesInstalled } = await bootGrid("single")
    try {
      // Single pane initial → Ctrl+W s creates a column-split (top + bottom).
      feed(term, CTRL_W)
      // Tiny gap so the chord state has time to settle in React before
      // the follow-up byte arrives — the chord setter is async.
      await settle(20)
      feed(term, "s")
      // splitFocusedPane awaits spawnSession; give it a tick.
      await settle(250)
      const text = term.screen?.getText() ?? ""

      // Horizontal divider — the column-split renders a row of `─`. v1's
      // 1D PaneGrid only emits `│`, so this glyph proves the 2D path.
      expect(text).toContain("─")

      // Per-pane border regression guard — same constraint as v1.
      expect(text).not.toContain("┌─")
      expect(text).not.toContain("─┐")
    } finally {
      handle.unmount()
      fakesInstalled.dispose()
    }
  })

  test("Ctrl+W v then Ctrl+W s — mixed split renders both `│` and `─` dividers", async () => {
    const { term, handle, fakesInstalled } = await bootGrid("single")
    try {
      // 1) Vertical split (row-split): pane A | pane B (B becomes focused).
      feed(term, CTRL_W)
      await settle(20)
      feed(term, "v")
      await settle(250)

      // 2) Horizontal split on the now-focused right pane (B): the right
      //    child of the row-split becomes a column-split (B-top / C-bot).
      feed(term, CTRL_W)
      await settle(20)
      feed(term, "s")
      await settle(250)

      const text = term.screen?.getText() ?? ""

      // The root row-split contributes `│`; the inner column-split
      // contributes `─`. Both must be present — that's the 2D contract.
      expect(text).toContain("│")
      expect(text).toContain("─")

      // Active pane accent bar still drawn (chrome constraint unchanged).
      expect(text).toContain("▎")
    } finally {
      handle.unmount()
      fakesInstalled.dispose()
    }
  })

  test("Ctrl+W z — zoom hides dividers across the 2D tree", async () => {
    const { term, handle, fakesInstalled } = await bootGrid("single")
    try {
      // Build a 2D tree: vsplit, then hsplit on the right pane.
      feed(term, CTRL_W)
      await settle(20)
      feed(term, "v")
      await settle(250)
      feed(term, CTRL_W)
      await settle(20)
      feed(term, "s")
      await settle(250)

      // Sanity: dividers exist before zoom.
      const before = term.screen?.getText() ?? ""
      expect(before).toContain("│")
      expect(before).toContain("─")

      // Zoom toggle — Ctrl+W z. (Sending Ctrl+Z directly would suspend
      // the host process; the app's chord wires the literal letter `z`
      // after the Ctrl+W prefix.)
      feed(term, CTRL_W)
      await settle(20)
      feed(term, "z")
      await settle(250)

      const after = term.screen?.getText() ?? ""
      // Zoom mode renders only the focused pane full-area — no
      // pane-to-pane dividers should be present anywhere in the grid.
      // We're guarding the row-divider specifically because a stray `─`
      // is the regression we'd see if zoom skipped the column-split case
      // (the more interesting v2 path).
      expect(after).not.toContain("─")
      // No leftover horizontal divider char anywhere on screen, even if
      // a `│` happens to appear in some other UI element.
      // We don't assert `not.toContain("│")` because the side panel and
      // other chrome MAY emit lone `│` glyphs in unrelated contexts.
      // The focused pane content is the load-bearing assertion that
      // a single SessionCard now occupies the whole grid.
      expect(after).toContain("▎")
    } finally {
      handle.unmount()
      fakesInstalled.dispose()
    }
  })
})
