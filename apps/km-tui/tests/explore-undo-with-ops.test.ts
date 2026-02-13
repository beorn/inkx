/**
 * Exploration: Undo/redo interacting with various operations — fold, search,
 * detail pane, selection, navigation, inline edit.
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("Exploration: Undo with Operations", () => {
  test("duplicate then fold then undo", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("parent", item("c1"), item("c2")), item("B"))),
    )
    const bugs: string[] = []

    board.press("j") // → B
    board.press("d") // duplicate B
    board.press("k") // → parent
    board.press("z").press("a") // fold parent
    board.press("Ctrl+Z") // undo duplicate

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after dup + fold + undo")
    }
    expect(bugs).toEqual([])
  })

  test("duplicate then search then undo", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"))))
    const bugs: string[] = []

    board.press("d") // duplicate A
    board.press("/") // open search
    board.press("Escape") // close search
    board.press("Ctrl+Z") // undo duplicate

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after dup + search + undo")
    }
    expect(bugs).toEqual([])
  })

  test("duplicate then detail pane then undo", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"))))
    const bugs: string[] = []

    board.press("d") // duplicate A
    board.press(" ") // detail pane
    board.press("Escape") // close detail
    board.press("Ctrl+Z") // undo

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after dup + detail + undo")
    }
    expect(bugs).toEqual([])
  })

  test("duplicate then navigate to other column then undo", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B")), item("col2", item("C"))))
    const bugs: string[] = []

    board.press("d") // duplicate A
    board.press("l") // navigate to col2
    board.press("Ctrl+Z") // undo from a different column

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after dup + nav to other col + undo")
    }
    expect(bugs).toEqual([])
  })

  test("duplicate then inline edit then undo", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"))))
    const bugs: string[] = []

    board.press("d") // duplicate A
    board.press("Enter") // inline edit
    board.press("Escape") // cancel edit
    board.press("Ctrl+Z") // undo duplicate

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after dup + edit + undo")
    }
    expect(bugs).toEqual([])
  })

  test("multiple duplicates then multiple undos", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"))))
    const bugs: string[] = []

    board.press("d") // dup 1
    board.press("d") // dup 2
    board.press("d") // dup 3
    board.press("Ctrl+Z") // undo 3
    board.press("Ctrl+Z") // undo 2
    board.press("Ctrl+Z") // undo 1

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after multiple dup + undo")
    }
    expect(bugs).toEqual([])
  })

  test("undo then redo then undo", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"))))
    const bugs: string[] = []

    board.press("d") // dup
    board.press("Ctrl+Z") // undo
    board.press("Ctrl+Y") // redo
    board.press("Ctrl+Z") // undo again

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after undo/redo/undo cycle")
    }
    expect(bugs).toEqual([])
  })

  test("undo on empty undo stack with different modes", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"))))
    const bugs: string[] = []

    // No undoable action performed
    board.press("Ctrl+Z") // undo on empty stack
    board.press("Ctrl+Y") // redo on empty stack
    board.press(" ") // detail pane
    board.press("Escape")
    board.press("Ctrl+Z") // still empty stack

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after undo/redo on empty stack")
    }
    expect(bugs).toEqual([])
  })
})
