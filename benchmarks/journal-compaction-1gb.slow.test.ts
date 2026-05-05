/**
 * Synthetic 1 GB+ journal acceptance for `@km/storage/journal-compaction`.
 *
 * Skipped by default — set `RUN_JOURNAL_GB_TEST=1` to opt in. The file write
 * + compaction touches multi-GB of disk and would dominate `test:fast` /
 * `test:slow` runtime if it ran unconditionally.
 *
 * Acceptance contract (from the bead):
 *   - Compaction routine in place ✅ (compactJournal exported)
 *   - After compaction, changes.jsonl size < 100 MB on a vault with 1 M+
 *     historical events ✅ (this test)
 *   - Cold load from compacted state matches cold load from full journal —
 *     covered by the unit invariant: state.db is the source of truth and
 *     unaffected by truncating already-applied bytes.
 */

import { describe, test, expect } from "vitest"
import { Database } from "bun:sqlite"
import { appendFileSync, mkdirSync, mkdtempSync, statSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { compactJournal, SCHEMA, migrateSchema, migrateData, ensureRepoRootNode } from "@km/storage"

const ENABLED = process.env.RUN_JOURNAL_GB_TEST === "1"

describe.skipIf(!ENABLED)("compactJournal — 1 GB+ synthetic journal", () => {
  test("trims to < 100 MB when state.db has applied the full journal", () => {
    const repoPath = mkdtempSync(join(tmpdir(), "km-journal-1gb-"))
    const kmDir = join(repoPath, ".km")
    mkdirSync(kmDir, { recursive: true })
    const changesPath = join(kmDir, "changes.jsonl")

    // Synthetic events shaped like rule writebacks (recomputable noise).
    // Block of 1000 lines amortizes the appendFileSync cost.
    const block =
      Array.from({ length: 1000 })
        .map(
          (_, i) =>
            `{"id":"01HXX${String(i).padStart(20, "0")}","ts":${1700000000000 + i},"type":"node_updated",` +
            `"actor":"fs-watch","target":"node-${i}","data":{"content":"line-${i}","embed_of":"target-${i}","fs_mtime":${i}}}`,
        )
        .join("\n") + "\n"
    const blockBytes = Buffer.byteLength(block, "utf-8")
    const targetBytes = 1.05 * 1024 * 1024 * 1024 // > 1 GB
    const blocks = Math.ceil(targetBytes / blockBytes)

    writeFileSync(changesPath, "")
    for (let i = 0; i < blocks; i++) {
      appendFileSync(changesPath, block)
    }
    const sizeBefore = statSync(changesPath).size
    expect(sizeBefore).toBeGreaterThan(1024 * 1024 * 1024) // > 1 GB

    // Mark the entire file as applied — i.e., state.db has folded every
    // event in. compactJournal should reduce the on-disk footprint to ~0.
    const db = new Database(join(kmDir, "state.db"))
    try {
      migrateSchema(db)
      db.run(SCHEMA)
      migrateData(db)
      ensureRepoRootNode(db, repoPath)
      db.run("INSERT OR REPLACE INTO meta (key, value) VALUES ('last_event_offset', ?)", [String(sizeBefore)])
      db.run("INSERT OR REPLACE INTO meta (key, value) VALUES ('last_event', '01HXXLATEST')")

      const result = compactJournal(kmDir, db)

      expect(result.truncated).toBe(true)
      expect(result.bytesAfter).toBeLessThan(100 * 1024 * 1024) // < 100 MB
      expect(result.bytesReclaimed).toBeGreaterThan(900 * 1024 * 1024)

      // Snapshot stamp records the highest applied event id at compaction time.
      const snap = db.prepare("SELECT value FROM meta WHERE key = ?").get("last_snapshot_event") as
        | { value: string }
        | undefined
      expect(snap?.value).toBe("01HXXLATEST")
    } finally {
      db.close()
    }
  })
})
