import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { renderScenario } from "../../src/test/render-harness.tsx"
import { welcome } from "../../src/test/scripts/welcome.ts"

let consoleSpies: Array<ReturnType<typeof vi.spyOn>> = []
const silentWrite = ((
  _chunk: string | Uint8Array,
  encodingOrCallback?: BufferEncoding | ((err?: Error) => void),
  callback?: (err?: Error) => void,
): boolean => {
  const cb = typeof encodingOrCallback === "function" ? encodingOrCallback : callback
  cb?.()
  return true
}) as typeof process.stdout.write

beforeEach(() => {
  consoleSpies = (["log", "info", "debug", "warn", "error"] as const).map((method) =>
    vi.spyOn(console, method).mockImplementation(() => {}),
  )
  vi.spyOn(process.stdout, "write").mockImplementation(silentWrite)
  vi.spyOn(process.stderr, "write").mockImplementation(silentWrite as typeof process.stderr.write)
})

afterEach(() => {
  for (const spy of consoleSpies) spy.mockRestore()
  consoleSpies = []
})

describe("welcome composer cursor", () => {
  function expectCursorAfterText(s: Awaited<ReturnType<typeof renderScenario>>, text: string): void {
    const cursor = s.app.getCursorState()
    expect(cursor, `Cursor should be visible after typing.\n${s.text}`).not.toBeNull()

    const lineWithText = s.lines.findIndex((line) => line.includes(text))
    expect(lineWithText, `Could not find expected text ${JSON.stringify(text)}.\n${s.text}`).toBeGreaterThanOrEqual(0)
    const expectedX = s.lines[lineWithText]!.indexOf(text) + text.length

    expect(cursor!.y, `Cursor should be on the row containing ${JSON.stringify(text)}.\n${s.text}`).toBe(lineWithText)
    expect(cursor!.x, `Cursor should sit immediately after ${JSON.stringify(text)}.\n${s.text}`).toBe(expectedX)
  }

  test("cursor insertion stays synchronized after a right-edge exact wrap", async () => {
    const s = await renderScenario({ script: welcome, cols: 100, rows: 30, agent: "codex" })
    try {
      const input = "i'm seeing a lot of rendering issues running silvercode f"
      for (const ch of input) await s.app.press(ch)

      const before = s.app.getCursorState()
      expect(before, `Cursor should be visible after typing.\n${s.text}`).not.toBeNull()

      await s.app.press("x")

      const after = s.app.getCursorState()
      expect(after, `Cursor should be visible after continuation insert.\n${s.text}`).not.toBeNull()
      const lineWithX = s.lines.findIndex((line) => line.includes("fx"))
      expect(lineWithX, `Continuation character should render at the insertion row.\n${s.text}`).toBe(before!.y)
      expect(after!.y, `Cursor should remain on the continuation row after insertion.\n${s.text}`).toBe(lineWithX)
      expect(after!.x, `Cursor should sit immediately after the reflowed continuation text.\n${s.text}`).toBe(
        s.lines[lineWithX]!.indexOf("fx") + "fx".length,
      )
    } finally {
      s.dispose()
    }
  })

  test("cursor follows the inserted tail after welcome command text wraps to multiple lines", async () => {
    const s = await renderScenario({ script: welcome, cols: 100, rows: 30, agent: "codex" })
    try {
      const input = "can we show real checkmarks (not emojis, not [x]) for the channels"
      for (const ch of input) await s.app.press(ch)

      expectCursorAfterText(s, "channels")
    } finally {
      s.dispose()
    }
  })
})
