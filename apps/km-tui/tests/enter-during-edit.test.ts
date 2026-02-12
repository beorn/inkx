/**
 * Outliner Enter Behavior
 *
 * Enter during editing: save current content + create new empty sibling + enter edit on it.
 * This matches Decker/WorkFlowy-style outliner behavior.
 *
 * Flow:
 *   1. save() — persist current content
 *   2. setUI({ inlineEditBlock: null }) — exit current edit
 *   3. handleAddNodeAfter(ctx) — create new sibling + refreshBoardState + enter edit
 *
 * Escape during editing: discard changes + exit edit mode (no new node).
 */

import { describe, test, expect } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"

describe("Outliner Enter — save + new sibling", () => {
  test("Enter saves content and creates new sibling", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("1a"), item("1b"))),
    )

    board.press("Enter") // enter edit mode on 1a
    board.press("X") // type "X" → content should be "1aX"
    board.press("Enter") // save + create new sibling

    // Content saved
    expect(repo.getNode("1a")?.content).toBe("1aX")
    // New sibling created (was 2, now 3)
    expect(repo.getChildren("col1")).toHaveLength(3)
  })

  test("Enter with no changes still creates new sibling", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("1a"), item("1b"))),
    )

    expect(repo.getChildren("col1")).toHaveLength(2)

    board.press("Enter") // enter edit mode
    board.press("Enter") // save (no changes) + create sibling

    // Content unchanged
    expect(repo.getNode("1a")?.content).toBe("1a")
    // New sibling created
    expect(repo.getChildren("col1")).toHaveLength(3)
  })

  test("Multiple Enters create chain of siblings", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("1a"))),
    )

    expect(repo.getChildren("col1")).toHaveLength(1)

    board.press("Enter") // edit 1a
    board.press("Enter") // save + create sibling1 + edit sibling1
    board.press("Enter") // save sibling1 + create sibling2 + edit sibling2
    board.press("Enter") // save sibling2 + create sibling3 + edit sibling3

    // 1 original + 3 new siblings
    expect(repo.getChildren("col1")).toHaveLength(4)
  })

  test("After Enter, user is editing new sibling (can type into it)", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("1a"), item("1b"))),
    )

    board.press("Enter") // edit 1a
    board.press("Enter") // save + create sibling in edit mode

    // User is now editing the new sibling — typing goes there
    board.press("H")
    board.press("i")
    board.press("Escape") // cancel (discard typed content on new sibling)

    // 3 children: 1a, new sibling, 1b
    expect(repo.getChildren("col1")).toHaveLength(3)
    // Original content preserved
    expect(repo.getNode("1a")?.content).toBe("1a")
  })

  test("Escape exits edit without creating sibling", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("1a"), item("1b"))),
    )

    expect(repo.getChildren("col1")).toHaveLength(2)

    board.press("Enter") // edit 1a
    board.press("X") // type
    board.press("Escape") // cancel

    // No new nodes created
    expect(repo.getChildren("col1")).toHaveLength(2)

    // Content unchanged (cancelled)
    expect(repo.getNode("1a")?.content).toBe("1a")

    // Back in normal mode
    board.press("j")
    board.expect("#1b[data-cursor]").toExist()
  })

  test("new sibling inherits data.depth from current card", () => {
    const { board, repo } = testEnv(() => {
      const nodes = item("board", item("col1", item("1a"), item("1b")))
      // Set depth=2 on the cards (simulates H2 sections parsed from markdown)
      for (const n of nodes) {
        if (n.id === "1a" || n.id === "1b") {
          n.data = { ...n.data, depth: 2 }
        }
      }
      return nodes
    })

    board.press("Enter") // edit 1a
    board.press("Enter") // save + create sibling

    // New sibling should have depth=2 (inherited from 1a)
    const children = repo.getChildren("col1")
    expect(children).toHaveLength(3)
    const newNode = children.find(
      (n) => n.id !== "1a" && n.id !== "1b",
    )
    expect(newNode).toBeDefined()
    expect(newNode!.data?.depth).toBe(2)
  })
})
