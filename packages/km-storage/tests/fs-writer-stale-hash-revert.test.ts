/**
 * Regression test for `@km/storage/fs-writer-stale-hash-revert` (P0 bug).
 *
 * Repro from the bead body:
 *
 *   1. Externally edit any file F via the Write tool (e.g.
 *      `.claude/skills/foo/SKILL.md`, `apps/silvercode/src/chat/types.ts`).
 *   2. Run `km bd update <unrelated-bead> --priority P1` (or any other
 *      command that drives a write-back pass).
 *   3. Observe: `WARN km:storage:watch:fs-writer safe-write conflict: <F>`,
 *      and a `conflict_created` event lands in the events table for F.
 *      In severe cases (the user's groom 2026-05-08 session), N sequential
 *      external Write calls on F all collide with km's writeback.
 *
 * Where the bug actually fires:
 *
 *   The simple `repo.updateNode(beadA)` path through `withFsWriter` only
 *   writes the bead's containing file — F is structurally out of scope and
 *   always preserved (T1/T2/T3 below). The bug surfaces in `BulkSync.toFs`
 *   (`packages/km-fs-mount/src/watch/bulk-sync.ts`), which projects EVERY
 *   file node in the DB back to disk. Unlike the symmetric `BulkSync.fromFs`
 *   path, `toFs` did NOT have a content-hash-equality skip — so even files
 *   whose rendered content matched their DB baseline got queued for write.
 *   When a queued write hits a file the user externally edited, `safeWriteFile`
 *   correctly refuses (CAS guard intact, F preserved on disk) but logs the
 *   warning + emits a spurious `conflict_created` event (T4 below).
 *
 * Contract being pinned:
 *
 *   - The CAS guard MUST NEVER overwrite a file whose disk bytes don't
 *     match the DB's last-known hash. (Cross-file non-interference: a
 *     write to bead-A's file must NEVER touch file F.)
 *   - `BulkSync.toFs` MUST NOT emit `conflict_created` events for files
 *     whose rendered content already matches the DB's `fs_content_hash`
 *     baseline — those files are no-op writes and should be skipped.
 *
 * Tests:
 *
 *   (T1) `assigned_to` update on bead-A doesn't touch unrelated F.
 *   (T2) N sequential `assigned_to` updates preserve N external edits to F.
 *   (T3) No `conflict_created` events emitted for F when `bd update` only
 *        touches bead-A.
 *   (T4) `BulkSync.toFs` skips no-op writes for files whose rendered
 *        content matches `fs_content_hash` — even when disk has drifted
 *        (the user's external Write). This is the failing test on main.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "fs"
import { join } from "path"

import { runGenerator } from "@km/core"
import { createRepo, createEmitter } from "../src/index.ts"
import { withSync } from "@km/fs-mount"

function createTempDir(): string {
  const dir = join("/tmp", `kmtest-stalehash-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

function cleanupTempDir(dir: string): void {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe("fs-writer: external write to unrelated file is preserved across in-app mutations", () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = createTempDir()
  })

  afterEach(() => {
    cleanupTempDir(tempDir)
  })

  test("assigned_to update on bead-A does not revert externally-written unrelated F", () => {
    // Disk-mode repo (mkdir .km) — wires `withFsWriter` (CLI write-back path).
    mkdirSync(join(tempDir, ".km"), { recursive: true })

    // Bead-A — the file we'll mutate via repo.updateNode (mimics `km bd update`).
    const beadAPath = join(tempDir, "bead-a.md")
    writeFileSync(beadAPath, "# Bead A #task\n\n- [ ] Do the work\n", "utf-8")

    // File F — wholly unrelated. Lives in the same vault but is its own file
    // node; nothing in bead-A's mutation should touch it.
    const filePath = join(tempDir, "unrelated.md")
    writeFileSync(filePath, "# Unrelated\n\nThe DB knows about this content.\n", "utf-8")

    // First load — DB ingests both files and records `fs_content_hash`.
    const repo1 = runGenerator(createRepo(tempDir, { loadFiles: true }))
    const beadANode = repo1.database.prepare("SELECT id FROM nodes WHERE fs_path = ?").get("bead-a.md") as {
      id: string
    } | null
    expect(beadANode).toBeTruthy()
    repo1.close()

    // Simulate the user editing F externally between km invocations
    // (e.g. via the Write tool). The DB still has the OLD `fs_content_hash`
    // for F because the watcher isn't running and reconcile only checks
    // path add/delete on the boot path.
    const externalEdit = "# Unrelated\n\nUSER-WRITTEN content that must NOT be reverted.\n"
    writeFileSync(filePath, externalEdit, "utf-8")

    // Second load — the CLI variant wires `withFsWriter`; the unrelated edit
    // is now on disk but the DB's view of F may be stale.
    const repo2 = runGenerator(createRepo(tempDir, { loadFiles: true }))

    // Mutate bead-A via `assigned_to` — a non-content, non-rename change
    // (the way `km bd update --assignee` does). This MUST produce a real
    // file write for bead-A but MUST NOT touch unrelated.md.
    if (!beadANode) throw new Error("bead-a node missing after reload")
    repo2.updateNode(beadANode.id, { assigned_to: "agent-7" })

    // F's bytes on disk MUST still match what the user wrote. Anything else
    // is the bug.
    const finalContent = readFileSync(filePath, "utf-8")
    expect(finalContent).toBe(externalEdit)

    repo2.close()
  })

  test("N sequential mutations on bead-A preserve N externally-written F (severe-case repro)", () => {
    // The bead's "severe case": N sequential bd updates each reverting F.
    // Pin it explicitly so we don't regress just the first-write case.
    mkdirSync(join(tempDir, ".km"), { recursive: true })

    const beadAPath = join(tempDir, "bead-a.md")
    writeFileSync(beadAPath, "# Bead A #task\n\n- [ ] x\n", "utf-8")

    const filePath = join(tempDir, "unrelated.md")
    writeFileSync(filePath, "# Unrelated\n\nv1\n", "utf-8")

    const repo1 = runGenerator(createRepo(tempDir, { loadFiles: true }))
    const beadANode = repo1.database.prepare("SELECT id FROM nodes WHERE fs_path = ?").get("bead-a.md") as {
      id: string
    } | null
    expect(beadANode).toBeTruthy()
    repo1.close()

    // Three external edits interleaved with three mutations.
    for (let i = 1; i <= 3; i++) {
      const externalEdit = `# Unrelated\n\nuser-edit-${i}\n`
      writeFileSync(filePath, externalEdit, "utf-8")

      const repo = runGenerator(createRepo(tempDir, { loadFiles: true }))
      repo.updateNode(beadANode!.id, { assigned_to: `tester-${i}` })
      repo.close()

      expect(readFileSync(filePath, "utf-8")).toBe(externalEdit)
    }
  })

  test("no conflict_created events emitted for F when bd update only touches bead-A", () => {
    // The bead reports the visible warning is `safe-write conflict: <file>`.
    // safeWriteFile fires a `conflict_created` change in addition to the
    // log.warn — so the events table is the canonical record of "did the
    // CAS guard ever consider F a write candidate". Pin that NO such event
    // lands when bd update is unrelated to F.
    mkdirSync(join(tempDir, ".km"), { recursive: true })

    const beadAPath = join(tempDir, "bead-a.md")
    writeFileSync(beadAPath, "# Bead A #task\n\n- [ ] z\n", "utf-8")

    const filePath = join(tempDir, "unrelated.md")
    writeFileSync(filePath, "# Unrelated\n\nv1\n", "utf-8")

    const repo1 = runGenerator(createRepo(tempDir, { loadFiles: true }))
    const beadANode = repo1.database.prepare("SELECT id FROM nodes WHERE fs_path = ?").get("bead-a.md") as {
      id: string
    } | null
    expect(beadANode).toBeTruthy()
    repo1.close()

    // External edit drifts F's on-disk content away from the DB's
    // `fs_content_hash` baseline.
    writeFileSync(filePath, "# Unrelated\n\nuser overwrote this\n", "utf-8")

    const repo2 = runGenerator(createRepo(tempDir, { loadFiles: true }))

    // Snapshot pre-update events targeting F's relative path. We assert no
    // NEW conflict_created events land for F after the bd update.
    const eventsTablePresent =
      (
        repo2.database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='events'").get() as
          | { name: string }
          | undefined
      )?.name === "events"
    const beforeCount = eventsTablePresent
      ? (
          repo2.database
            .prepare(
              `SELECT COUNT(*) AS n FROM events
               WHERE type = 'conflict_created'
                 AND json_extract(data, '$.fs_path') = ?`,
            )
            .get("unrelated.md") as { n: number }
        ).n
      : 0

    repo2.updateNode(beadANode!.id, { assigned_to: "tester" })

    const afterCount = eventsTablePresent
      ? (
          repo2.database
            .prepare(
              `SELECT COUNT(*) AS n FROM events
               WHERE type = 'conflict_created'
                 AND json_extract(data, '$.fs_path') = ?`,
            )
            .get("unrelated.md") as { n: number }
        ).n
      : 0

    expect(afterCount).toBe(beforeCount)
    repo2.close()
  })

  test("BulkSync.toFs: no spurious conflict_created when rendered content matches fs_content_hash baseline", async () => {
    // The actual bug: BulkSync.toFs (the path behind `km sync --to-fs`,
    // and the same machinery used by withSync's writeback) writes every
    // file node unconditionally. When an unrelated file F has a
    // user-written disk content that drifted from the DB's
    // `fs_content_hash`, the queued write trips the CAS guard and emits
    // `conflict_created` — even though the rendered content from the DB
    // is byte-identical to the baseline `fs_content_hash`. That's a
    // spurious "I wanted to write the same bytes I last wrote, please"
    // event, and it's exactly the noise the user sees during slot-cleanup
    // sessions.
    //
    // The fix mirrors `BulkSync.fromFs`'s line ~410 CAS-skip: if the
    // rendered content's hash matches the DB's `fs_content_hash`, skip
    // the queue entirely. The user's external edit is preserved (we
    // never queued the write) AND no spurious conflict event lands.
    //
    // This is the failing test on main.
    mkdirSync(join(tempDir, ".km"), { recursive: true })

    // Bead-A (the file we care about; will be unchanged across the test).
    const beadAPath = join(tempDir, "bead-a.md")
    writeFileSync(beadAPath, "# Bead A #task\n\n- [ ] task one\n", "utf-8")

    // File F — also a markdown file in the vault. The DB will track it
    // and the rendered content of F will equal its `fs_content_hash`
    // baseline (a steady-state file, no drift in DB-land).
    const filePath = join(tempDir, "unrelated.md")
    const initialF = "# Unrelated\n\nstable content km has indexed.\n"
    writeFileSync(filePath, initialF, "utf-8")

    // Boot: load both files. DB now has nodes for bead-A.md and
    // unrelated.md, with `fs_content_hash` matching disk for both.
    const repo = runGenerator(createRepo(tempDir, { loadFiles: true }))

    // Suppress the expected log.warn so it doesn't crash vitest's
    // console-output guard. We inspect the events table for the spurious
    // `conflict_created`, not console output.
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    try {
      // User externally edits F. The DB still has the OLD `fs_content_hash`
      // (matches initialF, not the user's new content). The DB's rendered
      // content for F is also still initialF — no DB-side drift.
      const externalEdit = "# Unrelated\n\nUSER WROTE THIS — must not be overwritten.\n"
      writeFileSync(filePath, externalEdit, "utf-8")

      // Snapshot conflict_created events for F before the toFs pass.
      const eventsTablePresent =
        (
          repo.database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='events'").get() as
            | { name: string }
            | undefined
        )?.name === "events"
      expect(eventsTablePresent).toBe(true) // disk mode → events table exists

      const beforeF = (
        repo.database
          .prepare(
            `SELECT COUNT(*) AS n FROM events
             WHERE type = 'conflict_created'
               AND json_extract(data, '$.fs_path') = ?`,
          )
          .get("unrelated.md") as { n: number }
      ).n

      // Run a `BulkSync.toFs` pass via withSync's manager — this is what
      // `km sync --to-fs` invokes. Use minimal debounces so the writeback
      // queue flushes synchronously on `forceFlush`.
      const emitter = createEmitter({ kmDir: join(tempDir, ".km"), db: repo.database })
      const manager = withSync(emitter, {
        debounceFs: 0,
        debounceApply: 0,
        conflictStrategy: "last_write_wins",
        useWorker: false,
      })({
        database: repo.database,
        path: tempDir,
        apply: (event, options) => emitter.apply(event, options),
        commit: (event, options) => emitter.commit(event, options),
      })

      try {
        await manager.syncToFs()
      } finally {
        await manager.stop()
      }

      // F's bytes on disk MUST still match what the user wrote — the CAS
      // guard's safety net is intact regardless of the spurious-event bug.
      expect(readFileSync(filePath, "utf-8")).toBe(externalEdit)

      // The bug: BulkSync.toFs queued a write for F (rendered content ==
      // initialF == fs_content_hash), the queue's CAS guard saw disk !=
      // expected, and emitted `conflict_created`. The fix: skip the queue
      // entirely when rendered content == fs_content_hash.
      const afterF = (
        repo.database
          .prepare(
            `SELECT COUNT(*) AS n FROM events
             WHERE type = 'conflict_created'
               AND json_extract(data, '$.fs_path') = ?`,
          )
          .get("unrelated.md") as { n: number }
      ).n

      expect(afterF).toBe(beforeF)
    } finally {
      warnSpy.mockRestore()
      repo.close()
    }
  })
})
