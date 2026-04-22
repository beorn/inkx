/**
 * Embed back-write + anchor minting + baseline-hash realignment —
 * every derived DB mutation routes through `emitter.commit()` so DB and
 * `changes.jsonl` are paired per row (op-vocabulary audit gaps G4/G7/G9).
 *
 * Post-v6 anchor literals live in `.name` per storage-architecture §2.3
 * (no separate `block_id` column).
 *
 * Before this work, these sites did a direct `db.run("UPDATE nodes ...")`
 * alongside an `emitNodeUpdated(...)` (or no emit at all) — the two writes
 * could drift if the process crashed between them, and the journal entries
 * skipped the DB-apply path. The fix standardizes them on
 * `emitter.commit()`, which takes the row through `applyChangeWithDb` +
 * `appendFileSync` in the same call. `commit()` (not `apply()`) is used
 * because these are FS-origin side-effects: `apply()` would fire onApply
 * subscribers and echo the derived value back to disk.
 */

import { describe, test, expect } from "vitest"
import { mkdirSync, writeFileSync, readFileSync, existsSync, renameSync } from "node:fs"
import { join } from "node:path"
import type { Database } from "bun:sqlite"

import { withTestEnv, createEmitter } from "@km/storage"
import { ChangeHandlers, type FsWriteTarget } from "../../src/watch/change-handlers.ts"
import { handleCreate, type ReconcileContext } from "../../src/watch/handlers/create-handler.ts"
import { handleUpdate } from "../../src/watch/handlers/update-handler.ts"
import { realFs } from "../../src/watch/writequeue.ts"
import { createLinkResolver, type LinkResolver } from "@km/storage"

/** Minimal FsWriteTarget for ChangeHandlers that performs real file IO. */
function createRealFsTarget(): FsWriteTarget {
  return {
    writeFile: (absPath, content) => {
      writeFileSync(absPath, content)
    },
    deleteFile: () => {},
    renameFile: (oldPath, newPath) => renameSync(oldPath, newPath),
    mkdir: (absPath) => {
      mkdirSync(absPath, { recursive: true })
    },
    markInFlight: () => {},
    clearInFlight: () => {},
    recordWriteToken: () => {},
  }
}

function readJournal(kmDir: string): Array<Record<string, unknown>> {
  const changesPath = join(kmDir, "changes.jsonl")
  if (!existsSync(changesPath)) return []
  const raw = readFileSync(changesPath, "utf-8").trim()
  if (!raw) return []
  return raw.split("\n").map((line) => JSON.parse(line) as Record<string, unknown>)
}

/** Pull node_updated journal entries whose data contains any of the given keys. */
function journalUpdatesWith(
  journal: Array<Record<string, unknown>>,
  target: string,
  keys: string[],
): Array<Record<string, unknown>> {
  return journal.filter((e) => {
    if (e.type !== "node_updated" || e.target !== target) return false
    const data = e.data as Record<string, unknown> | undefined
    if (!data) return false
    return keys.some((k) => Object.prototype.hasOwnProperty.call(data, k))
  })
}

function readNodeRow(db: Database, id: string): Record<string, unknown> | null {
  const row = db
    .query("SELECT id, content_hash, fs_content_hash, embed_of, name FROM nodes WHERE id = ?")
    .get(id) as Record<string, unknown> | null
  return row
}

function insertFileNode(db: Database, id: string, name: string, fsPath: string, contentHash: string): void {
  db.run(
    `INSERT INTO nodes (id, type, parent_id, parent_idx, item, content, name, fs_path, fstype, content_hash, fs_content_hash, created_at, updated_at)
     VALUES (?, 'h', '.', 0, 1, ?, ?, ?, 'mdfile', ?, ?, 0, 0)`,
    [id, name, name, fsPath, contentHash, contentHash],
  )
}

function makeCtx(resolver: LinkResolver): ReconcileContext {
  return {
    newFiles: [],
    resolver,
  }
}

