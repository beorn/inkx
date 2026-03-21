/**
 * Real vault diagnostic tests
 *
 * These tests run against a real vault directory to catch incremental
 * rendering bugs that don't reproduce with synthetic test data.
 *
 * Run with:
 *   TEST_VAULT=/tmp/v2 bun vitest run apps/km-tui/tests/real-vault.test.ts
 *
 * The withDiagnostics wrapper enables all diagnostic checks including
 * incremental vs fresh render comparison.
 */

import { describe, test, expect } from "vitest"
import { createRepo, getChildren, type Repo } from "@km/storage"
import { runGenerator } from "@km/core"
import { withDiagnostics } from "@silvery/react"
import { createBoardDriver } from "../src/driver.ts"

/**
 * Find a suitable root node for board testing.
 * Prefers repo root, falls back to first folder with children.
 */
function findBoardRoot(repo: Repo): string {
  // Try to find the repo root node
  const nodes = repo.query("type:folder")
  for (const node of nodes) {
    if (node.data?.is_repo_root) {
      return node.id
    }
  }
  // Fallback: find first folder with children
  for (const node of nodes) {
    const children = getChildren(repo.database, node.id)
    if (children.length > 0) {
      return node.id
    }
  }
  throw new Error("No suitable board root found in vault")
}

describe.skipIf(!process.env.TEST_VAULT)("Real vault diagnostics", () => {
  test("level navigation k k j j with invariants", async () => {
    const vaultPath = process.env.TEST_VAULT!
    const repo = runGenerator(createRepo(vaultPath, { loadFiles: true }))
    const rootId = findBoardRoot(repo)

    const baseDriver = createBoardDriver(repo, rootId, {
      columns: 120,
      rows: 30,
    })

    // Wrap with invariants checking - all checks enabled
    const driver = withDiagnostics(baseDriver, {
      checkIncremental: true,
      checkStability: true,
      skipLines: [0, -1], // Skip breadcrumb and status bar
    })

    // Navigate up to board level (k k) - the known bug pattern
    await driver.cmd.up!()
    await driver.cmd.up!()

    // Navigate back down (j j)
    await driver.cmd.down!()
    await driver.cmd.down!()

    // If we get here without error, incremental matches fresh
    expect(driver.getState().cursor.level).toBe("card")
  })

  test("fold/unfold with invariants", async () => {
    const vaultPath = process.env.TEST_VAULT!
    const repo = runGenerator(createRepo(vaultPath, { loadFiles: true }))
    const rootId = findBoardRoot(repo)

    const baseDriver = createBoardDriver(repo, rootId, {
      columns: 80,
      rows: 24,
    })

    const driver = withDiagnostics(baseDriver, {
      checkIncremental: true,
      // Stability check off - fold/unfold changes content
      checkStability: false,
    })

    // Rapid fold/unfold is a known problem area
    for (let i = 0; i < 5; i++) {
      await driver.press("<") // fold_all
      await driver.cmd.down!() // Move to next
      await driver.press(">") // unfold_all
      await driver.cmd.up!() // Move back
    }
  })

  test("outline depth decrease with invariants", async () => {
    const vaultPath = process.env.TEST_VAULT!
    const repo = runGenerator(createRepo(vaultPath, { loadFiles: true }))
    const rootId = findBoardRoot(repo)

    const baseDriver = createBoardDriver(repo, rootId, {
      columns: 100,
      rows: 40,
    })

    const driver = withDiagnostics(baseDriver, {
      checkIncremental: true,
      // Stability check off - depth changes modify content
      checkStability: false,
    })

    // Outline depth changes (< and >) are known problem areas
    await driver.press(">") // Enter outline mode
    await driver.press(">") // Deeper
    await driver.press(">") // Even deeper
    await driver.cmd.down!()
    await driver.cmd.down!()
    await driver.press("<") // Back up (known issue: can cause blank cards)
    await driver.press("<")
    await driver.press("<")
    await driver.press(">")
    await driver.cmd.right!()
    await driver.press("<")
  })

  test("mixed navigation with level changes", async () => {
    const vaultPath = process.env.TEST_VAULT!
    const repo = runGenerator(createRepo(vaultPath, { loadFiles: true }))
    const rootId = findBoardRoot(repo)

    const baseDriver = createBoardDriver(repo, rootId, {
      columns: 120,
      rows: 30,
    })

    const driver = withDiagnostics(baseDriver, {
      checkIncremental: true,
      checkStability: true,
      skipLines: [0, -1],
    })

    // Move right through columns
    await driver.cmd.right!()
    await driver.cmd.right!()

    // Navigate up to board level
    await driver.cmd.up!()
    await driver.cmd.up!()

    // Move left at board level
    await driver.cmd.left!()

    // Navigate back down
    await driver.cmd.down!()
    await driver.cmd.down!()

    // Then navigate with movement
    await driver.cmd.down!()
    await driver.cmd.down!()
    await driver.cmd.right!()
    await driver.cmd.up!()
    await driver.cmd.down!()
  })

  test("fuzz: random navigation sequence", async () => {
    const vaultPath = process.env.TEST_VAULT!
    const repo = runGenerator(createRepo(vaultPath, { loadFiles: true }))
    const rootId = findBoardRoot(repo)

    const baseDriver = createBoardDriver(repo, rootId, {
      columns: 100,
      rows: 30,
    })

    const driver = withDiagnostics(baseDriver, {
      checkIncremental: true,
      // Stability off due to mixed commands
      checkStability: false,
    })

    // Random walk of navigation commands
    const commands = [
      () => driver.cmd.up!(),
      () => driver.cmd.down!(),
      () => driver.cmd.left!(),
      () => driver.cmd.right!(),
      () => driver.press("<"), // fold_all
      () => driver.press(">"), // unfold_all
      () => driver.press("<"), // decrease_outline_depth (now fold_all)
    ]

    // Use deterministic seed for reproducibility
    const rng = {
      seed: 42,
      next: () => (rng.seed = (rng.seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff,
    }

    for (let i = 0; i < 30; i++) {
      const cmd = commands[Math.floor(rng.next() * commands.length)]
      if (cmd) await cmd()
    }
  })
})
