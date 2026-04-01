import { describe, test, expect } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"

describe("console toggle (backtick)", () => {
  test("backtick sets showConsole state", () => {
    const { board } = testEnv(() => item("board", item("col", item("task1"))))

    // Verify initial state — no console
    const stateBefore = board.getAppState()
    expect(stateBefore.ui.showConsole).toBeFalsy()

    // Press backtick
    board.press("`")

    // showConsole should be true
    const stateAfter = board.getAppState()
    expect(stateAfter.ui.showConsole).toBe(true)
  })

  test("second backtick clears showConsole state", () => {
    const { board } = testEnv(() => item("board", item("col", item("task1"))))

    board.press("`") // open
    expect(board.getAppState().ui.showConsole).toBe(true)

    board.press("`") // close
    expect(board.getAppState().ui.showConsole).toBe(false)
  })

  // NOTE: The actual alt screen switching (\x1b[?1049l) requires a real
  // RuntimeContext with pause/resume, which testEnv doesn't provide.
  // The ANSI output must be verified via TTY MCP or termless integration test.
  // Bug was: output guard suppressed process.stdout.write in alt screen mode.
  // Fix: pause() disposes the output guard; resume() re-creates it.
})