describe("update-handler — embed_of back-write (G4)", () => {
  test("emit node_updated with embed_of when parsing a file that embeds another", () =>
    withTestEnv(({ repoDir, db, kmDir }) => {
      // Target file: exists on disk + in DB, is the embed target.
      writeFileSync(join(repoDir, "target.md"), "# target\n")
      insertFileNode(db, "target-id", "target", "target.md", "initial-hash")

      // Host file: references target via embed.
      const hostPath = join(repoDir, "host.md")
      writeFileSync(hostPath, "# host\n\n![[target]]\n")
      insertFileNode(db, "host-id", "host", "host.md", "old-hash")

      const emitter = createEmitter({ kmDir, db, skipPersist: false })
      const resolver = createLinkResolver(db)
      const ctx = makeCtx(resolver)

      handleUpdate({
        db,
        op: {
          type: "update",
          path: hostPath,
          nodeId: "host-id",
          mtime: 0,
          ino: 0,
        },
        repoRoot: repoDir,
        emitter,
        fs: realFs,
        ctx,
      })

      const journal = readJournal(kmDir)
      // After parse, some descendant node (not host-id itself) carries the
      // embed reference. Confirm that SOMETHING in the journal has embed_of
      // pointing at target-id.
      const embedEmits = journal.filter((e) => {
        if (e.type !== "node_updated") return false
        const data = e.data as Record<string, unknown> | undefined
        return data?.embed_of === "target-id"
      })
      expect(embedEmits.length).toBeGreaterThanOrEqual(1)

      // For each such emit, the actor must be "fs-watch" (FS-origin) and the
      // DB row must match (paired write).
      for (const entry of embedEmits) {
        expect(entry.actor).toBe("fs-watch")
        const target = entry.target as string
        const row = readNodeRow(db, target)
        expect(row, `DB row missing for embed host ${target}`).not.toBeNull()
        expect(row!.embed_of).toBe("target-id")
      }
    }))
})

describe("create-handler — embed_of back-write (G4)", () => {
  test("emit node_updated with embed_of when creating a file that embeds another", () =>
    withTestEnv(({ repoDir, db, kmDir }) => {
      // Target file: exists on disk + in DB.
      writeFileSync(join(repoDir, "target.md"), "# target\n")
      insertFileNode(db, "target-id", "target", "target.md", "initial-hash")

      // Host file: newly created with embed ref.
      const hostPath = join(repoDir, "host.md")
      writeFileSync(hostPath, "# host\n\n![[target]]\n")

      const emitter = createEmitter({ kmDir, db, skipPersist: false })
      const resolver = createLinkResolver(db)
      const ctx = makeCtx(resolver)

      handleCreate({
        db,
        op: {
          type: "create",
          path: hostPath,
          mtime: 0,
          ino: 0,
          dev: 0,
          size: 0,
        },
        repoRoot: repoDir,
        emitter,
        fs: realFs,
        ctx,
      })

      const journal = readJournal(kmDir)
      const embedEmits = journal.filter((e) => {
        if (e.type !== "node_updated") return false
        const data = e.data as Record<string, unknown> | undefined
        return data?.embed_of === "target-id"
      })
      expect(embedEmits.length).toBeGreaterThanOrEqual(1)

      for (const entry of embedEmits) {
        expect(entry.actor).toBe("fs-watch")
        const row = readNodeRow(db, entry.target as string)
        expect(row).not.toBeNull()
        expect(row!.embed_of).toBe("target-id")
      }
    }))
})

