/**
 * Rename Write Token + Journal Tests
 *
 * Verifies that rename handlers:
 * 1. Record write tokens at new paths (watcher suppression)
 * 2. Journal rename operations to changes.jsonl
 */

import { describe, test, expect } from "vitest"
import { mkdirSync, writeFileSync, readFileSync, existsSync, renameSync } from "fs"
import { join } from "path"

import { withTestEnv } from "@km/storage"
import { ChangeHandlers, type FsWriteTarget } from "../../src/watch/change-handlers.ts"
import { createEmitter } from "../../src/emitter.ts"

/** Minimal FsWriteTarget that tracks recorded tokens and rename calls */
function createMockFsTarget() {
  const recordedTokens = new Map<string, string>()
  const renames: Array<{ oldPath: string; newPath: string }> = []
  const inFlight = new Set<string>()

  const target: FsWriteTarget = {
    writeFile: () => {},
    deleteFile: () => {},
    renameFile: (oldPath: string, newPath: string) => {
      renameSync(oldPath, newPath)
      renames.push({ oldPath, newPath })
    },
    mkdir: (absPath: string) => {
      mkdirSync(absPath, { recursive: true })
    },
    markInFlight: (absPath: string) => {
      inFlight.add(absPath)
    },
    clearInFlight: (absPath: string) => {
      inFlight.delete(absPath)
    },
    recordWriteToken: (absPath: string, content: string) => {
      recordedTokens.set(absPath, content)
    },
  }

  return { target, recordedTokens, renames, inFlight }
}

/** Insert a file node into the DB for testing */
function insertFileNode(db: import("bun:sqlite").Database, id: string, name: string, fsPath: string): void {
  db.run(
    `INSERT INTO nodes (id, type, parent_id, parent_idx, item, content, name, fs_path, fstype, created_at, updated_at)
     VALUES (?, 'h', '.', 0, 1, ?, ?, ?, 'mdfile', 0, 0)`,
    [id, name, name, fsPath],
  )
}

/** Insert a folder node into the DB for testing */
function insertFolderNode(db: import("bun:sqlite").Database, id: string, name: string, fsPath: string): void {
  db.run(
    `INSERT INTO nodes (id, type, parent_id, parent_idx, item, content, name, fs_path, fstype, created_at, updated_at)
     VALUES (?, 'h', '.', 0, 1, ?, ?, ?, 'folder', 0, 0)`,
    [id, name, name, fsPath],
  )
}

describe("rename write tokens", () => {
  test("file rename records write token at new path", () =>
    withTestEnv(({ repoDir, db, emitter }) => {
      // Create a markdown file on disk
      const oldPath = join(repoDir, "Old Name.md")
      writeFileSync(oldPath, "# Old Name\n\nSome content.\n")

      insertFileNode(db, "file1", "Old Name", "Old Name.md")

      const { target, recordedTokens } = createMockFsTarget()
      const handlers = new ChangeHandlers(db, repoDir, emitter, target)

      // Simulate a node_updated event that triggers file rename
      handlers.applyChangeToFs({
        id: "evt1",
        ts: Date.now(),
        type: "node_updated",
        target: "file1",
        actor: "user",
        data: { content: "New Name" },
      })

      // The file should have been renamed on disk
      const newPath = join(repoDir, "New Name.md")
      expect(existsSync(newPath)).toBe(true)
      expect(existsSync(oldPath)).toBe(false)

      // A write token should have been recorded at the new path
      expect(recordedTokens.has(newPath)).toBe(true)
      expect(recordedTokens.get(newPath)).toBe("# Old Name\n\nSome content.\n")
    }))

  test("folder rename records write tokens for all descendant .md files", () =>
    withTestEnv(({ repoDir, db, emitter }) => {
      // Create folder structure with .md files
      const folderPath = join(repoDir, "my-folder")
      mkdirSync(folderPath, { recursive: true })
      mkdirSync(join(folderPath, "subfolder"), { recursive: true })

      writeFileSync(join(folderPath, "file-a.md"), "# File A\n")
      writeFileSync(join(folderPath, "file-b.md"), "# File B\n")
      writeFileSync(join(folderPath, "subfolder", "deep.md"), "# Deep\n")
      writeFileSync(join(folderPath, "readme.txt"), "not a markdown file")

      insertFolderNode(db, "folder1", "my-folder", "my-folder")

      const { target, recordedTokens } = createMockFsTarget()
      const handlers = new ChangeHandlers(db, repoDir, emitter, target)

      // Simulate folder rename via node_updated
      handlers.applyChangeToFs({
        id: "evt2",
        ts: Date.now(),
        type: "node_updated",
        target: "folder1",
        actor: "user",
        data: { content: "renamed-folder" },
      })

      const newFolder = join(repoDir, "renamed-folder")
      expect(existsSync(newFolder)).toBe(true)

      // All .md files should have write tokens at their new paths
      expect(recordedTokens.has(join(newFolder, "file-a.md"))).toBe(true)
      expect(recordedTokens.has(join(newFolder, "file-b.md"))).toBe(true)
      expect(recordedTokens.has(join(newFolder, "subfolder", "deep.md"))).toBe(true)

      // Non-.md files should NOT have tokens
      expect(recordedTokens.has(join(newFolder, "readme.txt"))).toBe(false)
    }))

  test("file rename with non-existent source is a no-op", () =>
    withTestEnv(({ repoDir, db, emitter }) => {
      // Insert node but no actual file on disk (item=1 so isOutline passes)
      insertFileNode(db, "file2", "Ghost", "Ghost.md")

      const { target, recordedTokens, renames } = createMockFsTarget()
      const handlers = new ChangeHandlers(db, repoDir, emitter, target)

      // Should not throw — no-op when source doesn't exist
      handlers.applyChangeToFs({
        id: "evt3",
        ts: Date.now(),
        type: "node_updated",
        target: "file2",
        actor: "user",
        data: { content: "New Ghost" },
      })

      expect(renames).toHaveLength(0)
      expect(recordedTokens.size).toBe(0)
    }))
})

