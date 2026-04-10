/**
 * Which-key popup tests — chord prefix triggers pendingChord state,
 * suffix key or Escape clears it.
 */
import { describe, test, expect } from "vitest"
import { act } from "react"
// Partially FREEZE: pendingChord state tests need store.getState().ui.pendingChord / __triggerChordTimeout
import { testEnv, item } from "./helpers/board-test.ts"
import { createTestApp } from "./helpers/test-app.ts"
import { __triggerChordTimeout } from "../src/board/board-app.ts"
import { getChordSuffixes } from "@km/commands"

describe("which-key popup", () => {
  test("pressing chord prefix sets pendingChord in UI state", () => {
    const { board, store } = testEnv(() => item("board", item("col", item("task"))))

    // Move to a card first
    board.command("cursor_down")

    // Press 'g' (chord prefix)
    board.press("g")

    // pendingChord should be set
    expect(store.getState().ui.pendingChord).toBe("g")
  })

  test("pressing suffix key clears pendingChord", () => {
    const { board, store } = testEnv(() => item("board", item("col", item("task"))))

    board.command("cursor_down")

    // Start chord
    board.press("g")
    expect(store.getState().ui.pendingChord).toBe("g")

    // Complete chord with suffix
    board.press("g") // gg = cursor_first
    expect(store.getState().ui.pendingChord).toBeNull()
  })

  test("Escape clears pendingChord", () => {
    const { board, store } = testEnv(() => item("board", item("col", item("task"))))

    board.command("cursor_down")

    // Start chord
    board.press("g")
    expect(store.getState().ui.pendingChord).toBe("g")

    // Cancel with Escape
    board.press("Escape")
    expect(store.getState().ui.pendingChord).toBeNull()
  })

  test("m chord prefix sets pendingChord", () => {
    const { board, store } = testEnv(() => item("board", item("col", item("task"))))

    board.command("cursor_down")
    board.press("m")
    expect(store.getState().ui.pendingChord).toBe("m")
  })

  test("t chord prefix sets pendingChord", () => {
    const { board, store } = testEnv(() => item("board", item("col", item.task("task"))))

    board.command("cursor_down")
    board.press("t")
    expect(store.getState().ui.pendingChord).toBe("t")
  })

  test("a chord prefix sets pendingChord", () => {
    const { board, store } = testEnv(() => item("board", item("col", item("task"))))

    board.command("cursor_down")
    board.press("a")
    expect(store.getState().ui.pendingChord).toBe("a")
  })
})

describe("which-key popup rendering", () => {
  test("popup shows chord suffixes immediately when prefix is pending", () => {
    using app = createTestApp(item("board", item("col", item("task"))))

    app.command("cursor_down")
    app.press("g")

    // Popup should show chord suffix hints
    expect(app.text).toContain("inbox")
    expect(app.text).toContain("journal")
    expect(app.text).toContain("home")
  })

  // FREEZE: needs store.getState().ui.pendingChord
  test("popup disappears when suffix key is pressed", () => {
    const { board, store } = testEnv(() => item("board", item("col", item("task"))))

    board.command("cursor_down")
    board.press("g")
    expect(board.screenshot()).toContain("inbox")

    // Press suffix — clears pendingChord, popup unmounts
    board.press("g") // gg = cursor_first
    expect(store.getState().ui.pendingChord).toBeNull()
    expect(board.screenshot()).not.toContain("inbox")
  })

  test("popup shows different suffixes for different prefixes", () => {
    using app = createTestApp(item("board", item("col", item("task"))))

    app.command("cursor_down")
    app.press("m")

    // m-prefix should show move-related suffixes (location labels)
    expect(app.text).toContain("inbox")
    expect(app.text).toContain("journal")
  })

  test("a-prefix popup shows add-related suffixes", () => {
    using app = createTestApp(item("board", item("col", item("task"))))

    app.command("cursor_down")
    app.press("a")

    // a-prefix should show add-related suffixes
    expect(app.text).toContain("tag")
    expect(app.text).toContain("home")
    expect(app.text).toContain("inbox")
  })
})

describe("which-key popup minimum display duration", () => {
  test("popup stays visible after chord timeout fires", () => {
    const { board, store } = testEnv(() => item("board", item("col", item.task("task"))))

    board.command("cursor_down")
    board.press("t")
    expect(store.getState().ui.pendingChord).toBe("t")

    // Trigger chord timeout (fires standalone command, e.g., noop for 't')
    act(() => {
      __triggerChordTimeout(store.getState)
    })

    // pendingChord should STILL be set — popup stays visible
    expect(store.getState().ui.pendingChord).toBe("t")
    expect(board.screenshot()).toContain("due date")
  })

  test("popup stays visible when non-suffix key pressed within min display time", () => {
    const { board, store } = testEnv(() => item("board", item("col", item("task"))))

    board.command("cursor_down")
    board.press("g")
    expect(store.getState().ui.pendingChord).toBe("g")

    // Press a random key (not a chord suffix) — popup should stay because min display time hasn't elapsed
    board.command("toggle_task_done")
    expect(store.getState().ui.pendingChord).toBe("g")
  })
})

describe("getChordSuffixes", () => {
  test("returns suffixes for g prefix", () => {
    // Ensure command system is initialized by creating a test app
    {
      using _app = createTestApp(item("board", item("col", item("task"))))
    }

    const suffixes = getChordSuffixes("g")
    expect(suffixes.length).toBeGreaterThan(0)

    // Should include known g-prefix chords
    const keys = suffixes.map((s) => s.key)
    expect(keys).toContain("g") // gg = cursor_first
    expect(keys).toContain("i") // gi = goto (targetId: "i")
  })

  test("returns suffixes for m prefix", () => {
    {
      using _app = createTestApp(item("board", item("col", item("task"))))
    }

    const suffixes = getChordSuffixes("m")
    expect(suffixes.length).toBeGreaterThan(0)

    const keys = suffixes.map((s) => s.key)
    expect(keys).toContain("m") // mm = enter_move_mode
    expect(keys).toContain("i") // mi = move (targetId: "i")
  })

  test("returns suffixes for a prefix", () => {
    {
      using _app = createTestApp(item("board", item("col", item("task"))))
    }

    const suffixes = getChordSuffixes("a")
    expect(suffixes.length).toBe(8) // 4 pickers + 4 boards (h,i,j,a) + 0 favorites (empty by default)

    const suffixMap = Object.fromEntries(suffixes.map((s) => [s.key, s.commandId]))
    expect(suffixMap["shift-3"]).toBe("add") // # on US layout
    expect(suffixMap["shift-2"]).toBe("add") // @ on US layout
    expect(suffixMap["shift-="]).toBe("add") // + on US layout
    expect(suffixMap["["]).toBe("add")
    expect(suffixMap["h"]).toBe("add")
    expect(suffixMap["i"]).toBe("add")
    expect(suffixMap["j"]).toBe("add")
    expect(suffixMap["a"]).toBe("add")
  })

  test("returns empty for non-prefix key", () => {
    {
      using _app = createTestApp(item("board", item("col", item("task"))))
    }

    // Use `z` because `q` is now a chord prefix (q q → quit, see km-tui.q-quits-no-confirm).
    const suffixes = getChordSuffixes("z")
    expect(suffixes.length).toBe(0)
  })
})
