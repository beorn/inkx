/**
 * Cursor Performance on Real Vault
 *
 * Tests cursor move latency with the actual /tmp/vt vault at 300x120
 * to reproduce the 150-200ms per-press sluggishness.
 *
 * Run: bun bench apps/km-tui/tests/cursor-real-vault.bench.ts
 */

import { bench, describe, beforeAll } from "vitest"
import { createRepo, type Repo } from "@km/storage"
import { runGenerator } from "@km/core"
import { testEnvWithRepo } from "./helpers/board-test.ts"

const VAULT_PATH = "/tmp/vt"

let repo: Repo
let rootId: string

beforeAll(() => {
  repo = runGenerator(createRepo(VAULT_PATH, { loadFiles: true }))
  // Root node is "." for the vault root
  rootId = "."
})

describe(`Real vault cursor perf (300x120)`, () => {
  bench(
    "10 j-presses",
    () => {
      const { board } = testEnvWithRepo(repo, rootId, {
        columns: 300,
        rows: 120,
        viewMode: "columns",
        incremental: true,
      })
      // Move into a column first
      board.command("cursor_right")
      board.command("cursor_down")
      // Now time 10 cursor moves
      for (let i = 0; i < 10; i++) {
        board.command("cursor_down")
      }
    },
    { iterations: 3, warmupIterations: 1 },
  )
})

describe(`Real vault cursor perf (200x60)`, () => {
  bench(
    "10 j-presses",
    () => {
      const { board } = testEnvWithRepo(repo, rootId, {
        columns: 200,
        rows: 60,
        viewMode: "columns",
        incremental: true,
      })
      board.command("cursor_right")
      board.command("cursor_down")
      for (let i = 0; i < 10; i++) {
        board.command("cursor_down")
      }
    },
    { iterations: 3, warmupIterations: 1 },
  )
})

describe(`Real vault cursor perf (80x24)`, () => {
  bench(
    "10 j-presses",
    () => {
      const { board } = testEnvWithRepo(repo, rootId, {
        columns: 80,
        rows: 24,
        viewMode: "columns",
        incremental: true,
      })
      board.command("cursor_right")
      board.command("cursor_down")
      for (let i = 0; i < 10; i++) {
        board.command("cursor_down")
      }
    },
    { iterations: 3, warmupIterations: 1 },
  )
})
