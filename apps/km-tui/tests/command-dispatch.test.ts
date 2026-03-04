import { describe, test } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("board.command()", () => {
  test("cursor_down moves cursor same as press j", () => {
    const { board: b1 } = testEnv(() => item("board", item("col", item("A"), item("B"), item("C"))))
    const { board: b2 } = testEnv(() => item("board", item("col", item("A"), item("B"), item("C"))))

    b1.press("j")
    b2.command("cursor_down")

    // Both should have cursor on B
    b1.expect("#B[data-cursor]").toExist()
    b2.expect("#B[data-cursor]").toExist()
  })

  test("fold_node folds same as press H", () => {
    const { board: b1 } = testEnv(() => item("board", item("col", item("parent", item("child")))))
    const { board: b2 } = testEnv(() => item("board", item("col", item("parent", item("child")))))

    b1.press("H")
    b2.command("fold_node")

    b1.expect("#child").not.toExist()
    b2.expect("#child").not.toExist()
  })

  test("chord command toggle_collapse works", () => {
    const { board: b1 } = testEnv(() => item("board", item("col1", item("A")), item("col2", item("B"))))
    const { board: b2 } = testEnv(() => item("board", item("col1", item("A")), item("col2", item("B"))))

    b1.press("v").press("c")
    b2.command("toggle_collapse")

    // Both should collapse col1
    b1.expect("#A").not.toExist()
    b2.expect("#A").not.toExist()
  })
})