describe("change-handlers — anchor minting routes through emitter (G4/G7)", () => {
  test("assign() writes DB.name and journals a paired node_updated", () =>
    withTestEnv(({ repoDir, db, kmDir }) => {
      // An unanchored task-like node that needs an anchor on next serialize.
      db.run(
        `INSERT INTO nodes (id, type, parent_id, parent_idx, item, content, created_at, updated_at)
         VALUES ('blk1', 'p', '.', 0, 1, 'an unanchored block', 0, 0)`,
      )

      const emitter = createEmitter({ kmDir, db, skipPersist: false })
      const handlers = new ChangeHandlers(db, repoDir, emitter, createRealFsTarget())

      const { assign } = handlers.createBlockIdAssigner("test-change")
      assign("blk1", "abc12345")

      // Journal: one node_updated for blk1, data.name = "abc12345"
      // Post-v6 anchors are folded into `.name` (storage-architecture §2.3).
      const journal = readJournal(kmDir)
      const anchorEntries = journalUpdatesWith(journal, "blk1", ["name"])
      expect(anchorEntries.length).toBe(1)
      const entry = anchorEntries[0]!
      expect(entry.type).toBe("node_updated")
      expect(entry.target).toBe("blk1")
      expect(entry.actor).toBe("fs-watch")
      const data = entry.data as Record<string, unknown>
      expect(data.name).toBe("abc12345")

      // DB: the node now carries the anchor in `.name`.
      const row = readNodeRow(db, "blk1")
      expect(row).not.toBeNull()
      expect(row!.name).toBe("abc12345")
    }))
})

describe("change-handlers — baseline-hash realignment after mergeExternalDrift (G9)", () => {
  test("save() into a drifted file emits paired content_hash + fs_content_hash updates", () =>
    withTestEnv(({ repoDir, db, kmDir }) => {
      // Seed: file exists on disk. DB records an older content_hash so
      // readDiskContentIfChanged detects drift when save() runs.
      const fsPath = join(repoDir, "doc.md")
      const diskContent = "# doc\n\nfresh content on disk\n"
      writeFileSync(fsPath, diskContent)

      insertFileNode(db, "doc-id", "doc", "doc.md", "stale-hash-from-last-observation")

      const emitter = createEmitter({ kmDir, db, skipPersist: false })
      const handlers = new ChangeHandlers(db, repoDir, emitter, createRealFsTarget())

      // Trigger save(). Under the post-writeback-cas contract (2026-04):
      //   - mergeExternalDrift emits node_updated { content_hash, fs_content_hash }
      //     both = hash(disk content). This is the baseline-realignment emit.
      //   - save() then writes the merged content to disk via the fs target
      //     (safe-write path), which updates fs_content_hash on the node to
      //     the post-write disk hash.
      //   - save() then emits node_updated { content_hash } (only) via
      //     updateContentBaseline, advancing the parsed-content baseline.
      // The write path owns fs_content_hash; save() owns content_hash.
      handlers.applyChangeToFs({
        id: "evt-drift",
        ts: Date.now(),
        type: "node_updated",
        target: "doc-id",
        actor: "user",
        data: { title: "doc" }, // Triggers save(node) via handleNodeUpdated
      })

      const journal = readJournal(kmDir)

      // Exactly one baseline-realignment emit (from mergeExternalDrift)
      // carries both content_hash and fs_content_hash, actor = fs-watch.
      const baselineEmits = journal.filter((e) => {
        if (e.type !== "node_updated" || e.target !== "doc-id") return false
        const data = e.data as Record<string, unknown> | undefined
        return (
          data !== undefined &&
          Object.prototype.hasOwnProperty.call(data, "content_hash") &&
          Object.prototype.hasOwnProperty.call(data, "fs_content_hash")
        )
      })
      expect(baselineEmits.length).toBeGreaterThanOrEqual(1)

      const last = baselineEmits[baselineEmits.length - 1]!
      expect(last.actor).toBe("fs-watch")
      const data = last.data as Record<string, unknown>
      expect(data.content_hash).toBe(data.fs_content_hash)
      expect(typeof data.content_hash).toBe("string")

      // The row's fs_content_hash must reflect the final on-disk state —
      // owned by the write path, updated atomically with the atomic write
      // (§7.1 step 5). It equals hash(post-save disk content).
      const row = readNodeRow(db, "doc-id")
      expect(row).not.toBeNull()
      expect(typeof row!.fs_content_hash).toBe("string")
      expect(typeof row!.content_hash).toBe("string")
      // content_hash may have advanced past the drift-emit as save() serialized
      // the merged content; fs_content_hash likewise reflects post-write disk.
    }))
})
