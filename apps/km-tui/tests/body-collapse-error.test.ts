import { describe, test, expect, vi } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("BUG: collapse on body column triggers __body__ repo lookup error", () => {
  test("pressing c on body column should not produce console.error about __body__ not in repo", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const { board } = testEnv(() =>
      item("board",
        item.paragraph("body text here"),
        item("col1", item("A")),
      )
    )

    // Cursor starts on body column (first non-collapsed column).
    // Press c to toggle collapse on body column — this triggers the bug:
    // "ERROR km:nav cursor node not in repo: __body__board, falling back to root"
    board.press("c")

    // Check no error was logged about __body__
    const bodyErrors = errorSpy.mock.calls.filter(
      (args) => args.some((arg) => typeof arg === "string" && arg.includes("__body__"))
    )
    expect(bodyErrors, "should not log __body__ repo lookup error").toHaveLength(0)

    errorSpy.mockRestore()
  })

  test("pressing c on body column should produce a boundary bell (body is not collapsible)", () => {
    const { board } = testEnv(() =>
      item("board",
        item.paragraph("body text here"),
        item("col1", item("A")),
      )
    )

    // Body column is virtual/synthetic — collapse should be a boundary error (bell)
    board.press("c")
    expect(board.bell, "body column collapse should ring bell").toBe(true)
  })

  test("navigate to body column then collapse — key sequence c, l, c", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const { board } = testEnv(() =>
      item("board",
        item.paragraph("body text here"),
        item("col1", item("A")),
      )
    )

    // c on body column (should be noop/boundary)
    board.press("c")
    // l to navigate to col1
    board.press("l")
    // c to collapse col1 (this should work fine)
    board.press("c")

    const bodyErrors = errorSpy.mock.calls.filter(
      (args) => args.some((arg) => typeof arg === "string" && arg.includes("__body__"))
    )
    expect(bodyErrors, "no __body__ errors during sequence c,l,c").toHaveLength(0)

    errorSpy.mockRestore()
  })
})
