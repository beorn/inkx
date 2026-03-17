/**
 * E2E Round-Trip Tests for Index Files
 *
 * Verifies bidirectional sync between folder nodes and index files:
 *   DB → file: folder metadata update creates/updates index file (via FsWriter)
 *   file → DB: external index file edit syncs child ordering back to folder (via SyncManager)
 */

import { describe, test, expect } from "vitest"
import { writeFileSync, readFileSync, mkdirSync, existsSync } from "fs"
import { join } from "path"
import { SyncManager } from "../../src/watch/sync.ts"
import { FsWriter } from "../../src/watch/fs-writer.ts"
import { getAllNodes, getChildren, withTestEnv, clearConfigCache } from "@km/storage"
import { emitNodeUpdated } from "../../src/emitter.ts"

/** Create a SyncManager with test defaults */
function createSyncManager(db: import("bun:sqlite").Database, repoDir: string) {
  return new SyncManager({
    repoPath: repoDir,
    debounceFs: 0,
    debounceApply: 0,
    conflictStrategy: "fs_wins",
    useWorker: false,
    db,
  })
}

/** Write a .km/config.yaml with folderIndex settings */
function writeConfig(repoDir: string, materialization: "none" | "metadata" | "full", naming = "index") {
  const kmDir = join(repoDir, ".km")
  mkdirSync(kmDir, { recursive: true })
  writeFileSync(
    join(kmDir, "config.yaml"),
    `folderIndex:\n  materialization: ${materialization}\n  naming: ${naming}\n`,
  )
  clearConfigCache()
}

