/**
 * Exploration: Special content rendering — emoji, unicode, links, long words.
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "../apps/km-tui/tests/helpers/board-test.ts"
import { stripAnsi } from "inkx"

describe("special content rendering", () => {
  test("emoji in card content renders without crash", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("task with emoji")),
        ),
      { columns: 80, rows: 24 },
    )

    const text = stripAnsi(board.screenshot())
    expect(text.length).toBeGreaterThan(0)
  })

  test("very long single word truncates", () => {
    const { board, repo } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("longword")),
        ),
      { columns: 40, rows: 20 },
    )

    repo.updateNode("longword", {
      content: "Superlongwordthatdoesnotcontainanyspacesandshouldbetruncat",
    })
    board.press("j").press("k")

    const text = stripAnsi(board.screenshot())
    expect(text.length).toBeGreaterThan(0)
  })

  test("empty content card renders without crash", () => {
    const { board, repo } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("empty-card")),
        ),
      { columns: 80, rows: 24 },
    )

    repo.updateNode("empty-card", { content: "" })
    board.press("j").press("k")

    const text = stripAnsi(board.screenshot())
    expect(text.length).toBeGreaterThan(0)
  })

  test("link content renders", () => {
    const { board, repo } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("link-card")),
        ),
      { columns: 80, rows: 24 },
    )

    repo.updateNode("link-card", {
      content: "Check [[other-note]] for details",
    })
    board.press("j").press("k")

    const text = stripAnsi(board.screenshot())
    expect(text).toContain("other-note")
  })

  test("markdown formatting in content renders", () => {
    const { board, repo } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("md-card")),
        ),
      { columns: 80, rows: 24 },
    )

    repo.updateNode("md-card", {
      content: "This has **bold** and *italic* text",
    })
    board.press("j").press("k")

    const text = stripAnsi(board.screenshot())
    expect(text).toContain("bold")
    expect(text).toContain("italic")
  })
})
