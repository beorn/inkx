import { describe, it, expect } from "vitest"
import { act } from "react"
import { item } from "./helpers/board-test.ts"
import { createBoardDriver } from "../src/driver.ts"
import { createFakeRepo } from "@km/storage"
import { formatDateBadge } from "../src/views/tree-node-helpers.ts"
import type { KNode } from "@km/core"

describe("date badge display", () => {
  it("formatDateBadge returns badge for node with due_date", () => {
    // Use a date 30+ days out so it renders as "Mon DD" not relative
    const badge = formatDateBadge({ due_date: "2026-03-15" } as KNode)
    expect(badge).not.toBe("")
    expect(badge).toContain("Mar 15")
  })

  it("formatDateBadge returns empty for node without dates", () => {
    const badge = formatDateBadge({} as KNode)
    expect(badge).toBe("")
  })

  it("date badge appears in card after repo.updateNode", async () => {
    const nodes = item("board",
      item("col1",
        item.task("Test task"),
      ),
    )
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "board")

    // Initially no date
    let screen = driver.getState().screen
    let clean = screen.replace(/\x1b\[[0-9;]*m/g, "")
    expect(clean).not.toContain("Mar 15")

    // Set due_date on the task node
    const col = repo.getChildren("board")[0]!
    const taskNode = repo.getChildren(col.id)[0]!
    act(() => {
      repo.updateNode(taskNode.id, { due_date: "2026-03-15" })
    })

    // Trigger render flush (inkx custom renderer needs a keypress to flush
    // useSyncExternalStore updates — j/k is a no-op cursor move on single card)
    await driver.press("j")

    // Date badge should appear right-aligned in the card
    screen = driver.getState().screen
    clean = screen.replace(/\x1b\[[0-9;]*m/g, "")
    expect(clean).toContain("Mar 15")
  })

  it("date badge appears in detail pane after repo.updateNode", async () => {
    const nodes = item("board",
      item("col1",
        item.task("Test task"),
      ),
    )
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "board")

    // Set due_date on the task node
    const col = repo.getChildren("board")[0]!
    const taskNode = repo.getChildren(col.id)[0]!
    act(() => {
      repo.updateNode(taskNode.id, { due_date: "2026-03-15" })
    })

    // Open detail pane (Space opens detail for current node)
    await driver.press(" ")

    const screen = driver.getState().screen
    const clean = screen.replace(/\x1b\[[0-9;]*m/g, "")
    // Detail pane should show the due date (rendered as relative date)
    expect(clean).toContain("Due: Mar 15")
  })
})
