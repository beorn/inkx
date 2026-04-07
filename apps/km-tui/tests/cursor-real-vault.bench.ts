/**
 * Cursor Performance on Realistic Board
 *
 * Tests cursor move latency on a realistic ~750-node board to reproduce
 * end-user sluggishness. Originally targeted /tmp/vt (a real vault on the
 * developer's machine); now defaults to the portable `realistic-board.json`
 * fixture so any clone can run the bench with the same numbers. Set
 * `KM_BENCH_VAULT=/path/to/vault` to opt back into a real vault.
 *
 * Run: bunx --bun vitest bench --run apps/km-tui/tests/cursor-real-vault.bench.ts
 */

import { bench, describe, beforeAll, afterAll } from "vitest"
import { createRepo, type Repo } from "@km/storage"
import { runGenerator } from "@km/core"
import { testEnvWithRepo } from "./helpers/board-test.ts"
import { loadRealisticBoardFixture } from "./fixtures/realistic-board.ts"
import { dumpBenchPhases, withBenchPhases } from "./helpers/bench-phases.ts"

// Opt-in to a real vault by setting KM_BENCH_VAULT. Otherwise we use the
// portable fixture so the bench is reproducible across machines.
const VAULT_PATH = process.env.KM_BENCH_VAULT
const VAULT_LABEL = VAULT_PATH ? `vault:${VAULT_PATH}` : "fixture:realistic-board"

let repo: Repo
let rootId: string
let nodeCount = 0

beforeAll(() => {
  if (VAULT_PATH) {
    repo = runGenerator(createRepo(VAULT_PATH, { loadFiles: true }))
    // Real vaults use "." as their root node id (the vault path)
    rootId = "."
  } else {
    const fixture = loadRealisticBoardFixture()
    repo = fixture.repo
    rootId = fixture.rootId
    nodeCount = fixture.nodeCount
  }
})

describe(`Realistic board cursor perf (300x120) [${VAULT_LABEL}]`, () => {
  const phases = withBenchPhases(`cursor-real-vault:300x120`)
  bench(
    "10 j-presses",
    () => {
      phases.measure(() => {
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
      })
    },
    { iterations: 3, warmupIterations: 1 },
  )
  afterAll(() => dumpBenchPhases(phases))
})

describe(`Realistic board cursor perf (200x60) [${VAULT_LABEL}]`, () => {
  const phases = withBenchPhases(`cursor-real-vault:200x60`)
  bench(
    "10 j-presses",
    () => {
      phases.measure(() => {
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
      })
    },
    { iterations: 3, warmupIterations: 1 },
  )
  afterAll(() => dumpBenchPhases(phases))
})

describe(`Realistic board cursor perf (80x24) [${VAULT_LABEL}]`, () => {
  const phases = withBenchPhases(`cursor-real-vault:80x24`)
  bench(
    "10 j-presses",
    () => {
      phases.measure(() => {
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
      })
    },
    { iterations: 3, warmupIterations: 1 },
  )
  afterAll(() => {
    if (nodeCount > 0) {
      process.stdout.write(`[bench] realistic-board fixture: ${nodeCount} nodes\n`)
    }
    dumpBenchPhases(phases)
  })
})
