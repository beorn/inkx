/**
 * Incremental ANSI output verification test
 *
 * Tests that changesToAnsi output, when replayed through a virtual terminal,
 * produces the same screen state as a fresh bufferToAnsi render.
 *
 * This catches the class of bug where the buffer content is correct (SILVERY_STRICT
 * passes) but the ANSI escape sequences produced by changesToAnsi are wrong
 * (garbled terminal output in production).
 *
 * Uses createTestApp with incremental rendering enabled (default) and
 * SILVERY_STRICT to verify both buffer content and ANSI output.
 */
import { describe, test, expect, beforeEach, afterEach } from "vitest"
import { createRepo, getChildren } from "@km/storage"
import { runGenerator } from "@km/core"
import { createBoardDriver } from "../src/driver.ts"
import { item } from "./helpers/board-test.ts"
import { createTestApp } from "./helpers/test-app.ts"

// Enable buffer-level + vt100 ANSI output verification.
beforeEach(() => {
  process.env.SILVERY_STRICT = "1"
})
afterEach(() => {
  delete process.env.SILVERY_STRICT
})

describe("Incremental ANSI output verification", () => {
  test("changesToAnsi produces correct ANSI sequences during navigation", { retry: 2 }, async () => {
    using app = await createTestApp(
      item.root(
        "board",
        item("alpha-col", item("task-a"), item("task-b"), item("task-c")),
        item("beta-col", item("task-d"), item("task-e")),
        item("gamma-col", item("task-f"), item("task-g"), item("task-h")),
      ),
      { cols: 120, rows: 30 },
    )

    // Navigation that exercises various changesToAnsi patterns:
    // - Cursor outline moving between cards (stylePropsDirty, border changes)
    // - Moving between columns (large area changes)
    // - Moving to different levels (column vs card)
    const sequence = [
      "j",
      "j",
      "k", // vertical within column
      "l",
      "l", // right across columns
      "k",
      "k", // up to column level
      "j",
      "j", // down to cards
      "h",
      "h", // left across columns
      "k", // up
      "j", // down
      "l", // right
      "j",
      "j",
      "j", // deep down
      "k",
      "k",
      "k",
      "k", // up through column/board
      "j",
      "j", // back down
      "l",
      "l", // right to last col
      "h",
      "h", // back left
    ]

    for (const key of sequence) {
      await app.press(key)
      // SILVERY_STRICT verifies buffer content and ANSI output (vt100 backend)
    }

    expect(true).toBe(true)
  })

  test("larger board with more columns", { retry: 2 }, async () => {
    using app = await createTestApp(
      item.root(
        "board",
        item("col-1", item("a1"), item("a2"), item("a3"), item("a4")),
        item("col-2", item("b1"), item("b2")),
        item("col-3", item("c1"), item("c2"), item("c3")),
        item("col-4", item("d1"), item("d2"), item("d3"), item("d4"), item("d5")),
        item("col-5", item("e1"), item("e2")),
      ),
      { cols: 160, rows: 40 },
    )

    // Navigate through all columns and back
    const sequence = [
      "l",
      "l",
      "l",
      "l", // right through all columns
      "j",
      "j", // down into cards
      "h",
      "h",
      "h",
      "h", // back through all columns
      "k",
      "k", // up
      "l",
      "j",
      "j",
      "j", // right and deep down
      "k",
      "k",
      "h", // up and left
    ]

    for (const key of sequence) {
      await app.press(key)
    }

    expect(true).toBe(true)
  })

  test.skipIf(!process.env.TEST_VAULT)("real vault: ANSI output verification", async () => {
    const vaultPath = process.env.TEST_VAULT!
    const repo = runGenerator(createRepo(vaultPath, { loadFiles: true }))

    // Find a suitable board root
    const nodes = repo.query("type:folder")
    let rootId: string | null = null
    for (const node of nodes) {
      if (node.data?.is_repo_root) {
        rootId = node.id
        break
      }
    }
    if (!rootId) {
      for (const node of nodes) {
        const children = getChildren(repo.database, node.id)
        if (children.length > 0) {
          rootId = node.id
          break
        }
      }
    }
    if (!rootId) throw new Error("No suitable board root found in vault")

    // Real vault uses createBoardDriver directly because createTestApp
    // takes a KNode[] fixture, not an existing Repo.
    const driver = createBoardDriver(repo, rootId, {
      columns: 120,
      rows: 30,
      incremental: true,
    })

    // The user's garbling trigger: press 'l' then navigate around
    const sequence = [
      "l", // right — user's first garbling trigger
      "j",
      "j", // down
      "k", // up
      "l", // right again
      "k",
      "k", // up to column level
      "j", // down
      "h", // left
      "j",
      "j",
      "j", // down
      "k",
      "k", // up
      "l",
      "l", // right
      "h", // left
      "k",
      "k",
      "k", // up to board level
      "j",
      "j", // down to column
      "j", // down to card
    ]

    for (let i = 0; i < sequence.length; i++) {
      const key = sequence[i]!
      try {
        await driver.press(key)
      } catch (e: any) {
        throw new Error(`Key #${i} '${key}' caused ANSI mismatch: ${e.message}`)
      }
    }

    expect(true).toBe(true)
  })
})