describe("index file roundtrip", () => {
  describe("read path: index file → DB", () => {
    test("index file sections become child slots in DB", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const manager = createSyncManager(db, repoDir)

        // Create folder structure with index file
        const folderPath = join(repoDir, "my-project")
        mkdirSync(folderPath, { recursive: true })
        writeFileSync(join(folderPath, "index.md"), "# My Project\n\nProject description.\n\n![[./docs]]\n![[./src]]\n")
        mkdirSync(join(folderPath, "docs"))
        mkdirSync(join(folderPath, "src"))
        writeFileSync(join(folderPath, "docs", "readme.md"), "# Readme\n")
        writeFileSync(join(folderPath, "src", "main.md"), "# Main\n")

        await manager.syncFromFs()

        const nodes = getAllNodes(db)
        const folderNode = nodes.find((n) => n.fstype === "folder" && n.name === "my-project")
        expect(folderNode).toBeDefined()

        // Index file should exist as a child of the folder
        const indexFile = nodes.find(
          (n) => n.fstype === "mdfile" && n.name === "index" && n.parent_id === folderNode!.id,
        )
        expect(indexFile).toBeDefined()

        // Verify the index file's sections were parsed
        const indexChildren = getChildren(db, indexFile!.id)
        expect(indexChildren.length).toBeGreaterThan(0)
      }))

    test("external edit to index file syncs child ordering to folder", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const manager = createSyncManager(db, repoDir)

        // Create folder with children + index file
        const folderPath = join(repoDir, "project")
        mkdirSync(folderPath, { recursive: true })
        mkdirSync(join(folderPath, "alpha"))
        mkdirSync(join(folderPath, "beta"))
        mkdirSync(join(folderPath, "gamma"))
        writeFileSync(join(folderPath, "index.md"), "# Project\n\n![[./alpha]]\n![[./beta]]\n![[./gamma]]\n")

        await manager.syncFromFs()

        const folderNode = getAllNodes(db).find((n) => n.fstype === "folder" && n.name === "project")
        expect(folderNode).toBeDefined()

        // Now edit index file to reorder: gamma, alpha, beta
        writeFileSync(join(folderPath, "index.md"), "# Project\n\n![[./gamma]]\n![[./alpha]]\n![[./beta]]\n")

        await manager.syncFromFs()

        // Check that folder children ordering reflects the new slot order
        const children = getChildren(db, folderNode!.id)
        const nonIndex = children.filter((c) => c.name !== "index")

        const gamma = nonIndex.find((c) => c.name === "gamma")
        const alpha = nonIndex.find((c) => c.name === "alpha")
        const beta = nonIndex.find((c) => c.name === "beta")

        expect(gamma).toBeDefined()
        expect(alpha).toBeDefined()
        expect(beta).toBeDefined()
        expect(gamma!.parent_idx).toBeLessThan(alpha!.parent_idx)
        expect(alpha!.parent_idx).toBeLessThan(beta!.parent_idx)
      }))

    test("index file title syncs to folder content", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const manager = createSyncManager(db, repoDir)

        const folderPath = join(repoDir, "docs")
        mkdirSync(folderPath, { recursive: true })
        writeFileSync(join(folderPath, "index.md"), "# Documentation Hub\n\nSome body text.\n")

        await manager.syncFromFs()

        // Edit the title in the index file
        writeFileSync(join(folderPath, "index.md"), "# Updated Title\n\nSome body text.\n")

        await manager.syncFromFs()

        const folderNode = getAllNodes(db).find((n) => n.fstype === "folder" && n.name === "docs")
        expect(folderNode).toBeDefined()
        expect(folderNode!.content).toBe("Updated Title")
      }))
  })

  describe("write path: DB → index file (FsWriter)", () => {
    test("materialization=none does not create index file", () =>
      withTestEnv(async ({ repoDir, db, emitter }) => {
        writeConfig(repoDir, "none")
        const manager = createSyncManager(db, repoDir)
        const fsWriter = new FsWriter(db, repoDir, emitter)
        emitter.setFsSync(fsWriter)

        // Create folder
        const folderPath = join(repoDir, "my-folder")
        mkdirSync(folderPath, { recursive: true })
        writeFileSync(join(folderPath, "child.md"), "# Child\n")

        await manager.syncFromFs()

        const folderNode = getAllNodes(db).find((n) => n.fstype === "folder" && n.name === "my-folder")
        expect(folderNode).toBeDefined()

        // Trigger a folder update — with materialization=none, nothing should happen
        emitNodeUpdated(emitter, "test", folderNode!.id, { data: { description: "test" } })

        expect(existsSync(join(folderPath, "index.md"))).toBe(false)
      }))

    test("materialization=metadata creates index file with title only", () =>
      withTestEnv(async ({ repoDir, db, emitter }) => {
        writeConfig(repoDir, "metadata")
        const manager = createSyncManager(db, repoDir)
        const fsWriter = new FsWriter(db, repoDir, emitter)
        emitter.setFsSync(fsWriter)

        // Create folder with children
        const folderPath = join(repoDir, "my-folder")
        mkdirSync(folderPath, { recursive: true })
        writeFileSync(join(folderPath, "notes.md"), "# Notes\n")

        await manager.syncFromFs()

        const folderNode = getAllNodes(db).find((n) => n.fstype === "folder" && n.name === "my-folder")
        expect(folderNode).toBeDefined()

        // Trigger a folder node update — FsWriter writes synchronously
        emitNodeUpdated(emitter, "test", folderNode!.id, { data: { description: "test" } })

        expect(existsSync(join(folderPath, "index.md"))).toBe(true)
        const content = readFileSync(join(folderPath, "index.md"), "utf-8")
        expect(content).toContain("# my-folder")
        // Metadata mode should NOT have child slots
        expect(content).not.toContain("![[")
      }))

    test("materialization=full creates index file with child slots", () =>
      withTestEnv(async ({ repoDir, db, emitter }) => {
        writeConfig(repoDir, "full")
        const manager = createSyncManager(db, repoDir)
        const fsWriter = new FsWriter(db, repoDir, emitter)
        emitter.setFsSync(fsWriter)

        // Create folder with children
        const folderPath = join(repoDir, "project")
        mkdirSync(folderPath, { recursive: true })
        mkdirSync(join(folderPath, "docs"))
        mkdirSync(join(folderPath, "src"))
        writeFileSync(join(folderPath, "readme.md"), "# Readme\n")

        await manager.syncFromFs()

        const folderNode = getAllNodes(db).find((n) => n.fstype === "folder" && n.name === "project")
        expect(folderNode).toBeDefined()

        // Trigger folder node update
        emitNodeUpdated(emitter, "test", folderNode!.id, { data: { description: "test" } })

        expect(existsSync(join(folderPath, "index.md"))).toBe(true)
        const content = readFileSync(join(folderPath, "index.md"), "utf-8")
        expect(content).toContain("# project")
        expect(content).toContain("![[./")
      }))
  })

  describe("naming conventions", () => {
    test("naming=same-name creates folderName.md", () =>
      withTestEnv(async ({ repoDir, db, emitter }) => {
        writeConfig(repoDir, "metadata", "same-name")
        const manager = createSyncManager(db, repoDir)
        const fsWriter = new FsWriter(db, repoDir, emitter)
        emitter.setFsSync(fsWriter)

        const folderPath = join(repoDir, "my-project")
        mkdirSync(folderPath, { recursive: true })
        writeFileSync(join(folderPath, "child.md"), "# Child\n")

        await manager.syncFromFs()

        const folderNode = getAllNodes(db).find((n) => n.fstype === "folder" && n.name === "my-project")
        expect(folderNode).toBeDefined()

        emitNodeUpdated(emitter, "test", folderNode!.id, { data: { description: "test" } })

        expect(existsSync(join(folderPath, "my-project.md"))).toBe(true)
        const content = readFileSync(join(folderPath, "my-project.md"), "utf-8")
        expect(content).toContain("# my-project")
      }))

    test("existing index file preserves its name on update", () =>
      withTestEnv(async ({ repoDir, db, emitter }) => {
        writeConfig(repoDir, "metadata")
        const manager = createSyncManager(db, repoDir)
        const fsWriter = new FsWriter(db, repoDir, emitter)
        emitter.setFsSync(fsWriter)

        // Create folder with existing same-name index file
        const folderPath = join(repoDir, "docs")
        mkdirSync(folderPath, { recursive: true })
        writeFileSync(join(folderPath, "docs.md"), "# Docs\n\nOriginal content.\n")

        await manager.syncFromFs()

        const folderNode = getAllNodes(db).find((n) => n.fstype === "folder" && n.name === "docs")
        expect(folderNode).toBeDefined()

        // Trigger update — should write to docs.md (existing), not index.md
        emitNodeUpdated(emitter, "test", folderNode!.id, { data: { description: "test" } })

        // The existing same-name file should be used, not a new index.md
        expect(existsSync(join(folderPath, "docs.md"))).toBe(true)
        // A new index.md should NOT be created
        expect(existsSync(join(folderPath, "index.md"))).toBe(false)
      }))
  })
})
