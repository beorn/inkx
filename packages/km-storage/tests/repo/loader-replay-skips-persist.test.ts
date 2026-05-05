/**
 * Loader replay routes through `emitter.commit` with `skipPersist: true`
 * (km-storage.op-surface-route-scanner, Gap G1 in the op-vocabulary audit).
 *
 * When disk mode starts, `applyChanges` replays events from the events
 * table inside state.db. Before this fix, it called `INSERT_NODE_SQL`
 * directly and bypassed the emitter entirely. After this fix, it routes
 * through `emitter.commit`, which
 *   - applies the change to the DB (same side effect as the manual INSERT),
 *   - does NOT insert another events row (`skipPersist: true` — the
 *     events being replayed already live in the table; re-inserting would
 *     double-log),
 *   - does NOT fire `onApply` subscribers (commit bypasses onApply
 *     structurally — the fs-writer must not re-project replayed changes
 *     back to the filesystem, which would echo-loop).
 */
import { test, expect, describe } from "vitest"
import { Database } from "bun:sqlite"
import { mkdtempSync, writeFileSync, mkdirSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { ulid } from "ulid"

import { applyConnectionPragmas, migrateData, migrateSchema, SCHEMA } from "../../src/index.ts"
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

/**
 * Seed a disk-mode repo with a `state.db` whose events table is
 * pre-populated by a prior session. Returns the open Database for the
 * test to pass to loadRepo.
 */
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
): { kmDir: string; db: Database } {
  const kmDir = join(root, ".km")
  mkdirSync(kmDir, { recursive: true })

  const db = new Database(join(kmDir, "state.db"))
  applyConnectionPragmas(db)
  migrateSchema(db)
  db.run(SCHEMA)
  migrateData(db)

  for (const e of events) {
    const event = {
      id: e.id ?? ulid(),
      type: e.type,
      actor: e.actor ?? "test",
      target: e.target,
      ts: e.ts ?? Date.now(),
      data: e.data,
    }
    db.run(`INSERT INTO events (id, ts, type, actor, target, data) VALUES (?, ?, ?, ?, ?, ?)`, [
      event.id,
      event.ts,
      event.type,
      event.actor,
      event.target ?? null,
      JSON.stringify(event),
    ])
  }
  return { kmDir, db }
}

describe("loader replay skips persist and fs projection", () => {
  test("replay does not insert duplicate rows into the events table", () => {
    const root = mkdtempSync(join(tmpdir(), "km-loader-replay-"))

    // Seed the events table with a prior node_created event.
    const { kmDir, db } = seedJournal(root, [
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

    const seededCountBefore = (
      db
        .prepare(`SELECT COUNT(*) AS n FROM events WHERE type = 'node_created' AND data LIKE '%"fs_path":"seeded.md"%'`)
        .get() as { n: number }
    ).n
    expect(seededCountBefore).toBe(1)

    // Route replay through a real emitter (mirrors the production
    // initWithFileLoading wiring in createRepo).
    const emitter = createEmitter({ kmDir, db })
    runLoadRepo(root, { db, emitter, searchAncestors: false })

    // Replay must not duplicate the seeded event in the events table.
    const seededCountAfter = (
      db
        .prepare(`SELECT COUNT(*) AS n FROM events WHERE type = 'node_created' AND data LIKE '%"fs_path":"seeded.md"%'`)
        .get() as { n: number }
    ).n
    expect(seededCountAfter).toBe(1)

    // DB state: the node from the events table is present.
    const row = db.prepare("SELECT id, fs_path FROM nodes WHERE fs_path = 'seeded.md'").get() as {
      id: string
      fs_path: string
    } | null
    expect(row).not.toBeNull()
  })

  test("replay does not fire onApply subscribers (no fs echo)", () => {
    const root = mkdtempSync(join(tmpdir(), "km-loader-replay-echo-"))
    const { kmDir, db } = seedJournal(root, [
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

    const emitter = createEmitter({ kmDir, db })

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
