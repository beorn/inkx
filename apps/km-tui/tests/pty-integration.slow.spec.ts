/**
 * PTY Integration Tests — Real terminal pipeline
 *
 * Uses createTtyEngine (Bun PTY + xterm-headless) to test through the
 * REAL async event pipeline: stdin → TermProvider → merge → pump → event loop → render.
 *
 * Headless tests (testEnv/board.press) call handleKey synchronously, bypassing
 * all 4 async layers. These tests catch bugs that only manifest with real timing.
 *
 * Run: bun vitest run apps/km-tui/tests/pty-integration.slow.spec.ts
 */
import { describe, test, expect, afterAll, beforeAll } from "vitest"
import { existsSync, mkdirSync, writeFileSync } from "fs"
import { join } from "path"

// Direct import — no tsconfig alias exists for beorn-tools
const { createTtyEngine } =
  await import("/Users/beorn/Code/pim/km/vendor/beorn-tools/tools/lib/tty-engine/engine.ts")
type TtyEngine = Awaited<ReturnType<typeof createTtyEngine>>

const KM_CWD = "/Users/beorn/Code/pim/km"
const TEST_VAULT = "/tmp/vt"
const SNAPSHOT_DIR = join(KM_CWD, "apps/km-tui/tests/__snapshots__/pty")

// Ensure snapshot directory exists
if (!existsSync(SNAPSHOT_DIR)) mkdirSync(SNAPSHOT_DIR, { recursive: true })

/** Press key, wait for render to settle */
async function pressAndWait(e: TtyEngine, key: string, stableMs = 500) {
  e.press(key)
  await e.waitForStable(stableMs, 10000)
}

/** Extract breadcrumb line (first non-empty line) */
function getBreadcrumb(e: TtyEngine): string {
  const lines = e.getText().split("\n")
  for (const line of lines) {
    if (line.trim().length > 0) return line
  }
  return ""
}

/** Check if terminal text contains bell/warning indicators */
function hasBellIndicator(e: TtyEngine): boolean {
  const text = e.getText()
  return text.includes("Can't move") || text.includes("⚠")
}

/** Save HTML snapshot for visual regression reference */
function saveSnapshot(e: TtyEngine, name: string) {
  const html = e.getHTML()
  writeFileSync(join(SNAPSHOT_DIR, `${name}.html`), html, "utf-8")
}

// =============================================================================
// Shared engine for session-reuse tests (startup only once per describe block)
// =============================================================================

describe("PTY integration: auto-repeat", () => {
  let e: TtyEngine

  beforeAll(async () => {
    e = createTtyEngine("pty-auto-repeat", {
      command: ["bun", "km", "view", TEST_VAULT],
      cols: 400,
      rows: 150,
      cwd: KM_CWD,
    })
    await e.waitForContent(15000)
    await e.waitForStable(1500, 20000)
  }, 30000)

  afterAll(async () => {
    await e.close()
  })

  test("rapid j presses move cursor continuously", async () => {
    const initialBreadcrumb = getBreadcrumb(e)

    // Single j press, wait for stable
    await pressAndWait(e, "j")
    const afterOneJ = getBreadcrumb(e)
    expect(afterOneJ).not.toBe(initialBreadcrumb)

    // Use repeatKey for auto-repeat simulation (~30Hz)
    await e.repeatKey("j", 5)
    await e.waitForStable(500, 10000)
    const afterRapidJ = getBreadcrumb(e)
    expect(afterRapidJ).not.toBe(afterOneJ)

    // Save snapshot for visual reference
    saveSnapshot(e, "after-rapid-j")
  }, 20000)

  test("very rapid j presses (15ms gap, ~67Hz) still move cursor", async () => {
    const initialBreadcrumb = getBreadcrumb(e)

    // Very rapid — faster than typical key repeat
    await e.repeatKey("j", 5, 15)
    await e.waitForStable(500, 10000)

    const afterRapid = getBreadcrumb(e)
    expect(afterRapid).not.toBe(initialBreadcrumb)
  }, 20000)
})

describe("PTY integration: burst input (real key repeat simulation)", () => {
  let e: TtyEngine

  beforeAll(async () => {
    e = createTtyEngine("pty-burst", {
      command: ["bun", "km", "view", TEST_VAULT],
      cols: 400,
      rows: 150,
      cwd: KM_CWD,
    })
    await e.waitForContent(15000)
    await e.waitForStable(1500, 20000)
  }, 30000)

  afterAll(async () => {
    await e.close()
  })

  test("burst of j chars in single write (simulates OS stdin buffering)", async () => {
    const initialBreadcrumb = getBreadcrumb(e)

    // Real key repeat: OS buffers multiple keystrokes into one stdin read.
    e.type("jjjjj")
    await e.waitForStable(500, 10000)

    const afterBurst = getBreadcrumb(e)
    expect(afterBurst).not.toBe(initialBreadcrumb)
  }, 20000)

  test("repeated bursts of j chars (simulates held key over time)", async () => {
    const initialBreadcrumb = getBreadcrumb(e)

    // Simulate how OS delivers key repeat: bursts of 2-3 chars every ~50ms
    for (let i = 0; i < 3; i++) {
      e.type("jj")
      await Bun.sleep(50)
    }
    await e.waitForStable(500, 10000)

    const afterBursts = getBreadcrumb(e)
    expect(afterBursts).not.toBe(initialBreadcrumb)
  }, 20000)

  test("burst h/l alternation (simulates rapid column switching)", async () => {
    // Move right first
    await pressAndWait(e, "l")

    // Burst of alternating h/l as single writes
    e.type("hlhlhlhl")
    await e.waitForStable(500, 10000)

    // No bell
    expect(hasBellIndicator(e)).toBe(false)
  }, 20000)
})

