/**
 * Mouse Click-to-Position (termless PTY)
 *
 * End-to-end tests using real terminal emulator + PTY.
 * Verifies that mouse clicks correctly position the cursor in edit mode.
 *
 * SKIPPED: Non-deterministic Bun PTY input race condition.
 * PTY write() intermittently fails to deliver input to the child process
 * in vitest worker threads. Works reliably in standalone `bun run` scripts.
 * Root cause suspected: Bun.spawn terminal write channel has a timing
 * dependency on process.stdout.isTTY state that vitest's setup disrupts.
 * Tracked: km-termless.vitest-pty
 *
 * Uses KM_EAGER_LOAD=1 to bypass discoverOnly stub loading.
 */
import { describe, test, expect } from "vitest"
import { mkdirSync, writeFileSync } from "fs"
import { createTerminalFixture } from "@termless/test"
import "@termless/test/matchers"
import { clickToCursorOffset } from "../src/board/click-to-cursor.ts"
import type { TermEditContext } from "@silvery/ag-react"

const KM_CWD = "/Users/beorn/Code/pim/km"

let vaultCounter = 0
function createTestVault(content: string): string {
  const dir = `/tmp/km-mouse-test-${++vaultCounter}-${Date.now()}`
  mkdirSync(dir, { recursive: true })
  writeFileSync(`${dir}/board.md`, content, "utf-8")
  return dir
}

async function spawnKm(vaultContent: string, opts?: { cols?: number; rows?: number }) {
  const vault = createTestVault(vaultContent)
  const term = createTerminalFixture({ cols: opts?.cols ?? 80, rows: opts?.rows ?? 24 })
  await term.spawn(["bun", "km", "view", vault], {
    cwd: KM_CWD,
    env: { KM_EAGER_LOAD: "1" },
  })
  expect(term.screen).toContainText("helloworld", { timeout: 15000 })
  return { term, vault }
}

const BOARD = `# board\n\n## Column\n\n- helloworld\n- second item\n`

// --- Unit tests for clickToCursorOffset ---

function mockEditCtx(text: string, wrapWidth = 80): TermEditContext {
  return { text, wrapWidth, selectionStart: text.length, selectionEnd: text.length } as TermEditContext
}

function mockIdNode(x: number, y: number, width = 80) {
  return { screenRect: { x, y, width, height: 1 } } as any
}

describe("clickToCursorOffset", () => {
  test("click at character position 5 returns offset 5", () => {
    const ctx = mockEditCtx("helloworld")
    const node = mockIdNode(2, 5)
    expect(clickToCursorOffset(9, 5, ctx, node)).toBe(5)
  })

  test("click at start of text returns offset 0", () => {
    const ctx = mockEditCtx("abcdef")
    const node = mockIdNode(2, 5)
    expect(clickToCursorOffset(4, 5, ctx, node)).toBe(0)
  })

  test("click past end clamps to text length", () => {
    const ctx = mockEditCtx("short")
    const node = mockIdNode(2, 5)
    expect(clickToCursorOffset(54, 5, ctx, node)).toBe(5)
  })

  test("click before prefix clamps to 0", () => {
    const ctx = mockEditCtx("hello")
    const node = mockIdNode(2, 5)
    expect(clickToCursorOffset(0, 5, ctx, node)).toBe(0)
  })

  test("returns current position when no screenRect", () => {
    const ctx = mockEditCtx("hello")
    ;(ctx as any).selectionStart = 3
    expect(clickToCursorOffset(10, 5, ctx, { screenRect: null } as any)).toBe(3)
  })

  test("wrapped lines: click on second row", () => {
    const ctx = mockEditCtx("abcdefghij", 5)
    const node = mockIdNode(2, 5)
    expect(clickToCursorOffset(6, 5, ctx, node)).toBe(2)
    expect(clickToCursorOffset(5, 6, ctx, node)).toBe(6)
  })
})

// --- PTY-level mouse tests ---

describe("mouse click-to-position (termless)", { timeout: 30000 }, () => {
  test.skip("double-click enters edit mode", async () => {
    const { term } = await spawnKm(BOARD)

    const pos = term.find("helloworld")
    expect(pos).not.toBeNull()

    await term.dblclick(pos!.col + 3, pos!.row)
    expect(term.screen).toContainText("INSERT", { timeout: 5000 })
  })

  test.skip("click repositions cursor — type inserts at clicked position", async () => {
    const { term } = await spawnKm(BOARD)

    const pos = term.find("helloworld")
    expect(pos).not.toBeNull()

    await term.dblclick(pos!.col + 3, pos!.row)
    expect(term.screen).toContainText("INSERT", { timeout: 5000 })

    term.click(pos!.col + 2, pos!.row)
    await new Promise((r) => setTimeout(r, 200))

    term.type("X")
    expect(term.screen).toContainText("heXlloworld", { timeout: 5000 })
  })

  test.skip("click at start of text positions cursor at beginning", async () => {
    const { term } = await spawnKm(BOARD)

    const pos = term.find("helloworld")
    expect(pos).not.toBeNull()

    await term.dblclick(pos!.col, pos!.row)
    expect(term.screen).toContainText("INSERT", { timeout: 5000 })

    term.click(pos!.col, pos!.row)
    await new Promise((r) => setTimeout(r, 200))

    term.type("Z")
    expect(term.screen).toContainText("Zhelloworld", { timeout: 5000 })
  })
})
