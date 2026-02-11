/**
 * Reproduce the /tmp/vt stickyY bug:
 *
 * Board layout:
 *   ref (9 cards)  |  TaskNotes (2 cards)     |  archive (8 cards)
 *   HealthFitness  |  Tasks (tall, 6 children) |  DMVUpdates
 *   People         |  Archive                  |  completed
 *   Business       |                           |  Quotes
 *   ...            |                           |  ...
 *
 * Bug: Navigate to "Archive" (2nd card in TaskNotes), press l.
 * Expected: Lands on "Quotes" (visually at same Y as "Archive")
 * Actual: Lands on "completed" (2nd card by index, wrong Y position)
 *
 * Root cause: "Tasks" in TaskNotes is very tall (6 children), pushing
 * "Archive" down to roughly the Y position of "Quotes" in the archive
 * column. Index-based fallback maps index 1→1 ("completed"), but visual
 * Y matching should map to "Quotes".
 */
import { testEnv, item } from "./helpers/board-test.ts"
import { describe, test, expect } from "vitest"

describe("stickyY: vault-like asymmetric tall cards", () => {
  test("Archive → l should land on Quotes (visual Y), not completed (index)", () => {
    const { board, registry } = testEnv(
      () =>
        item(
          "board",
          // ref: 9 cards of varying heights
          item(
            "Ref",
            item("HealthFitness", item("hf1"), item("hf2"), item("hf3")),
            item("People", item("p1"), item("p2"), item("p3"), item("p4")),
            item("Business", item("b1"), item("b2")),
            item("Finance"),
            item("Travel"),
            item("Learning", item("l1"), item("l2")),
            item("HTemplates"),
            item("Projects"),
            item("Notes"),
          ),
          // TaskNotes: 2 cards — first is VERY tall (6 children)
          item(
            "TaskNotes",
            item(
              "Tasks",
              item("T001"),
              item("T002"),
              item("T003"),
              item("T004"),
              item("T005"),
              item("T006"),
            ),
            item("Archive"),
          ),
          // archive: 8 cards
          item(
            "ArchiveCol",
            item("DMVUpdates", item("d1"), item("d2")),
            item("completed"),
            item("Quotes", item("q1"), item("q2")),
            item("Recipes"),
            item("OldNotes"),
            item("Misc"),
            item("Backup"),
            item("Legacy"),
          ),
        ),
      { rows: 30, columns: 120 },
    )

    // Start at first card in first column
    expect(board.q("[data-cursor]").textContent()).toContain("HealthFitness")

    // Navigate to TaskNotes column
    board.press("l")
    expect(board.q("[data-cursor]").textContent()).toContain("Tasks")

    // Navigate down to Archive (2nd card in TaskNotes)
    board.press("j")
    expect(board.q("[data-cursor]").textContent()).toContain("Archive")

    // Diagnostic: dump registry state before pressing l
    const archiveLayout = registry.getNodeOptional("Archive")
    const stickyBefore = registry.getStickyY()

    // Press l to navigate right to archive column
    board.press("l")
    const stickyAfter = registry.getStickyY()
    const landedText = board.q("[data-cursor]").textContent()

    // Diagnostic output on failure
    if (!landedText.includes("Quotes")) {
      const dump = registry.dump()
      // Get positions of archive column cards by nodeId
      const archiveCardIds = ["DMVUpdates", "completed", "Quotes", "Recipes", "OldNotes", "Misc", "Backup", "Legacy"]
      const archiveCards = archiveCardIds
        .map((id) => {
          const layout = registry.getNodeOptional(id)
          return layout ? `  ${id} y=${layout.y} headY=${layout.headY} h=${layout.cardHeight}` : null
        })
        .filter(Boolean)
      console.log(
        `DIAGNOSTIC:\n` +
          `  Archive (source) headY=${archiveLayout?.headY} headHeight=${archiveLayout?.headHeight} y=${archiveLayout?.y}\n` +
          `  stickyY before l: ${stickyBefore}\n` +
          `  stickyY after l: ${stickyAfter}\n` +
          `  Landed on: "${landedText}"\n` +
          `  Archive column cards:\n${archiveCards.join("\n")}\n` +
          `  Full registry dump:\n${dump}`,
      )
    }

    // Should land on Quotes (at similar visual Y as Archive), NOT completed
    expect(landedText).toContain("Quotes")
  })

  test("Archive → l → h round-trip returns to Archive", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item(
            "Ref",
            item("HealthFitness", item("hf1"), item("hf2"), item("hf3")),
            item("People", item("p1"), item("p2")),
            item("Business"),
          ),
          item(
            "TaskNotes",
            item(
              "Tasks",
              item("T001"),
              item("T002"),
              item("T003"),
              item("T004"),
              item("T005"),
              item("T006"),
            ),
            item("Archive"),
          ),
          item(
            "ArchiveCol",
            item("DMVUpdates", item("d1"), item("d2")),
            item("completed"),
            item("Quotes", item("q1")),
            item("Recipes"),
          ),
        ),
      { rows: 30, columns: 120 },
    )

    // Navigate to Archive in TaskNotes
    board.press("l") // → Tasks
    board.press("j") // → Archive
    expect(board.q("[data-cursor]").textContent()).toContain("Archive")

    // l → land in archive column, h → back
    board.press("l")
    board.press("h")
    expect(board.q("[data-cursor]").textContent()).toContain("Archive")
  })
})