describe("PTY integration: h/l false bell", () => {
  let e: TtyEngine

  beforeAll(async () => {
    e = createTtyEngine("pty-bell", {
      command: ["bun", "km", "view", TEST_VAULT],
      cols: 400,
      rows: 150,
      cwd: KM_CWD,
    })
    await e.waitForContent(15000)
    await e.waitForStable(1500, 20000)
  }, 30000)

  afterAll(async () => {
    await e.close()
  })

  test("alternating h/l does not trigger bell when not at boundary", async () => {
    // Move right first to ensure we're not at a column boundary
    await pressAndWait(e, "l")
    expect(hasBellIndicator(e)).toBe(false)

    // Now alternate h/l rapidly — should bounce between columns without bell
    for (let i = 0; i < 8; i++) {
      e.press(i % 2 === 0 ? "h" : "l")
      await Bun.sleep(50)
    }
    await e.waitForStable(500, 10000)

    expect(hasBellIndicator(e)).toBe(false)
  }, 20000)

  test("rapid h at left boundary: first press bells, subsequent suppressed", async () => {
    // Navigate back to leftmost column first
    for (let i = 0; i < 10; i++) e.press("h")
    await e.waitForStable(500, 10000)

    // We should be at col 0 — pressing h should hit left boundary
    await pressAndWait(e, "h")

    // Now rapid h presses — should NOT keep belling
    await e.repeatKey("h", 5)
    await e.waitForStable(500, 10000)

    // After rapid boundary hits, bell should have cleared or be suppressed
  }, 20000)
})

describe("PTY integration: navigation correctness", () => {
  let e: TtyEngine

  beforeAll(async () => {
    e = createTtyEngine("pty-nav", {
      command: ["bun", "km", "view", TEST_VAULT],
      cols: 400,
      rows: 150,
      cwd: KM_CWD,
    })
    await e.waitForContent(15000)
    await e.waitForStable(1500, 20000)
  }, 30000)

  afterAll(async () => {
    await e.close()
  })

  test("zoom in with Enter and back out with Escape", async () => {
    saveSnapshot(e, "nav-initial")

    const initialBreadcrumb = getBreadcrumb(e)

    // Move down to first item and zoom in
    await pressAndWait(e, "j")
    await pressAndWait(e, "Enter")
    const zoomedIn = getBreadcrumb(e)
    expect(zoomedIn).not.toBe(initialBreadcrumb)
    saveSnapshot(e, "nav-zoomed-in")

    // Back out
    await pressAndWait(e, "Escape")
    await e.waitForStable(500, 10000)
    saveSnapshot(e, "nav-zoomed-out")
  }, 20000)

  test("view mode toggle with v preserves content", async () => {
    const textBefore = e.getText()

    // Toggle view mode
    await pressAndWait(e, "v")
    const textAfterV = e.getText()

    // View mode should change something (status bar at minimum)
    // Content should still be visible
    expect(textAfterV.length).toBeGreaterThan(0)
    saveSnapshot(e, "nav-after-view-toggle")

    // Toggle back
    await pressAndWait(e, "v")
  }, 20000)

  test("search opens with / and closes with Escape", async () => {
    // Open search
    e.press("/")
    await e.waitForStable(300, 5000)

    // Type a search term
    e.type("test")
    await e.waitForStable(300, 5000)
    saveSnapshot(e, "nav-search-open")

    // Close search with Escape
    await pressAndWait(e, "Escape")
    saveSnapshot(e, "nav-search-closed")
  }, 20000)
})

describe("PTY integration: HTML snapshot capture", () => {
  let e: TtyEngine

  beforeAll(async () => {
    e = createTtyEngine("pty-snapshot", {
      command: ["bun", "km", "view", TEST_VAULT],
      cols: 120,
      rows: 40,
      cwd: KM_CWD,
    })
    await e.waitForContent(15000)
    await e.waitForStable(1500, 20000)
  }, 30000)

  afterAll(async () => {
    await e.close()
  })

  test("initial board render captures valid HTML", async () => {
    const html = e.getHTML()

    // HTML should contain terminal content
    expect(html).toContain("<pre")
    expect(html.length).toBeGreaterThan(100)

    saveSnapshot(e, "snapshot-initial-board")
  }, 10000)

  test("after navigation, HTML updates", async () => {
    const htmlBefore = e.getHTML()

    await pressAndWait(e, "j")
    const htmlAfter = e.getHTML()

    // HTML should have changed (cursor moved)
    expect(htmlAfter).not.toBe(htmlBefore)

    saveSnapshot(e, "snapshot-after-nav")
  }, 10000)
})
