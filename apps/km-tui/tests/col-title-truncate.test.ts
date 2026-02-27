/**
 * Test: Column title truncation when wider than column width
 *
 * Verifies that column header titles do not overflow their column width,
 * including sigil suffixes and type suffixes. When decorations (sigil suffix,
 * type suffix) would cause the display name to be truncated, they are omitted
 * to give the display name more room.
 *
 * Bead: km-tui.col-title-truncate
 */
import { describe, test, expect } from "vitest"
import { testEnv, testEnvWithRepo, item } from "./helpers/board-test.ts"
import type { KNode } from "@km/core"
import { createFakeRepo } from "@km/storage"

// =============================================================================
// Helpers
// =============================================================================

/** Create a minimal board fixture with a sigil column and a second column. */
function createSigilBoard(opts: { displayName: string; sigilName: string; secondCol?: boolean }): KNode[] {
  const nodes: KNode[] = [
    {
      id: "root",
      type: "h",
      item: true,
      fstype: "repo",
      data: { name: "board", is_repo_root: true },
      parent_id: null,
      parent_idx: 0,
      embed_source: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      version: "v1",
    },
    {
      id: "col1",
      type: "h",
      item: true,
      fstype: "folder",
      name: opts.sigilName,
      data: { name: opts.displayName },
      parent_id: "root",
      parent_idx: 0,
      embed_source: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      version: "v1",
    },
    {
      id: "task-a",
      type: "p",
      item: true,
      list_marker: "-",
      task_marker: "[ ]",
      task_status: "todo",
      content: "task-a",
      data: {},
      parent_id: "col1",
      parent_idx: 0,
      embed_source: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      version: "v1",
    },
  ]

  if (opts.secondCol !== false) {
    nodes.push(
      {
        id: "col2",
        type: "h",
        item: true,
        fstype: "folder",
        data: { name: "col2" },
        parent_id: "root",
        parent_idx: 1,
        embed_source: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        version: "v1",
      },
      {
        id: "task-b",
        type: "p",
        item: true,
        list_marker: "-",
        task_marker: "[ ]",
        task_status: "todo",
        content: "task-b",
        data: {},
        parent_id: "col2",
        parent_idx: 0,
        embed_source: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        version: "v1",
      },
    )
  }

  return nodes
}

/** Assert every line in the screenshot fits within the given width. */
function expectLinesWithinWidth(text: string, maxWidth: number) {
  const lines = text.split("\n")
  for (const line of lines) {
    expect(line.length).toBeLessThanOrEqual(maxWidth)
  }
}

// =============================================================================
// Tests
// =============================================================================

describe("col-title-truncate", () => {
  // =========================================================================
  // Basic truncation
  // =========================================================================

  test("long column title is truncated within column width", () => {
    // Title is 90 chars — longer than the 80-col terminal, so it MUST be
    // truncated everywhere (breadcrumb header AND column header).
    const longTitle = "This Is A Very Long Column Name That Should Definitely Be Truncated Because It Is Way Too Long"
    const { board } = testEnv(() => item.root("board", item(longTitle, item("task-a")), item("col2", item("task-b"))), {
      columns: 80,
      rows: 20,
    })

    const text = board.screenshot()
    // Full title should NOT appear — it's 95 chars, wider than the 80-col terminal
    expect(text).not.toContain(longTitle)
    // But the beginning should be visible
    expect(text).toContain("This Is A Very")
    expectLinesWithinWidth(text, 80)
  })

  test("single column with very long name truncates properly", () => {
    const { board } = testEnv(
      () =>
        item.root(
          "board",
          item("This Title Is Extremely Long And Must Be Truncated To Fit Within The Column Width", item("task")),
        ),
      { columns: 40, rows: 15 },
    )

    expectLinesWithinWidth(board.screenshot(), 40)
  })

  test("header row respects column width with large count display", () => {
    // 10 cards produce a 2-digit count display that reduces available name space
    const cards = Array.from({ length: 10 }, (_, i) => item(`card${i}`))
    const { board } = testEnv(
      () => item.root("board", item("A Somewhat Long Column Name Here", ...cards), item("Short", item("x"))),
      { columns: 60, rows: 20 },
    )

    expectLinesWithinWidth(board.screenshot(), 60)
  })

  // =========================================================================
  // Sigil suffix omission when space is tight
  // =========================================================================

  test("sigil suffix omitted when display name + sigil would overflow", () => {
    // "Landing the Plane Session Completion" (36 chars) + " @landing-the-plane" (19 chars)
    // = 55 chars total. With 60-col terminal and 2 columns, each column is ~29 chars wide.
    // Available header name width is ~24 chars. The sigil suffix should be omitted.
    const nodes = createSigilBoard({
      displayName: "Landing the Plane Session Completion",
      sigilName: "@landing-the-plane",
    })

    const repo = createFakeRepo({ nodes })
    const { board } = testEnvWithRepo(repo, "root", { columns: 60, rows: 20 })

    const text = board.screenshot()
    expectLinesWithinWidth(text, 60)

    // The sigil suffix should NOT appear since it doesn't fit
    expect(text).not.toContain("@landing-the-plane")
    // But the display name beginning should be visible
    expect(text).toContain("Landing the")
  })

  test("sigil suffix hidden when slug matches display name", () => {
    // "Next" slugifies to "next", same as "@next" → slug is redundant, not shown.
    const nodes = createSigilBoard({
      displayName: "Next",
      sigilName: "@next",
      secondCol: false,
    })

    const repo = createFakeRepo({ nodes })
    const { board } = testEnvWithRepo(repo, "root", { columns: 80, rows: 15 })

    const text = board.screenshot()
    // The sigil suffix should NOT appear since it's slug-equivalent to the title
    expect(text).not.toContain("@next")
    expect(text).toContain("Next")
    expectLinesWithinWidth(text, 80)
  })

  test("sigil suffix shown when slug differs from display name", () => {
    // "Next Actions" slugifies to "next-actions", differs from "@next" → slug IS shown.
    const nodes = createSigilBoard({
      displayName: "Next Actions",
      sigilName: "@next",
      secondCol: false,
    })

    const repo = createFakeRepo({ nodes })
    const { board } = testEnvWithRepo(repo, "root", { columns: 80, rows: 15 })

    const text = board.screenshot()
    expect(text).toContain("@next")
    expect(text).toContain("Next Actions")
    expectLinesWithinWidth(text, 80)
  })

  test("narrow column with sigil suffix fits within column width", () => {
    const nodes = createSigilBoard({
      displayName: "Next Actions",
      sigilName: "@next",
      secondCol: false,
    })

    const repo = createFakeRepo({ nodes })
    const { board } = testEnvWithRepo(repo, "root", { columns: 30, rows: 15 })

    expectLinesWithinWidth(board.screenshot(), 30)
  })

  // =========================================================================
  // Columns view mode
  // =========================================================================

  test("sigil suffix handled correctly in columns view mode", () => {
    const nodes = createSigilBoard({
      displayName: "Landing the Plane Session Completion",
      sigilName: "@landing-the-plane",
    })

    const repo = createFakeRepo({ nodes })
    const { board } = testEnvWithRepo(repo, "root", {
      columns: 60,
      rows: 20,
      viewMode: "columns",
    })

    const text = board.screenshot()
    expectLinesWithinWidth(text, 60)
  })
})
