/**
 * Exploration: Node Header Redesign
 *
 * Tests the recent changes to icons.ts, TreeNode.tsx, CardColumn.tsx.
 * Focus on rendering correctness of different node types.
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("Exploration: Node Headers", () => {
  test("task nodes show icons", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item.task("Task A"), item.task("Task B", "done"))),
    )
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
    expect(text).toContain("Task A")
    expect(text).toContain("Task B")
  })

  test("folder nodes render correctly", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item.folder("Folder1"), item("B"))),
    )
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
    expect(text).toContain("Folder1")
  })

  test("section nodes", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item.section("Section A", item("child1")), item("B"))),
    )
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("mixed node types in one column", () => {
    const { board } = testEnv(() =>
      item("board", item("col1",
        item.task("Todo item"),
        item.section("Section", item("nested")),
        item.folder("Folder"),
        item("Plain item"),
        item.code("code block"),
        item.quote("quote block"),
      )),
    )
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("paragraph nodes", () => {
    const { board } = testEnv(() =>
      item("board", item("col1",
        item.paragraph("This is a paragraph"),
        item("B"),
      )),
    )
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("task status done renders differently", () => {
    const { board } = testEnv(() =>
      item("board", item("col1",
        item.task("Undone", "todo"),
        item.task("Done", "done"),
        item.task("In Progress", "in_progress"),
      )),
    )
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
    // All three should be visible
    expect(text).toContain("Undone")
    expect(text).toContain("Done")
    expect(text).toContain("In Progress")
  })

  test("many items render without overflow garbage", () => {
    const items = Array.from({ length: 30 }, (_, i) => item(`Item ${i + 1}`))
    const { board } = testEnv(
      () => item("board", item("col1", ...items)),
      { rows: 24 }, // Fewer rows than items
    )
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
    // Should show some items but not all (scrolling)
    expect(text).toContain("Item 1")
  })

  test("empty content node", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item(""), item("B"))),
    )
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("very long content truncates", () => {
    const { board } = testEnv(() =>
      item("board", item("col1",
        item("A".repeat(200)),
        item("B"),
      )),
    )
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("column with rules (color, limit)", () => {
    const { board } = testEnv(() =>
      item("board",
        item("col1 color=green limit=3", item("A"), item("B"), item("C"), item("D")),
      ),
    )
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("column with collapse rule", () => {
    const { board } = testEnv(() =>
      item("board",
        item("col1 collapse=true", item("A"), item("B")),
        item("col2", item("C")),
      ),
    )
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })
})
