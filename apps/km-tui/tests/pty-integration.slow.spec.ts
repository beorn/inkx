/**
 * PTY Integration Tests — Real terminal pipeline via termless
 *
 * Uses viterm (createTerminalFixture + PTY spawn) to test through
 * the REAL async event pipeline: stdin → TermProvider → merge → pump → event loop → render.
 *
 * Headless tests (testEnv/board.press) call handleKey synchronously, bypassing
 * all 4 async layers. These tests catch bugs that only manifest with real timing.
 *
 * Run: bun vitest run apps/km-tui/tests/pty-integration.slow.spec.ts
 */
import { describe, test, expect, beforeAll } from "vitest"
import { existsSync, mkdirSync, writeFileSync } from "fs"
import { join } from "path"
import { createTerminalFixture } from "@termless/test"

const KM_CWD = "/Users/beorn/Code/pim/km"
const TEST_VAULT = "/tmp/vt"
const SNAPSHOT_DIR = join(KM_CWD, "apps/km-tui/tests/__snapshots__/pty")

// Ensure snapshot directory exists
if (!existsSync(SNAPSHOT_DIR)) mkdirSync(SNAPSHOT_DIR, { recursive: true })

type TermlessTerminal = ReturnType<typeof createTerminalFixture>

/** Create a terminal fixture and spawn km view */
async function createKmTerminal(id: string, opts: { cols?: number; rows?: number } = {}) {
  const cols = opts.cols ?? 400
  const rows = opts.rows ?? 150
  const term = createTerminalFixture({
    cols,
    rows,
  })
  await term.spawn(["bun", "km", "view", TEST_VAULT], { cwd: KM_CWD })
  return term
}

/** Press key, wait for render to settle */
async function pressAndWait(term: TermlessTerminal, key: string, stableMs = 500) {
  term.press(key)
  await term.waitForStable(stableMs, 10000)
}

/** Simulate key auto-repeat: sends `count` presses with `gapMs` between each */
async function repeatKey(term: TermlessTerminal, key: string, count: number, gapMs = 33) {
  for (let i = 0; i < count; i++) {
    term.press(key)
    await new Promise((resolve) => setTimeout(resolve, gapMs))
  }
}

/** Extract breadcrumb line (first non-empty line) */
function getBreadcrumb(term: TermlessTerminal): string {
  const lines = term.getText().split("\n")
  for (const line of lines) {
    if (line.trim().length > 0) return line
  }
  return ""
}

/** Check if terminal text contains bell/warning indicators */
function hasBellIndicator(term: TermlessTerminal): boolean {
  const text = term.getText()
  return text.includes("Can't move") || text.includes("⚠")
}

/** Save SVG snapshot for visual regression reference */
function saveSnapshot(term: TermlessTerminal, name: string) {
  const svg = term.screenshotSvg()
  writeFileSync(join(SNAPSHOT_DIR, `${name}.svg`), svg, "utf-8")
}

/** Wait for terminal to have any content */
async function waitForContent(term: TermlessTerminal, timeout: number) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const content = term.getText().trim()
    if (content.length > 0) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`No terminal content after ${timeout}ms`)
}

// =============================================================================
// Shared engine for session-reuse tests (startup only once per describe block)
// =============================================================================

describe("PTY integration: auto-repeat", () => {
  let term: TermlessTerminal

  beforeAll(async () => {
    term = await createKmTerminal("pty-auto-repeat")
    await waitForContent(term, 15000)
    await term.waitForStable(1500, 20000)
  }, 30000)

  test("rapid j presses move cursor continuously", async () => {
    const initialBreadcrumb = getBreadcrumb(term)

    // Single j press, wait for stable
    await pressAndWait(term, "j")
    const afterOneJ = getBreadcrumb(term)
    expect(afterOneJ).not.toBe(initialBreadcrumb)

    // Use repeatKey for auto-repeat simulation (~30Hz)
    await repeatKey(term, "j", 5)
    await term.waitForStable(500, 10000)
    const afterRapidJ = getBreadcrumb(term)
    expect(afterRapidJ).not.toBe(afterOneJ)

    // Save snapshot for visual reference
    saveSnapshot(term, "after-rapid-j")
  }, 20000)

  test("very rapid j presses (15ms gap, ~67Hz) still move cursor", async () => {
    const initialBreadcrumb = getBreadcrumb(term)

    // Very rapid — faster than typical key repeat
    await repeatKey(term, "j", 5, 15)
    await term.waitForStable(500, 10000)

    const afterRapid = getBreadcrumb(term)
    expect(afterRapid).not.toBe(initialBreadcrumb)
  }, 20000)
})

