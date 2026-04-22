/**
 * Rename atomicity — DB + changes.jsonl stay paired per row.
 *
 * The rename paths in ChangeHandlers historically did `db.run("UPDATE
 * nodes SET fs_path = ?")` then hand-rolled a journal append — two writes
 * with a crash window between them that could leave the DB ahead of the
 * journal (silent corruption).
 *
 * These tests pin down the fix: every rename routes through
 * `emitter.commit()`, which pairs the DB write with a `changes.jsonl`
 * append per row. Cascades become N node_updated ops, one per descendant.
 * FS-origin changes use `commit()` (not `apply()`) so onApply subscribers
 * do not re-project them back to disk (echo-loop prevention).
 */

import { describe, test, expect } from "vitest"
import { mkdirSync, writeFileSync, readFileSync, existsSync, renameSync } from "fs"
import { join } from "path"
import type { Database } from "bun:sqlite"

import { withTestEnv, createEmitter } from "@km/storage"
import { ChangeHandlers, type FsWriteTarget } from "../../src/watch/change-handlers.ts"
import { computeRenameCascade } from "../../src/watch/rename-cascade.ts"

/** Minimal FsWriteTarget — performs real renames, records nothing else. */
function createRealFsTarget(): FsWriteTarget {
  return {
    writeFile: () => {},
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

function insertFileNode(db: Database, id: string, name: string, fsPath: string): void {
  db.run(
    `INSERT INTO nodes (id, type, parent_id, parent_idx, item, content, name, fs_path, fstype, created_at, updated_at)
     VALUES (?, 'h', '.', 0, 1, ?, ?, ?, 'mdfile', 0, 0)`,
    [id, name, name, fsPath],
  )
}

function insertFolderNode(db: Database, id: string, name: string, fsPath: string): void {
  db.run(
    `INSERT INTO nodes (id, type, parent_id, parent_idx, item, content, name, fs_path, fstype, created_at, updated_at)
     VALUES (?, 'h', '.', 0, 1, ?, ?, ?, 'folder', 0, 0)`,
    [id, name, name, fsPath],
  )
}

function insertDescendantFile(
  db: Database,
  id: string,
  name: string,
  fsPath: string,
  parentId: string,
  idx: number,
): void {
  db.run(
    `INSERT INTO nodes (id, type, parent_id, parent_idx, item, content, name, fs_path, fstype, created_at, updated_at)
     VALUES (?, 'h', ?, ?, 1, ?, ?, ?, 'mdfile', 0, 0)`,
    [id, parentId, idx, name, name, fsPath],
  )
}

function readJournal(kmDir: string): Array<Record<string, unknown>> {
  const changesPath = join(kmDir, "changes.jsonl")
  if (!existsSync(changesPath)) return []
  const raw = readFileSync(changesPath, "utf-8").trim()
  if (!raw) return []
  return raw.split("\n").map((line) => JSON.parse(line) as Record<string, unknown>)
}

describe("rename-atomicity — file rename", () => {
  test("emits exactly one journal entry and DB matches journal", () =>
    withTestEnv(({ repoDir, db, kmDir }) => {
      writeFileSync(join(repoDir, "Old Name.md"), "# Old Name\n")
      insertFileNode(db, "file1", "Old Name", "Old Name.md")

      const emitter = createEmitter({ kmDir, db, skipPersist: false })
      const handlers = new ChangeHandlers(db, repoDir, emitter, createRealFsTarget())

      handlers.applyChangeToFs({
        id: "evt1",
        ts: Date.now(),
        type: "node_updated",
        target: "file1",
        actor: "user",
        data: { content: "New Name" },
      })

      // Journal: at least one node_updated with fs_path in data for this target
      const journal = readJournal(kmDir)
      const renameRows = journal.filter((e) => {
        const data = e.data as Record<string, unknown> | undefined
        return e.type === "node_updated" && e.target === "file1" && data?.fs_path === "New Name.md"
      })
      expect(renameRows.length).toBe(1)

      const renameData = renameRows[0]!.data as Record<string, unknown>
      expect(renameData.name).toBe("New Name")
      expect(renameData.title).toBe("New Name")
      expect(renameData.old_fs_path).toBe("Old Name.md")

      // DB row reflects the same post-rename state
      const row = db.query("SELECT fs_path, name, title FROM nodes WHERE id = ?").get("file1") as Record<
        string,
        unknown
      >
      expect(row.fs_path).toBe("New Name.md")
      expect(row.name).toBe("New Name")
      expect(row.title).toBe("New Name")
    }))
})

describe("rename-atomicity — folder rename with descendants", () => {
  test("cascades one node_updated per descendant; DB + journal in sync", () =>
    withTestEnv(({ repoDir, db, kmDir }) => {
      const folderPath = join(repoDir, "parent")
      mkdirSync(folderPath, { recursive: true })
      mkdirSync(join(folderPath, "sub"), { recursive: true })

      writeFileSync(join(folderPath, "a.md"), "# A")
      writeFileSync(join(folderPath, "b.md"), "# B")
      writeFileSync(join(folderPath, "c.md"), "# C")
      writeFileSync(join(folderPath, "sub", "d.md"), "# D")
      writeFileSync(join(folderPath, "sub", "e.md"), "# E")

      insertFolderNode(db, "folder1", "parent", "parent")
      insertDescendantFile(db, "a", "a", "parent/a.md", "folder1", 0)
      insertDescendantFile(db, "b", "b", "parent/b.md", "folder1", 1)
      insertDescendantFile(db, "c", "c", "parent/c.md", "folder1", 2)
      // sub folder + nested files also live under the prefix — cascade picks them by fs_path LIKE.
      insertDescendantFile(db, "subf", "sub", "parent/sub", "folder1", 3)
      insertDescendantFile(db, "d", "d", "parent/sub/d.md", "subf", 0)
      insertDescendantFile(db, "e", "e", "parent/sub/e.md", "subf", 1)

      const emitter = createEmitter({ kmDir, db, skipPersist: false })
      const handlers = new ChangeHandlers(db, repoDir, emitter, createRealFsTarget())

      handlers.applyChangeToFs({
        id: "evt-folder",
        ts: Date.now(),
        type: "node_updated",
        target: "folder1",
        actor: "user",
        data: { content: "renamed" },
      })

      const journal = readJournal(kmDir)

      // Parent rename op
      const parentRow = journal.find((e) => {
        const data = e.data as Record<string, unknown> | undefined
        return e.type === "node_updated" && e.target === "folder1" && data?.fs_path === "renamed"
      })
      expect(parentRow).toBeDefined()

      // One op per descendant (5 rows: a, b, c, subf, d, e actually = 6)
      const descendantIds = ["a", "b", "c", "subf", "d", "e"]
      for (const id of descendantIds) {
        const row = journal.find((e) => {
          const data = e.data as Record<string, unknown> | undefined
          return (
            e.type === "node_updated" &&
            e.target === id &&
            typeof data?.fs_path === "string" &&
            (data.fs_path as string).startsWith("renamed")
          )
        })
        expect(row, `journal missing cascade op for ${id}`).toBeDefined()
      }

      // DB fs_paths reflect the cascade — every row under the old prefix is moved.
      const rows = db
        .query("SELECT id, fs_path FROM nodes WHERE fs_path LIKE 'renamed%' OR fs_path = 'renamed' ORDER BY id")
        .all() as Array<{ id: string; fs_path: string }>
      const byId = new Map(rows.map((r) => [r.id, r.fs_path]))
      expect(byId.get("folder1")).toBe("renamed")
      expect(byId.get("a")).toBe("renamed/a.md")
      expect(byId.get("b")).toBe("renamed/b.md")
      expect(byId.get("c")).toBe("renamed/c.md")
      expect(byId.get("subf")).toBe("renamed/sub")
      expect(byId.get("d")).toBe("renamed/sub/d.md")
      expect(byId.get("e")).toBe("renamed/sub/e.md")

      // No rows linger under the old prefix
      const leftovers = db.query("SELECT id FROM nodes WHERE fs_path LIKE 'parent%'").all() as { id: string }[]
      expect(leftovers).toEqual([])
    }))
})

describe("rename-atomicity — mid-cascade crash simulation", () => {
  test("failed cascade write leaves DB and journal consistent per row", () =>
    withTestEnv(({ repoDir, db, kmDir }) => {
      const folderPath = join(repoDir, "parent")
      mkdirSync(folderPath, { recursive: true })
      for (const name of ["a", "b", "c"]) {
        writeFileSync(join(folderPath, `${name}.md`), `# ${name}`)
      }

      insertFolderNode(db, "folder1", "parent", "parent")
      insertDescendantFile(db, "a", "a", "parent/a.md", "folder1", 0)
      insertDescendantFile(db, "b", "b", "parent/b.md", "folder1", 1)
      insertDescendantFile(db, "c", "c", "parent/c.md", "folder1", 2)

      const emitter = createEmitter({ kmDir, db, skipPersist: false })

      // Patch the DB so the 3rd db.run for an UPDATE on a descendant throws.
      // This simulates a crash after the parent + first descendant have been
      // committed — commitInternal applies DB first then journal, so a throw
      // from db.run aborts before the journal append, keeping the pair
      // consistent (neither DB nor journal get the failed row).
      const realRun = db.run.bind(db)
      let descendantUpdates = 0
      ;(db as unknown as { run: Database["run"] }).run = ((sql: string, params?: unknown) => {
        if (
          typeof sql === "string" &&
          sql.startsWith("UPDATE nodes SET") &&
          sql.includes("fs_path") &&
          !sql.includes("content_hash")
        ) {
          descendantUpdates += 1
          if (descendantUpdates === 3) {
            throw new Error("simulated mid-cascade crash")
          }
        }
        return realRun(sql, params as never)
      }) as Database["run"]

      const handlers = new ChangeHandlers(db, repoDir, emitter, createRealFsTarget())

      expect(() =>
        handlers.applyChangeToFs({
          id: "evt-crash",
          ts: Date.now(),
          type: "node_updated",
          target: "folder1",
          actor: "user",
          data: { content: "renamed" },
        }),
      ).toThrow(/simulated mid-cascade crash/)

      // Restore db.run before inspecting state.
      ;(db as unknown as { run: Database["run"] }).run = realRun

      const journal = readJournal(kmDir)

      // Walk every node_updated in the journal; each target's DB fs_path must
      // match what the journal says. (Per-row atomicity: no row appears in
      // the journal without a matching DB write, and vice versa.)
      for (const entry of journal) {
        if (entry.type !== "node_updated") continue
        const target = entry.target as string
        const data = entry.data as Record<string, unknown>
        if (typeof data?.fs_path !== "string") continue
        const row = db.query("SELECT fs_path FROM nodes WHERE id = ?").get(target) as { fs_path: string } | null
        expect(row?.fs_path, `journal ahead of DB for ${target}`).toBe(data.fs_path)
      }
    }))
})

describe("rename-atomicity — echo-loop prevention", () => {
  test("commit() is used for rename ops so onApply subscribers do not re-fire", () =>
    withTestEnv(({ repoDir, db, kmDir }) => {
      writeFileSync(join(repoDir, "Orig.md"), "# Orig\n")
      insertFileNode(db, "file1", "Orig", "Orig.md")

      const emitter = createEmitter({ kmDir, db, skipPersist: false })

      // Subscribe an onApply spy. It should see the initial node_updated
      // (the one that enters handleNodeUpdated via applyChangeToFs), but
      // NOT see a second node_updated for the rename — that goes through
      // emitter.commit() which deliberately skips onApply.
      const seen: Array<{ target: string; fs_path?: unknown }> = []
      emitter.onApply((change) => {
        if (change.type !== "node_updated") return
        const data = change.data as Record<string, unknown> | undefined
        seen.push({ target: change.target ?? "", fs_path: data?.fs_path })
      })

      const handlers = new ChangeHandlers(db, repoDir, emitter, createRealFsTarget())

      // Drive the rename directly through emitter.apply (which fires onApply
      // → handlers.applyChangeToFs in production). Simulate that plumbing
      // manually here so we can observe.
      const initial = emitter.apply({
        type: "node_updated",
        target: "file1",
        actor: "user",
        data: { content: "NewName" },
      })
      handlers.applyChangeToFs(initial)

      // The initial change is visible (driven by emitter.apply above).
      // The rename-generated change MUST NOT appear — commit() bypasses onApply.
      const renameFanouts = seen.filter((s) => s.fs_path === "NewName.md")
      expect(renameFanouts.length).toBe(0)

      // DB + journal still in sync for the rename.
      const journal = readJournal(kmDir)
      const renameEntry = journal.find((e) => {
        const data = e.data as Record<string, unknown> | undefined
        return e.type === "node_updated" && e.target === "file1" && data?.fs_path === "NewName.md"
      })
      expect(renameEntry).toBeDefined()
      const row = db.query("SELECT fs_path FROM nodes WHERE id = ?").get("file1") as { fs_path: string }
      expect(row.fs_path).toBe("NewName.md")
    }))
})

describe("computeRenameCascade (helper)", () => {
  test("returns one entry per descendant with rewritten prefix", () =>
    withTestEnv(({ db }) => {
      insertFolderNode(db, "folder1", "parent", "parent")
      insertDescendantFile(db, "a", "a", "parent/a.md", "folder1", 0)
      insertDescendantFile(db, "b", "b", "parent/b.md", "folder1", 1)
      insertDescendantFile(db, "c", "c", "parent/sub/c.md", "folder1", 2)
      // Sibling at top level whose name happens to share a prefix must NOT match.
      insertDescendantFile(db, "sibling", "parentish", "parentish.md", ".", 99)

      const cascade = computeRenameCascade(db, "parent", "renamed")
      const byId = new Map(cascade.map((c) => [c.id, c.newFsPath]))

      expect(byId.get("a")).toBe("renamed/a.md")
      expect(byId.get("b")).toBe("renamed/b.md")
      expect(byId.get("c")).toBe("renamed/sub/c.md")
      expect(byId.has("sibling")).toBe(false)
      expect(byId.has("folder1")).toBe(false) // root excluded
    }))
})
