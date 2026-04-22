/**
 * Scanner emits `node_created` through the emitter op surface
 * (km-storage.op-surface-route-scanner, Gap G1 in the op-vocabulary audit).
 *
 * Before this fix, `expandUnexploredDirectory` prepared `INSERT_NODE_SQL` and
 * wrote rows directly, so lazy-expand populated the DB without producing any
 * `node_created` events through the emitter. Phase B's oplog could not
 * reconstruct state from these scans because the events never flowed through
 * the op surface.
 *
 * After this fix, the scanner routes every node through
 * `emitter.apply({..., source: "fs-import"})` so:
 *  - the emitter's `onApply` subscribers observe each discovered node,
 *  - fs-writer subscribers filter `source === "fs-import"` and skip
 *    projection — the filesystem is the source, echoing back would loop,
 *  - in disk mode the emitter also appends to changes.jsonl.
 *
 * Lazy expansion (`preloadDepth`) is a memory-mode feature — the in-memory
 * emitter uses `skipPersist: true` so it has no journal. We verify the op
 * surface via onApply callbacks instead of journal inspection.
 */
import { test, expect, describe } from "vitest"
import { mkdtempSync, writeFileSync, mkdirSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { runGenerator } from "@km/core"
import type { Change } from "@km/core"
import { createRepo } from "../../src/repo/repo.ts"

/** Create a tmp vault with a nested directory deep enough to require expansion. */
function createVault(): string {
  const root = mkdtempSync(join(tmpdir(), "km-scan-emits-"))
  writeFileSync(join(root, "root-file.md"), "# Root File\n")
  mkdirSync(join(root, "nested"))
  writeFileSync(join(root, "nested", "hidden.md"), "# Hidden\n")
  return root
}

describe("scanner emits node_created through the op surface", () => {
  test("expandDirectory emits node_created via emitter.apply", async () => {
    const root = createVault()

    // preloadDepth: 0 → nested/ stays unexplored until expandDirectory.
    using repo = runGenerator(createRepo(root, { loadFiles: true, forceMemory: true, preloadDepth: 0 }))

    // Subscribe BEFORE expanding so we observe the scanner's emissions.
    const emitted: Array<{ change: Change; source?: string }> = []
    const unsub = repo.emitter.onApply((change, options) => {
      emitted.push({ change, source: options.source })
    })

    try {
      const result = await repo.expandDirectory("nested")
      expect(result.nodeCount).toBeGreaterThan(0)
    } finally {
      unsub()
    }

    // Scanner emits at least one node_created for nested/hidden.md.
    const hiddenEvent = emitted.find(
      (e) =>
        e.change.type === "node_created" &&
        ((e.change.data as Record<string, unknown>)?.fs_path as string | undefined) === "nested/hidden.md",
    )
    expect(hiddenEvent).toBeDefined()

    // And every scanner emission carries source: "fs-import" so downstream
    // fs-writer subscribers can filter them out (echo prevention).
    for (const e of emitted) {
      if (e.change.type === "node_created") {
        expect(e.source).toBe("fs-import")
      }
    }
  })

  test("scanner emissions bypass fs-writer projection (source filter)", async () => {
    const root = createVault()

    using repo = runGenerator(createRepo(root, { loadFiles: true, forceMemory: true, preloadDepth: 0 }))

    // Register an onApply handler that mimics fs-writer's filter: it fires
    // only for non-fs-import events. Scanner emissions must NOT reach it.
    const fsProjectionCalls: string[] = []
    const unsub = repo.emitter.onApply((change, options) => {
      if (options.source !== "fs-import") {
        fsProjectionCalls.push(change.type)
      }
    })

    try {
      await repo.expandDirectory("nested")
    } finally {
      unsub()
    }

    expect(fsProjectionCalls).toEqual([])
  })
})
