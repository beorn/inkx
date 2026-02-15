/**
 * Regression tests: pressing 'j' at column header in zoomed view should NOT exit zoom.
 *
 * Bug report: After zooming into a node, navigating to a column header and pressing
 * 'j' was reported to exit the zoom entirely. Extensive investigation found no code
 * path from cursor_down that could trigger ZOOM_IN/SET_ROOT. These regression tests
 * ensure that j at column level stays within the zoomed view.
 *
 * Bead: km-tui.zoom-exit-j
 */

import { describe, it, expect } from "vitest"
import { item } from "./helpers/board-test.ts"
import { createFakeRepo } from "@km/storage"
import { createBoardDriver } from "../src/driver.ts"

describe("zoom: j at column header should not exit zoom", () => {
  it("j at column header preserves zoom state", () => {
    const nodes = item(
      "vault",
      item(
        "next",
        item("inbox", item("task1"), item("task2")),
        item("today", item("task3")),
      ),
    )
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "next")

    expect(driver.store.getState().rootId).toBe("next")

    // Navigate to column header of second column
    driver.press("k") // inbox column header
    driver.press("l") // today column header
    expect(driver.getState().selectedNodeId).toBe("today")

    // Press j — zoom should NOT change
    driver.press("j")
    expect(driver.store.getState().rootId).toBe("next")
  })

  it("j at column header of empty column preserves zoom", () => {
    const nodes = item(
      "vault",
      item(
        "project",
        item("backlog", item("item1")),
        item("empty-col"),
      ),
    )
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "project")

    // Navigate to empty column
    driver.press("l")
    expect(driver.getState().selectedNodeId).toBe("empty-col")

    // Press j — should hit boundary, NOT exit zoom
    driver.press("j")
    expect(driver.store.getState().rootId).toBe("project")
  })

  it("j at column header with body-only content preserves zoom", () => {
    const nodes = item(
      "vault",
      item(
        "project",
        item("active", item("task1")),
        item("notes", item.paragraph("some notes"), item.paragraph("more notes")),
      ),
    )
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "project")

    // Navigate right to notes column
    driver.press("l")

    // Press j — should NOT exit zoom
    driver.press("j")
    expect(driver.store.getState().rootId).toBe("project")
  })

  it("j at last card preserves zoom", () => {
    const nodes = item(
      "vault",
      item(
        "board",
        item("col1", item("card1"), item("card2")),
      ),
    )
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "board")

    // Navigate to last card
    driver.press("j") // card2
    driver.press("j") // boundary

    // zoom should NOT change
    expect(driver.store.getState().rootId).toBe("board")
  })

  it("repeated j presses never exit zoom", () => {
    const nodes = item(
      "vault",
      item(
        "root",
        item("col", item("a"), item("b"), item("c")),
      ),
    )
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "root")

    // Press j many times — should never exit zoom
    for (let i = 0; i < 10; i++) {
      driver.press("j")
      expect(driver.store.getState().rootId).toBe("root")
    }
  })
})
