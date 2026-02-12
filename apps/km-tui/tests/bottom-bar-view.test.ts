/**
 * Test that bottom bar shows VIEW indicator correctly.
 */
import { expect, test, describe } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("Bottom bar VIEW indicator", () => {
  test("shows CARDS VIEW on startup", () => {
    const env = testEnv(() => item.root("board", item("Inbox", item("Task 1"))), {
      rows: 24,
      columns: 80,
    })
    const text = env.board.screenshot()
    expect(text).toContain("CARDS VIEW")
  })

  test("shows other VIEW after pressing v", () => {
    const env = testEnv(() => item.root("board", item("Inbox", item("Task 1"))), {
      rows: 24,
      columns: 80,
    })
    env.board.press("v") // Switch view mode
    const text = env.board.screenshot()
    // Could be LIST, COLUMNS, or TABS
    expect(text).toMatch(/(LIST|COLUMNS|TABS) VIEW/)
  })
})
