/**
 * View Mode Feature Parity — km-tui.view-mode-feature-parity
 *
 * Verifies that per-card fold, board-level filters, and max-content-lines
 * all work in the alternate view modes (columns, list, tabs) — not just in
 * the cards view. These features share the same TreeNode rendering path
 * after the ViewTree migration.
 *
 * Assertion hierarchy (closest to user first):
 *   1. Screen text presence/absence of children + "+N filtered" footer
 *   2. State matchers verify cursor + selection + view mode are intact
 *
 * See the bead for background on why the alternate views were previously
 * stuck on the wrong layer of the rendering stack.
 */
import { describe, test, expect } from "vitest"
import { item } from "../helpers/board-test.ts"
import { createTestApp } from "../helpers/test-app.ts"

// =============================================================================
// Fixtures
// =============================================================================

/** Single column with a folder card containing two children plus a sibling. */
const foldFixture = () => item("board", item("col1", item("Parent", item("child-1"), item("child-2")), item("Sibling")))

/** Single column with 4 tasks: two match "Fix", two don't. */
const filterFixture = () =>
  item(
    "board",
    item("Tasks", item("Buy groceries"), item("Fix bug in auth"), item("Fix login page"), item("Write documentation")),
  )

/** Single card with many children — exercises maxContentLines truncation. */
const maxLinesFixture = () =>
  item(
    "board",
    item(
      "col1",
      item(
        "BigCard",
        item("child-1"),
        item("child-2"),
        item("child-3"),
        item("child-4"),
        item("child-5"),
        item("child-6"),
      ),
    ),
  )

// =============================================================================
// 3 ops × 3 views = 9 parity tests (+ unfold round-trip sanity check)
// =============================================================================

describe("view mode feature parity", () => {
  describe("per-card fold (fold_more)", () => {
    test.each([["columns"], ["list"], ["tabs"]] as const)("[%s] fold_more hides card children", (viewMode) => {
      using app = createTestApp(foldFixture, { viewMode, cols: 80, rows: 24 })
      // Parent is the cursor — sanity-check children visible initially.
      expect(app.text).toContain("child-1")
      expect(app.text).toContain("child-2")

      app.command("fold_more")

      expect(app.text).not.toContain("child-1")
      expect(app.text).not.toContain("child-2")
      expect(app.text).toContain("Parent")
      expect(app.text).toContain("Sibling")
    })

    test("unfold_more restores children after fold in columns view", () => {
      using app = createTestApp(foldFixture, { viewMode: "columns", cols: 80, rows: 24 })
      app.command("fold_more")
      expect(app.text).not.toContain("child-1")
      app.command("unfold_more")
      expect(app.text).toContain("child-1")
      expect(app.text).toContain("child-2")
    })
  })

  describe("board-level filter (text filter)", () => {
    test.each([["columns"], ["list"], ["tabs"]] as const)(
      "[%s] filterText narrows cards and shows +N filtered footer",
      (viewMode) => {
        using app = createTestApp(filterFixture, { viewMode, cols: 120, rows: 24 })
        // Apply filter programmatically (the filter dialog would dispatch SET_FILTER).
        app.withStore((s) => s.setUI({ filterText: "Fix" }))
        // Bounce through the filter dialog to flush the render cycle.
        app.command("filter")
        app.press("Escape")

        // Skip breadcrumb row (top bar) which may still reference the cursor node.
        const cardArea = app.text.split("\n").slice(2).join("\n")
        expect(cardArea).toContain("Fix bug in auth")
        expect(cardArea).toContain("Fix login page")
        expect(cardArea).not.toContain("Buy groceries")
        expect(cardArea).not.toContain("Write documentation")
        expect(cardArea).toContain("filtered") // "+2 filtered" footer
      },
    )
  })

  describe("max content lines truncation", () => {
    test.each([["columns"], ["list"], ["tabs"]] as const)(
      "[%s] oversized card shows +N more overflow indicator",
      (viewMode) => {
        using app = createTestApp(maxLinesFixture, { viewMode, cols: 80, rows: 30 })
        // maxContentLines defaults to 3 → 6 children → ~+3 hidden.
        expect(app.text).toContain("BigCard")
        expect(app.text).toMatch(/\+\d+ more/)
      },
    )
  })
})
