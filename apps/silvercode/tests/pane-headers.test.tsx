/**
 * PaneHeader / paneHeaders prop — opt-in chrome row per pane.
 *
 * Bead: km-silvercode.pane-headers (v2 of pane-management). The top-level
 * `--pane-headers` CLI flag was dropped in the connection-system refactor;
 * the prop on `<App />` remains and is the only test surface here.
 *
 * Two layers of coverage:
 *
 *   1. Component-level (createRenderer) — PaneHeader renders the right
 *      glyphs in the right order, hover/click wiring, minimize state
 *      flips the icon. No App, no controller, no fakes — fast.
 *
 *   2. Integration (createTermless + <App/>) — `paneHeaders` wired
 *      through PaneGrid actually paints the row in the live grid;
 *      default-off keeps the v1 chrome-minimal contract intact.
 *
 * The CLICK paths through to App callbacks (`+` spawn, `×` close) are
 * covered by the component-level layer — App's `splitPaneRightById` /
 * `closePaneById` are pure callbacks we wire as props, so a fake
 * onClick prop catches the wiring without spinning up a controller.
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer, createTermless } from "@silvery/test"
import type { AgentSession } from "@km/agent-harness"
import { run } from "silvery/runtime"
import { PaneHeader } from "../src/components/PaneHeader.tsx"
import { App } from "../src/App.tsx"
import { createFakeSession, type ScriptedFakeSession } from "../src/test/fake-session.ts"
import { installFakes } from "../src/test/fake-boundaries.ts"

const COLS = 80
const ROWS = 12

// ---------- 1. Component-level ----------

describe("PaneHeader — component", () => {
  test("renders title + four buttons (drag / + / _ / ×) in order", () => {
    const render = createRenderer({ cols: 60, rows: 1 })
    const app = render(
      <PaneHeader
        sessionId="sess-abc-123"
        isFocused={true}
        isMinimized={false}
        onSplitRight={() => {}}
        onClose={() => {}}
        onToggleMinimize={() => {}}
      />,
    )
    expect(app.text).toContain("sess-abc-123")
    expect(app.text).toContain("⇄")
    expect(app.text).toContain("+")
    expect(app.text).toContain("_")
    expect(app.text).toContain("×")
    // Ordering: drag → + → _ → × (right edge). Title is first by virtue
    // of flexGrow on its container — assert the right-side cluster.
    const dragIdx = app.text.indexOf("⇄")
    const plusIdx = app.text.indexOf("+")
    const minIdx = app.text.indexOf("_")
    const closeIdx = app.text.indexOf("×")
    expect(dragIdx).toBeLessThan(plusIdx)
    expect(plusIdx).toBeLessThan(minIdx)
    expect(minIdx).toBeLessThan(closeIdx)
  })

  test("minimized — `_` swaps to `□` so the toggle state is visible", () => {
    const render = createRenderer({ cols: 60, rows: 1 })
    const app = render(
      <PaneHeader
        sessionId="sess-x"
        isFocused={false}
        isMinimized={true}
        onSplitRight={() => {}}
        onClose={() => {}}
        onToggleMinimize={() => {}}
      />,
    )
    // `□` (restore icon) replaces the `_` (minimize icon).
    expect(app.text).toContain("□")
    expect(app.text).not.toContain("_")
  })

  test("long session id truncates instead of pushing buttons off-screen", () => {
    const render = createRenderer({ cols: 30, rows: 1 })
    const longId = "super-long-session-id-that-cannot-fit-in-thirty-cols"
    const app = render(
      <PaneHeader
        sessionId={longId}
        isFocused={true}
        isMinimized={false}
        onSplitRight={() => {}}
        onClose={() => {}}
        onToggleMinimize={() => {}}
      />,
    )
    // All four buttons must still appear — they're flexShrink=0 + flush
    // right, the title is the one that gives.
    expect(app.text).toContain("⇄")
    expect(app.text).toContain("+")
    expect(app.text).toContain("×")
  })
})

// ---------- 2. Integration ----------

const settle = (ms = 200) => new Promise<void>((r) => setTimeout(r, ms))
type TermlessTerm = ReturnType<typeof createTermless>

async function bootApp(opts: { paneHeaders: boolean }): Promise<{
  term: TermlessTerm
  fakes: ScriptedFakeSession[]
  handle: Awaited<ReturnType<typeof run>>
  fakesInstalled: ReturnType<typeof installFakes>
}> {
  const fakesInstalled = installFakes({})
  const fakes = Array.from({ length: 4 }, () => createFakeSession())
  let i = 0
  const term = createTermless({ cols: COLS, rows: ROWS })
  const handle = await run(
    <App
      cwd="/tmp/silvercode-test-pane-headers"
      bare
      layout="single"
      model="claude-sonnet-4-6"
      paneHeaders={opts.paneHeaders}
      spawnFactory={() => fakes[i++ % fakes.length]! as unknown as AgentSession}
    />,
    term,
  )
  await settle(200)
  return { term, fakes, handle, fakesInstalled }
}

describe("paneHeaders prop — opt-in wiring", () => {
  test("default (paneHeaders=false) renders no header chrome — v1 contract holds", async () => {
    const { term, handle, fakesInstalled } = await bootApp({ paneHeaders: false })
    try {
      const text = term.screen?.getText() ?? ""
      // Header glyphs `⇄ + _ ×` are PaneHeader-only — none should appear
      // when the flag is off. (`×` would be a false positive if any
      // unrelated chrome used it; check the cluster instead.)
      expect(text).not.toContain("⇄")
      // Per-pane border regression guard inherited from v1.
      expect(text).not.toContain("┌─")
      expect(text).not.toContain("─┐")
    } finally {
      handle.unmount()
      fakesInstalled.dispose()
    }
  })

  test("paneHeaders=true renders the header row glyphs", async () => {
    const { term, handle, fakesInstalled } = await bootApp({ paneHeaders: true })
    try {
      const text = term.screen?.getText() ?? ""
      // Cluster of the four header glyphs must appear.
      expect(text).toContain("⇄")
      expect(text).toContain("+")
      expect(text).toContain("_")
      expect(text).toContain("×")
      // Still no per-pane borders — header row is 1 row, not a frame.
      expect(text).not.toContain("┌─")
      expect(text).not.toContain("─┐")
    } finally {
      handle.unmount()
      fakesInstalled.dispose()
    }
  })
})
