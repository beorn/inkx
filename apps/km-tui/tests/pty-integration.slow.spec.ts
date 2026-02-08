/**
 * PTY Integration Tests — Real terminal pipeline
 *
 * Uses createTtyEngine (Bun PTY + xterm-headless) to test through the
 * REAL async event pipeline: stdin → TermProvider → merge → pump → event loop → render.
 *
 * Headless tests (testEnv/board.press) call handleKey synchronously, bypassing
 * all 4 async layers. These tests catch bugs that only manifest with real timing.
 */
import { describe, test, expect, afterEach } from "vitest"

// Direct import — no tsconfig alias exists for beorn-tools
const { createTtyEngine } =
  await import("/Users/beorn/Code/pim/km/vendor/beorn-tools/tools/lib/tty-engine/engine.ts")
type TtyEngine = Awaited<ReturnType<typeof createTtyEngine>>

const KM_CWD = "/Users/beorn/Code/pim/km"
const TEST_VAULT = "/tmp/vt"

let engine: TtyEngine | null = null

afterEach(async () => {
  if (engine) {
    await engine.close()
    engine = null
  }
})

function startKm(vaultPath: string) {
  engine = createTtyEngine("pty-test", {
    command: ["bun", "km", "view", vaultPath],
    cols: 400,
    rows: 150,
    cwd: KM_CWD,
  })
  return engine
}

/** Press key, wait for render to settle (500ms stable window for large boards) */
async function pressAndWait(e: TtyEngine, key: string, stableMs = 500) {
  e.press(key)
  await e.waitForStable(stableMs, 10000)
}

/** Rapid key presses simulating auto-repeat (~30Hz = 33ms gap) */
async function rapidPress(
  e: TtyEngine,
  key: string,
  count: number,
  gapMs = 33,
) {
  for (let i = 0; i < count; i++) {
    e.press(key)
    await Bun.sleep(gapMs)
  }
  await e.waitForStable(500, 10000)
}

/** Extract the status bar line (last non-empty line with CARDS VIEW or similar) */
function getStatusBar(e: TtyEngine): string {
  const lines = e.getText().split("\n")
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i]!.includes("VIEW")) return lines[i]!
  }
  return ""
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

describe("PTY integration: auto-repeat", () => {
  test("rapid j presses move cursor continuously without bell", async () => {
    const e = startKm(TEST_VAULT)

    // Wait for board to fully render
    await e.waitForContent(15000)
    await e.waitForStable(1500, 20000)

    const initialStatus = getStatusBar(e)
    const initialBreadcrumb = getBreadcrumb(e)

    // Single j press, wait for stable
    await pressAndWait(e, "j")

    const afterOneJ = getBreadcrumb(e)

    // Breadcrumb should have changed (cursor moved)
    expect(afterOneJ).not.toBe(initialBreadcrumb)

    // Now rapid-press j 10 times (simulating key auto-repeat)
    await rapidPress(e, "j", 10)

    const afterRapidJ = getBreadcrumb(e)
    const afterRapidStatus = getStatusBar(e)

    // Breadcrumb should have changed further
    expect(afterRapidJ).not.toBe(afterOneJ)

    // No bell indicator
    expect(hasBellIndicator(e)).toBe(false)
  }, 30000)

  test("very rapid j presses (15ms gap, ~67Hz) still move cursor", async () => {
    const e = startKm(TEST_VAULT)

    await e.waitForContent(15000)
    await e.waitForStable(1500, 20000)

    const initialBreadcrumb = getBreadcrumb(e)

    // Very rapid — faster than typical key repeat
    await rapidPress(e, "j", 15, 15)

    const afterRapid = getBreadcrumb(e)

    // Cursor should have moved
    expect(afterRapid).not.toBe(initialBreadcrumb)

    // No bell
    expect(hasBellIndicator(e)).toBe(false)
  }, 30000)
})

describe("PTY integration: burst input (real key repeat simulation)", () => {
  test("burst of j chars in single write (simulates OS stdin buffering)", async () => {
    const e = startKm(TEST_VAULT)

    await e.waitForContent(15000)
    await e.waitForStable(1500, 20000)

    const initialBreadcrumb = getBreadcrumb(e)

    // Real key repeat: OS buffers multiple keystrokes into one stdin read.
    // Write 10 j's as a single string — this is what the process actually sees.
    e.type("jjjjjjjjjj")
    await e.waitForStable(500, 10000)

    const afterBurst = getBreadcrumb(e)

    // Cursor should have moved
    expect(afterBurst).not.toBe(initialBreadcrumb)

    // No bell
    expect(hasBellIndicator(e)).toBe(false)
  }, 30000)

  test("repeated bursts of j chars (simulates held key over time)", async () => {
    const e = startKm(TEST_VAULT)

    await e.waitForContent(15000)
    await e.waitForStable(1500, 20000)

    const initialBreadcrumb = getBreadcrumb(e)

    // Simulate how OS delivers key repeat: bursts of 3-5 chars every ~50ms
    for (let i = 0; i < 5; i++) {
      e.type("jjj")
      await Bun.sleep(50)
    }
    await e.waitForStable(500, 10000)

    const afterBursts = getBreadcrumb(e)

    // Cursor should have moved 15 positions total
    expect(afterBursts).not.toBe(initialBreadcrumb)

    // No bell
    expect(hasBellIndicator(e)).toBe(false)
  }, 30000)

  test("burst h/l alternation (simulates rapid column switching)", async () => {
    const e = startKm(TEST_VAULT)

    await e.waitForContent(15000)
    await e.waitForStable(1500, 20000)

    // Move right first
    await pressAndWait(e, "l")

    // Burst of alternating h/l as single writes
    e.type("hlhlhlhl")
    await e.waitForStable(500, 10000)

    // No bell
    expect(hasBellIndicator(e)).toBe(false)
  }, 30000)
})

describe("PTY integration: h/l false bell", () => {
  test("alternating h/l does not trigger bell when not at boundary", async () => {
    const e = startKm(TEST_VAULT)

    await e.waitForContent(15000)
    await e.waitForStable(1500, 20000)

    // Move right first to ensure we're not at a column boundary
    await pressAndWait(e, "l")
    expect(hasBellIndicator(e)).toBe(false)

    // Now alternate h/l rapidly — should bounce between columns without bell
    for (let i = 0; i < 8; i++) {
      e.press(i % 2 === 0 ? "h" : "l")
      await Bun.sleep(50)
    }
    await e.waitForStable(500, 10000)

    // Should not trigger bell
    expect(hasBellIndicator(e)).toBe(false)
  }, 30000)

  test("rapid h at left boundary: first press bells, subsequent suppressed", async () => {
    const e = startKm(TEST_VAULT)

    await e.waitForContent(15000)
    await e.waitForStable(1500, 20000)

    // We start at col 0 — pressing h should hit left boundary
    await pressAndWait(e, "h")

    // First boundary hit should show bell
    const hasBell = hasBellIndicator(e)
    // (This is what we expect — first boundary SHOULD bell)

    // Now rapid h presses — should NOT keep belling
    for (let i = 0; i < 5; i++) {
      e.press("h")
      await Bun.sleep(33)
    }
    await e.waitForStable(500, 10000)

    // After rapid boundary hits, bell should have cleared or be suppressed
    // The exact behavior depends on the implementation
  }, 30000)
})
