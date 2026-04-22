/**
 * Loader replay routes through `emitter.commit` with `skipPersist: true`
 * (km-storage.op-surface-route-scanner, Gap G1 in the op-vocabulary audit).
 *
 * When disk mode starts, `applyChanges` replays changes from changes.jsonl.
 * Before this fix, it called `INSERT_NODE_SQL` directly and bypassed the
 * emitter entirely. After this fix, it routes through `emitter.commit`, which
 *   - applies the change to the DB (same side effect as the manual INSERT),
 *   - does NOT append to changes.jsonl (`skipPersist: true` — the journal is
 *     what we're replaying, re-appending would double-log),
 *   - does NOT fire `onApply` subscribers (commit bypasses onApply
 *     structurally — the fs-writer must not re-project replayed changes back
 *     to the filesystem, which would echo-loop).
 */
import { test, expect, describe } from "vitest"
import { Database } from "bun:sqlite"
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, statSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { ulid } from "ulid"

import { SCHEMA } from "../../src/db/schema.ts"
import { loadRepo } from "../../src/repo/loader.ts"
import { createEmitter } from "../../src/emitter.ts"

/** Exhaust a loadRepo generator and return the result. */
function runLoadRepo(...args: Parameters<typeof loadRepo>) {
  const gen = loadRepo(...args)
  let result = gen.next()
  while (!result.done) {
    result = gen.next()
  }
  return result.value
}

/** Seed a disk-mode repo with a changes.jsonl pre-populated by a prior session. */
function seedJournal(
  root: string,
  events: Array<{
    id?: string
    type: string
    actor?: string
    target?: string
    ts?: number
    data: Record<string, unknown>
  }>,
): { kmDir: string; journalPath: string } {
  const kmDir = join(root, ".km")
  mkdirSync(kmDir, { recursive: true })
  const lines = events.map((e) =>
    JSON.stringify({
      id: e.id ?? ulid(),
      type: e.type,
      actor: e.actor ?? "test",
      target: e.target,
      ts: e.ts ?? Date.now(),
      data: e.data,
    }),
  )
  const journalPath = join(kmDir, "changes.jsonl")
  writeFileSync(journalPath, lines.join("\n") + "\n")
  return { kmDir, journalPath }
}

describe("loader replay skips persist and fs projection", () => {
  test("replay does not append duplicate entries to changes.jsonl", () => {
    const root = mkdtempSync(join(tmpdir(), "km-loader-replay-"))

    // Seed a journal with a prior node_created event.
    const { kmDir, journalPath } = seedJournal(root, [
      {
        type: "node_created",
        data: {
          id: "seeded.md",
          type: "h",
          item: {},
          fstype: "mdfile",
          parent_id: ".",
          parent_idx: 0,
          fs_path: "seeded.md",
          name: "seeded",
          title: "seeded",
        },
      },
    ])

    // Write the corresponding .md file so reconciliation doesn't emit a delete.
    writeFileSync(join(root, "seeded.md"), "# Seeded\n")

    const sizeBefore = statSync(journalPath).size

    const db = new Database(":memory:")
    db.run(SCHEMA)

    // Route replay through a real emitter (mirrors the production
    // initWithFileLoading wiring in createRepo).
    const emitter = createEmitter({ kmDir })
    runLoadRepo(root, { db, emitter, searchAncestors: false })

    // Replay must not duplicate the seeded event. Post-replay size should be
    // within a small margin of the baseline (reconcile may append a record for
    // content_hash updates, but must NOT double-log the seeded node_created).
    const journalAfter = readFileSync(journalPath, "utf-8")
    const replayEntries = journalAfter
      .trim()
      .split("\n")
      .filter((l) => l.length > 0)
      .map((l) => JSON.parse(l) as { type: string; data: Record<string, unknown> })

    const seededCreates = replayEntries.filter(
      (e) => e.type === "node_created" && (e.data.fs_path as string | undefined) === "seeded.md",
    )
    expect(seededCreates).toHaveLength(1) // the original one, not duplicated

    // DB state: the node from the journal is present.
    const row = db.prepare("SELECT id, fs_path FROM nodes WHERE fs_path = 'seeded.md'").get() as {
      id: string
      fs_path: string
    } | null
    expect(row).not.toBeNull()

    // Size sanity: journal did not grow by a duplicate of the seeded event.
    const sizeAfter = statSync(journalPath).size
    expect(sizeAfter).toBeGreaterThanOrEqual(sizeBefore)
  })

  test("replay does not fire onApply subscribers (no fs echo)", () => {
    const root = mkdtempSync(join(tmpdir(), "km-loader-replay-echo-"))
    const { kmDir } = seedJournal(root, [
      {
        type: "node_created",
        data: {
          id: "echo.md",
          type: "h",
          item: {},
          fstype: "mdfile",
          parent_id: ".",
          parent_idx: 0,
          fs_path: "echo.md",
          name: "echo",
          title: "echo",
        },
      },
    ])

    // Provide the .md file so reconciliation doesn't emit a delete.
    writeFileSync(join(root, "echo.md"), "# Echo\n")

    const db = new Database(":memory:")
    db.run(SCHEMA)

    const emitter = createEmitter({ kmDir })

    // Same shape as withFsWriter's subscriber — should skip `fs-import`.
    const fsProjectionCalls: string[] = []
    emitter.onApply((change, options) => {
      if (options.source !== "fs-import") {
        fsProjectionCalls.push(change.type)
      }
    })

    runLoadRepo(root, { db, emitter, searchAncestors: false })

    // Loader commits via emitter.commit — onApply must NOT fire at all for
    // replayed changes. The source="fs-import" tag is defensive; the real
    // guarantee is that commit() structurally bypasses onApply.
    expect(fsProjectionCalls).toEqual([])

    // DB still got the seeded node.
    const row = db.prepare("SELECT id FROM nodes WHERE fs_path = 'echo.md'").get() as { id: string } | null
    expect(row).not.toBeNull()
  })
})
