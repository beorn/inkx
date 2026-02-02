/**
 * Test that bottom bar shows VIEW indicator correctly.
 */
import { expect, test, describe } from "bun:test"
import { testEnv, item } from "./helpers/board-test.ts"

describe("Bottom bar VIEW indicator", () => {
  test("shows CARDS VIEW on startup", () => {
    const env = testEnv(
      () => item.root("board", item("Inbox", item("Task 1"))),
      { rows: 24, columns: 80 }
    )
    const text = env.board.screenshot()

    console.log("Screenshot (last 3 lines):")
    const lines = text.split("\n")
    console.log(lines.slice(-4).join("\n"))

    expect(text).toContain("CARDS VIEW")
  })

  test("shows other VIEW after pressing v", () => {
    const env = testEnv(
      () => item.root("board", item("Inbox", item("Task 1"))),
      { rows: 24, columns: 80 }
    )
    env.board.press("v") // Switch view mode
    const text = env.board.screenshot()

    console.log("After v (last 3 lines):")
    const lines = text.split("\n")
    console.log(lines.slice(-4).join("\n"))

    // Could be LIST, COLUMNS, or TABS
    expect(text).toMatch(/(LIST|COLUMNS|TABS) VIEW/)
  })
})