describe("rename journal entries", () => {
  test("file rename creates journal entry in changes.jsonl", () =>
    withTestEnv(({ repoDir, db, kmDir }) => {
      // Create file on disk
      const oldPath = join(repoDir, "Journal Test.md")
      writeFileSync(oldPath, "# Journal Test\n")

      // Create emitter with journal persistence
      const emitter = createEmitter({ kmDir, db, skipPersist: false })

      insertFileNode(db, "jfile1", "Journal Test", "Journal Test.md")

      const { target } = createMockFsTarget()
      const handlers = new ChangeHandlers(db, repoDir, emitter, target)

      handlers.applyChangeToFs({
        id: "evt4",
        ts: Date.now(),
        type: "node_updated",
        target: "jfile1",
        actor: "user",
        data: { content: "Renamed Journal" },
      })

      // Read the events journal
      const changesPath = join(kmDir, "changes.jsonl")
      expect(existsSync(changesPath)).toBe(true)

      const lines = readFileSync(changesPath, "utf-8").trim().split("\n")
      const events = lines.map((line) => JSON.parse(line) as Record<string, unknown>)

      // Find the rename journal entry (has old_fs_path indicating it's from journalRename)
      const renameEvent = events.find(
        (e) =>
          e.type === "node_updated" &&
          e.target === "jfile1" &&
          (e.data as Record<string, unknown>)?.old_fs_path === "Journal Test.md",
      )

      expect(renameEvent).toBeDefined()
      const re = renameEvent as Record<string, unknown>
      const reData = re.data as Record<string, unknown>
      expect(reData.fs_path).toBe("Renamed Journal.md")
      expect(reData.name).toBe("Renamed Journal")
      expect(reData.title).toBe("Renamed Journal")
      expect(re.actor).toBe("user")
    }))

  test("folder rename creates journal entry", () =>
    withTestEnv(({ repoDir, db, kmDir }) => {
      // Create folder on disk
      const folderPath = join(repoDir, "journal-folder")
      mkdirSync(folderPath, { recursive: true })

      const emitter = createEmitter({ kmDir, db, skipPersist: false })

      insertFolderNode(db, "jfolder1", "journal-folder", "journal-folder")

      const { target } = createMockFsTarget()
      const handlers = new ChangeHandlers(db, repoDir, emitter, target)

      handlers.applyChangeToFs({
        id: "evt5",
        ts: Date.now(),
        type: "node_updated",
        target: "jfolder1",
        actor: "user",
        data: { content: "renamed-journal-folder" },
      })

      const changesPath = join(kmDir, "changes.jsonl")
      expect(existsSync(changesPath)).toBe(true)

      const lines = readFileSync(changesPath, "utf-8").trim().split("\n")
      const events = lines.map((line) => JSON.parse(line) as Record<string, unknown>)

      const renameEvent = events.find(
        (e) =>
          e.type === "node_updated" &&
          e.target === "jfolder1" &&
          (e.data as Record<string, unknown>)?.old_fs_path === "journal-folder",
      )

      expect(renameEvent).toBeDefined()
      const re = renameEvent as Record<string, unknown>
      const reData = re.data as Record<string, unknown>
      expect(reData.fs_path).toBe("renamed-journal-folder")
      expect(reData.name).toBe("renamed-journal-folder")
    }))
})
