/**
 * Regression test: breadcrumb ANSI diff must be correct when navigating columns.
 * Covers km-axswu — breadcrumb shows stray chars after column navigation.
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"
import { withDiagnostics } from "inkx/toolbelt"
import { createBoardDriver } from "../src/driver.ts"
import { createFakeRepo } from "@km/storage"

describe("breadcrumb ANSI replay on column navigation", () => {
  test("breadcrumb updates correctly after l (testEnv)", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("Alpha Column", item("task-a1"), item("task-a2")),
          item("Beta Column", item("task-b1"), item("task-b2")),
          item("Gamma Column", item("task-c1")),
        ),
      { cols: 120, rows: 24 },
    )

    const row0 = () => board.screenshot().split("\n")[0] ?? ""

    expect(row0()).toContain("Alpha Column")
    board.press("l")
    expect(row0()).toContain("Beta Column")
    board.press("l")
    expect(row0()).toContain("Gamma Column")
  })

  test("breadcrumb ANSI replay matches after l (withDiagnostics)", async () => {
    const nodes = item(
      "board",
      item("Alpha Column", item("task-a1"), item("task-a2")),
      item("Beta Column", item("task-b1"), item("task-b2")),
      item("Gamma Column", item("task-c1")),
    )
    const repo = createFakeRepo({ nodes })
    const driver = withDiagnostics(
      createBoardDriver(repo, "board", { columns: 120, rows: 24, incremental: true }),
      { checkIncremental: true, checkReplay: true, checkStability: false },
    )

    // Navigate columns — withDiagnostics checks ANSI replay after each command
    await driver.press("l")
    await driver.press("l")
    await driver.press("l") // wraps or stays at end
  })

  test("breadcrumb ANSI replay with realistic column names (km-axswu)", async () => {
    // Reproduces real vault scenario: breadcrumb goes from
    // "Next Actions # Processing" to "Someday/Maybe # Ideas" etc.
    const nodes = item(
      "board",
      item("Next Actions", item("Processing", item("Task 1"), item("Task 2"), item("Task 3"))),
      item("Someday/Maybe", item("Ideas", item("Idea 1"), item("Idea 2"))),
      item("Waiting For", item("People", item("Person 1"))),
      item("Projects", item("Active", item("Project A"), item("Project B"))),
      item("Reference", item("Archive", item("Ref 1"), item("Ref 2"), item("Ref 3"))),
    )
    const repo = createFakeRepo({ nodes })
    const driver = withDiagnostics(
      createBoardDriver(repo, "board", { columns: 120, rows: 24, incremental: true }),
      { checkIncremental: true, checkReplay: true, checkStability: false },
    )

    // Navigate through all columns
    for (let i = 0; i < 5; i++) {
      await driver.press("l")
    }
    // Navigate back
    for (let i = 0; i < 5; i++) {
      await driver.press("h")
    }
  })
})