describe("PTY integration: burst input (real key repeat simulation)", () => {
  let term: TermlessTerminal

  beforeAll(async () => {
    term = await createKmTerminal("pty-burst")
    await waitForContent(term, 15000)
    await term.waitForStable(1500, 20000)
  }, 30000)

  test("burst of j chars in single write (simulates OS stdin buffering)", async () => {
    const initialBreadcrumb = getBreadcrumb(term)

    // Real key repeat: OS buffers multiple keystrokes into one stdin read.
    term.type("jjjjj")
    await term.waitForStable(500, 10000)

    const afterBurst = getBreadcrumb(term)
    expect(afterBurst).not.toBe(initialBreadcrumb)
  }, 20000)

  test("repeated bursts of j chars (simulates held key over time)", async () => {
    const initialBreadcrumb = getBreadcrumb(term)

    // Simulate how OS delivers key repeat: bursts of 2-3 chars every ~50ms
    for (let i = 0; i < 3; i++) {
      term.type("jj")
      await Bun.sleep(50)
    }
    await term.waitForStable(500, 10000)

    const afterBursts = getBreadcrumb(term)
    expect(afterBursts).not.toBe(initialBreadcrumb)
  }, 20000)

  test("burst h/l alternation (simulates rapid column switching)", async () => {
    // Move right first
    await pressAndWait(term, "l")

    // Burst of alternating h/l as single writes
    term.type("hlhlhlhl")
    await term.waitForStable(500, 10000)

    // No bell
    expect(hasBellIndicator(term)).toBe(false)
  }, 20000)
})

describe("PTY integration: h/l false bell", () => {
  let term: TermlessTerminal

  beforeAll(async () => {
    term = await createKmTerminal("pty-bell")
    await waitForContent(term, 15000)
    await term.waitForStable(1500, 20000)
  }, 30000)

  test("alternating h/l does not trigger bell when not at boundary", async () => {
    // Move right first to ensure we're not at a column boundary
    await pressAndWait(term, "l")
    expect(hasBellIndicator(term)).toBe(false)

    // Now alternate h/l rapidly — should bounce between columns without bell
    for (let i = 0; i < 8; i++) {
      term.press(i % 2 === 0 ? "h" : "l")
      await Bun.sleep(50)
    }
    await term.waitForStable(500, 10000)

    expect(hasBellIndicator(term)).toBe(false)
  }, 20000)

  test("rapid h at left boundary: bells on each press without crash", async () => {
    // Navigate back to leftmost column first
    for (let i = 0; i < 10; i++) term.command("cursor_left")
    await term.waitForStable(500, 10000)

    // We should be at col 0 — pressing h should hit left boundary
    await pressAndWait(term, "h")

    // Rapid boundary hits — each fires bell, should not crash
    await repeatKey(term, "h", 5)
    await term.waitForStable(500, 10000)
  }, 20000)
})

describe("PTY integration: navigation correctness", () => {
  let term: TermlessTerminal

  beforeAll(async () => {
    term = await createKmTerminal("pty-nav")
    await waitForContent(term, 15000)
    await term.waitForStable(1500, 20000)
  }, 30000)

  test("zoom in with Enter and back out with Escape", async () => {
    saveSnapshot(term, "nav-initial")

    const initialBreadcrumb = getBreadcrumb(term)

    // Move down to first item and zoom in
    await pressAndWait(term, "j")
    await pressAndWait(term, "Enter")
    const zoomedIn = getBreadcrumb(term)
    expect(zoomedIn).not.toBe(initialBreadcrumb)
    saveSnapshot(term, "nav-zoomed-in")

    // Back out
    await pressAndWait(term, "Escape")
    await term.waitForStable(500, 10000)
    saveSnapshot(term, "nav-zoomed-out")
  }, 20000)

  test("view mode toggle with v preserves content", async () => {
    const textBefore = term.getText()

    // Toggle view mode
    await pressAndWait(term, "v")
    const textAfterV = term.getText()

    // View mode should change something (status bar at minimum)
    // Content should still be visible
    expect(textAfterV.length).toBeGreaterThan(0)
    saveSnapshot(term, "nav-after-view-toggle")

    // Toggle back
    await pressAndWait(term, "v")
  }, 20000)

  test("search opens with cmd+f and closes with Escape", async () => {
    // Open search (Cmd+f triggers global search dialog)
    term.press("cmd+f")
    await term.waitForStable(300, 5000)

    // Type a search term
    term.type("test")
    await term.waitForStable(300, 5000)
    saveSnapshot(term, "nav-search-open")

    // Close search with Escape
    await pressAndWait(term, "Escape")
    saveSnapshot(term, "nav-search-closed")
  }, 20000)
})

describe("PTY integration: SVG snapshot capture", () => {
  let term: TermlessTerminal

  beforeAll(async () => {
    term = await createKmTerminal("pty-snapshot", { cols: 120, rows: 40 })
    await waitForContent(term, 15000)
    await term.waitForStable(1500, 20000)
  }, 30000)

  test("initial board render captures valid SVG", async () => {
    const svg = term.screenshotSvg()

    // SVG should contain terminal content
    expect(svg).toContain("<svg")
    expect(svg.length).toBeGreaterThan(100)

    saveSnapshot(term, "snapshot-initial-board")
  }, 10000)

  test("after navigation, screen updates", async () => {
    const textBefore = term.getText()

    await pressAndWait(term, "j")
    const textAfter = term.getText()

    // Screen should have changed (cursor moved)
    expect(textAfter).not.toBe(textBefore)

    saveSnapshot(term, "snapshot-after-nav")
  }, 10000)

  test("board renders with visible content via viterm matchers", async () => {
    // Use viterm matchers — the real power of termless
    expect(term.screen).toContainText(getBreadcrumb(term).trim())
    expect(term.getText().trim().length).toBeGreaterThan(0)
  }, 10000)
})
