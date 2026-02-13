/**
 * Exploration: Zoom operations — i (zoom in), u (zoom out), e (zoom to),
 * and their interactions with other operations.
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("Exploration: Zoom Operations", () => {
  test("i zooms into folder", () => {
    const { board } = testEnv(() => item("board", item("col1", item("parent", item("c1"), item("c2")), item("B"))))
    const bugs: string[] = []

    board.press("i") // zoom into parent

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after zoom in")
    }
    expect(bugs).toEqual([])
  })

  test("i then u (zoom in/out)", () => {
    const { board } = testEnv(() => item("board", item("col1", item("parent", item("c1"), item("c2")), item("B"))))
    const bugs: string[] = []

    board.press("i") // zoom in
    board.press("u") // zoom out

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after zoom in/out")
    }
    expect(bugs).toEqual([])
  })

  test("e zooms to cursor", () => {
    const { board } = testEnv(() => item("board", item("col1", item("parent", item("c1"), item("c2")), item("B"))))
    const bugs: string[] = []

    board.press("j") // → B
    board.press("e") // zoom to B

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after zoom to")
    }
    expect(bugs).toEqual([])
  })

  test("zoom in then fold then zoom out", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("parent", item("sub", item("deep1"), item("deep2")), item("c2")), item("B"))),
    )
    const bugs: string[] = []

    board.press("i") // zoom into parent
    board.press("z").press("a") // fold sub
    board.press("u") // zoom out

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after zoom in + fold + zoom out")
    }
    expect(bugs).toEqual([])
  })

  test("zoom in then duplicate then undo then zoom out", () => {
    const { board } = testEnv(() => item("board", item("col1", item("parent", item("c1"), item("c2")), item("B"))))
    const bugs: string[] = []

    board.press("i") // zoom into parent
    board.press("d") // duplicate c1
    board.press("Ctrl+Z") // undo
    board.press("u") // zoom out

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after zoom + dup + undo + zoom out")
    }
    expect(bugs).toEqual([])
  })

  test("zoom in then < depth change then zoom out", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("parent", item("sub", item("d1"), item("d2")), item("c2")), item("B"))),
    )
    const bugs: string[] = []

    board.press("i") // zoom into parent
    board.press("<") // decrease depth
    board.press("u") // zoom out

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after zoom + < + zoom out")
    }
    expect(bugs).toEqual([])
  })

  test("i on leaf node", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"))))
    const bugs: string[] = []

    board.press("i") // zoom into leaf — should be no-op or open detail

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after i on leaf")
    }
    expect(bugs).toEqual([])
  })

  test("u at root level (cannot zoom out further)", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"))))
    const bugs: string[] = []

    board.press("u") // already at root

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after u at root")
    }
    expect(bugs).toEqual([])
  })

  test("rapid zoom in/out", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("L1", item("L2", item("L3", item("deep")))), item("B"))),
    )
    const bugs: string[] = []

    board.press("i") // zoom in L1
    board.press("i") // zoom in L2
    board.press("i") // zoom in L3
    board.press("u") // zoom out
    board.press("u") // zoom out
    board.press("u") // zoom out

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after rapid zoom in/out")
    }
    expect(bugs).toEqual([])
  })

  test("zoom in then search then zoom out", () => {
    const { board } = testEnv(() => item("board", item("col1", item("parent", item("c1"), item("c2")), item("B"))))
    const bugs: string[] = []

    board.press("i") // zoom in
    board.press("/") // search
    board.press("Escape") // close search
    board.press("u") // zoom out

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after zoom + search + zoom out")
    }
    expect(bugs).toEqual([])
  })
})
