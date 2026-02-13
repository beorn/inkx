/**
 * Real vault ANSI replay test for km-axswu: Breadcrumb text corruption.
 *
 * Run with:
 *   TEST_VAULT=/tmp/vt bun vitest run apps/km-tui/tests/breadcrumb-replay-realvault.test.ts
 */

import { describe, test } from "vitest"
import { createRepo, getChildren, type Repo } from "@km/storage"
import { runGenerator } from "@km/core"
import { withDiagnostics } from "inkx"
import { createBoardDriver } from "../src/driver.ts"

function findBoardRoot(repo: Repo): string {
  const nodes = repo.query("type:folder")
  for (const node of nodes) {
    if (node.data?.is_repo_root) return node.id
  }
  for (const node of nodes) {
    const children = getChildren(repo.db, node.id)
    if (children.length > 0) return node.id
  }
  throw new Error("No suitable board root found")
}

describe.skipIf(!process.env.TEST_VAULT)("Real vault breadcrumb ANSI replay", () => {
  test("h/l navigation ANSI replay including breadcrumb row", async () => {
    const vaultPath = process.env.TEST_VAULT!
    const repo = runGenerator(createRepo(vaultPath, { loadFiles: true }))
    const rootId = findBoardRoot(repo)

    const baseDriver = createBoardDriver(repo, rootId, {
      columns: 120,
      rows: 30,
    })

    // Enable ALL checks including ANSI replay (which the standard test doesn't use)
    const driver = withDiagnostics(baseDriver, {
      checkIncremental: true,
      checkReplay: true,
      checkStability: true,
      skipLines: [0, -1], // Only affects stability check
    })

    // Navigate right through columns (h/l changes breadcrumb)
    await driver.cmd.right!()
    await driver.cmd.right!()
    await driver.cmd.left!()
    await driver.cmd.right!()
    await driver.cmd.left!()
    await driver.cmd.left!()
  })

  test("j/k level changes with ANSI replay", async () => {
    const vaultPath = process.env.TEST_VAULT!
    const repo = runGenerator(createRepo(vaultPath, { loadFiles: true }))
    const rootId = findBoardRoot(repo)

    const baseDriver = createBoardDriver(repo, rootId, {
      columns: 120,
      rows: 30,
    })

    const driver = withDiagnostics(baseDriver, {
      checkIncremental: true,
      checkReplay: true,
      checkStability: true,
      skipLines: [0, -1],
    })

    // Level changes also change breadcrumb
    await driver.cmd.up!()
    await driver.cmd.up!()
    await driver.cmd.down!()
    await driver.cmd.down!()
    await driver.cmd.right!()
    await driver.cmd.right!()
    await driver.cmd.up!()
    await driver.cmd.down!()
  })

  test("rapid mixed navigation with ANSI replay", async () => {
    const vaultPath = process.env.TEST_VAULT!
    const repo = runGenerator(createRepo(vaultPath, { loadFiles: true }))
    const rootId = findBoardRoot(repo)

    const baseDriver = createBoardDriver(repo, rootId, {
      columns: 100,
      rows: 30,
    })

    const driver = withDiagnostics(baseDriver, {
      checkIncremental: true,
      checkReplay: true,
      checkStability: false,
    })

    const commands = [
      () => driver.cmd.up!(),
      () => driver.cmd.down!(),
      () => driver.cmd.left!(),
      () => driver.cmd.right!(),
    ]

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
