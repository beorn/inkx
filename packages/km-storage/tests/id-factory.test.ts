/**
 * Tests for the node ID factory injection seam.
 *
 * Bead: @km/test-infra/deterministic-ulid-factory.
 */

import { afterEach, describe, expect, test } from "vitest"
import {
  createDeterministicIdFactory,
  defaultIdFactory,
  getIdFactory,
  resetIdFactory,
  setIdFactory,
  withDeterministicIds,
} from "../src/id-factory.ts"

afterEach(() => {
  resetIdFactory()
})

describe("id-factory", () => {
  test("default factory produces 26-char ULIDs (real time + crypto random)", () => {
    const id1 = defaultIdFactory()
    const id2 = defaultIdFactory()
    expect(id1).toHaveLength(26)
    expect(id2).toHaveLength(26)
    expect(id1).not.toBe(id2)
  })

  test("getIdFactory() defaults to defaultIdFactory and produces valid ULIDs", () => {
    const id = getIdFactory()()
    expect(id).toHaveLength(26)
  })

  test("createDeterministicIdFactory with same seed produces same id sequence", () => {
    const a = createDeterministicIdFactory({ seed: 42 })
    const b = createDeterministicIdFactory({ seed: 42 })
    const aIds = [a(), a(), a(), a()]
    const bIds = [b(), b(), b(), b()]
    expect(aIds).toEqual(bIds)
  })

  test("different seeds produce different sequences", () => {
    const a = createDeterministicIdFactory({ seed: 1 })
    const b = createDeterministicIdFactory({ seed: 2 })
    expect(a()).not.toBe(b())
  })

  test("setIdFactory swaps in a deterministic factory; resetIdFactory restores default", () => {
    const determ = createDeterministicIdFactory({ seed: 7 })
    setIdFactory(determ)
    const idA = getIdFactory()()
    const idB = getIdFactory()()
    // Re-build a factory with the same seed and confirm we replay the
    // sequence — proves getIdFactory was actually using the override.
    const replay = createDeterministicIdFactory({ seed: 7 })
    expect(idA).toBe(replay())
    expect(idB).toBe(replay())

    resetIdFactory()
    const realId1 = getIdFactory()()
    const realId2 = getIdFactory()()
    // Default factory: not equal to the replay sequence.
    expect(realId1).not.toBe(idA)
    expect(realId2).not.toBe(idB)
  })

  test("withDeterministicIds scopes the override and restores on exit", () => {
    const before = getIdFactory()
    const captured: string[] = []
    withDeterministicIds({ seed: 99 }, () => {
      captured.push(getIdFactory()())
      captured.push(getIdFactory()())
    })
    expect(getIdFactory()).toBe(before)

    const replay = createDeterministicIdFactory({ seed: 99 })
    expect(captured[0]).toBe(replay())
    expect(captured[1]).toBe(replay())
  })

  test("ULIDs minted by deterministic factory are sortable in mint order", () => {
    const f = createDeterministicIdFactory({ seed: 0 })
    const ids = Array.from({ length: 8 }, () => f())
    const sorted = [...ids].sort()
    expect(sorted).toEqual(ids)
  })

  test("custom time function controls timestamp prefix", () => {
    const fixedTime = Date.UTC(2030, 5, 15)
    const f = createDeterministicIdFactory({ time: () => fixedTime, seed: 0 })
    const id = f()
    // The first 10 chars of a ULID encode the timestamp; same time → same prefix.
    const id2 = createDeterministicIdFactory({ time: () => fixedTime, seed: 0 })()
    expect(id.slice(0, 10)).toBe(id2.slice(0, 10))
  })

  test("active factory used by km-storage call sites: verify via end-to-end addNode", async () => {
    const { createRepo } = await import("../src/index.ts")
    const { runGenerator } = await import("@km/core")
    const { mkdtempSync, rmSync } = await import("node:fs")
    const { tmpdir } = await import("node:os")
    const { join } = await import("node:path")

    const dir = mkdtempSync(join(tmpdir(), "kmtest-id-factory-"))
    try {
      withDeterministicIds({ seed: 123 }, () => {
        const repo = runGenerator(createRepo(dir, { loadFiles: false }))
        const idA = repo.addNode(null, { type: "p", content: "alpha" })
        const idB = repo.addNode(null, { type: "p", content: "beta" })

        // Re-run the same workflow under the same seed; assert ids match.
        // Stable workflow → stable id sequence.
      })
      const altDir = mkdtempSync(join(tmpdir(), "kmtest-id-factory-replay-"))
      try {
        const captured: string[] = []
        withDeterministicIds({ seed: 123 }, () => {
          const repo = runGenerator(createRepo(altDir, { loadFiles: false }))
          captured.push(repo.addNode(null, { type: "p", content: "alpha" }))
          captured.push(repo.addNode(null, { type: "p", content: "beta" }))
        })
        // Repeat once more inside the SAME outer block to confirm replay.
        const captured2: string[] = []
        const altDir2 = mkdtempSync(join(tmpdir(), "kmtest-id-factory-replay2-"))
        try {
          withDeterministicIds({ seed: 123 }, () => {
            const repo = runGenerator(createRepo(altDir2, { loadFiles: false }))
            captured2.push(repo.addNode(null, { type: "p", content: "alpha" }))
            captured2.push(repo.addNode(null, { type: "p", content: "beta" }))
          })
          expect(captured).toEqual(captured2)
          // Each id should be 26 chars (ULID).
          expect(captured[0]).toHaveLength(26)
        } finally {
          rmSync(altDir2, { recursive: true, force: true })
        }
      } finally {
        rmSync(altDir, { recursive: true, force: true })
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
