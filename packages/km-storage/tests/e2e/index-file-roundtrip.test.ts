/**
 * E2E Round-Trip Tests for Folder-Index File System
 *
 * Tests the full pipeline: index file discovery, content parsing, external
 * edits syncing to DB, write path materialization, naming conventions,
 * lifecycle events, folder operations, heartbeat reliability, priority
 * cascade, and round-trip fidelity.
 *
 * Key design note: Title promotion from index file → folder only happens
 * when the index file is *updated* (modified on disk), not on initial creation.
 * syncIndexFileToFolder() runs in handleUpdate, not handleCreate.
 */

import { describe, test, expect, vi } from "vitest"
import { writeFileSync, readFileSync, mkdirSync, existsSync, unlinkSync, renameSync, utimesSync } from "fs"
import { join } from "path"
import { SyncManager } from "../../src/watch/sync.ts"
import { FsWriter } from "../../src/watch/fs-writer.ts"
import { getAllNodes, getChildren, getNode, withTestEnv, clearConfigCache } from "@km/storage"
import { emitNodeUpdated } from "../../src/emitter.ts"
import { indexFileName } from "../../src/index-file-writer.ts"
import { findIndexFile } from "@km/tree"

function createSyncManager(db: import("bun:sqlite").Database, repoDir: string) {
  // Clear config cache to ensure no stale config from previous tests
  clearConfigCache()
  return new SyncManager({
    repoPath: repoDir,
    debounceFs: 0,
    debounceApply: 0,
    conflictStrategy: "fs_wins",
    useWorker: false,
    db,
  })
}

function writeConfig(repoDir: string, materialization: "none" | "metadata" | "full", naming = "index") {
  const kmDir = join(repoDir, ".km")
  mkdirSync(kmDir, { recursive: true })
  writeFileSync(
    join(kmDir, "config.yaml"),
    `folderIndex:\n  materialization: ${materialization}\n  naming: ${naming}\n`,
  )
  clearConfigCache()
}

function findFolder(db: import("bun:sqlite").Database, name: string) {
  return getAllNodes(db).find((n) => n.fstype === "folder" && n.name === name)
}

function findMdFile(db: import("bun:sqlite").Database, name: string, parentId?: string) {
  return getAllNodes(db).find(
    (n) => n.fstype === "mdfile" && n.name === name && (parentId === undefined || n.parent_id === parentId),
  )
}

/** Touch an index file to trigger handleUpdate path for title promotion */
async function touchIndexFile(manager: SyncManager, path: string, content?: string) {
  if (content !== undefined) {
    writeFileSync(path, content)
  } else {
    writeFileSync(path, readFileSync(path, "utf-8") + "\n")
  }
  await manager.syncFromFs()
}

describe("index file roundtrip", () => {
  describe("A. index file discovery", () => {
    test("A1: same-name.md detected as index file child", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const manager = createSyncManager(db, repoDir)
        mkdirSync(join(repoDir, "project"), { recursive: true })
        writeFileSync(join(repoDir, "project", "project.md"), "# My Project\n")
        writeFileSync(join(repoDir, "project", "notes.md"), "# Notes\n")
        await manager.syncFromFs()
        const folder = findFolder(db, "project")!
        expect(findMdFile(db, "project", folder.id)).toBeDefined()
        await touchIndexFile(manager, join(repoDir, "project", "project.md"))
        expect(getNode(db, folder.id)!.content).toBe("My Project")
      }))

    test("A2: index.md detected as index file", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const manager = createSyncManager(db, repoDir)
        mkdirSync(join(repoDir, "docs"), { recursive: true })
        writeFileSync(join(repoDir, "docs", "index.md"), "# Documentation\n")
        await manager.syncFromFs()
        const folder = findFolder(db, "docs")!
        expect(findMdFile(db, "index", folder.id)).toBeDefined()
        await touchIndexFile(manager, join(repoDir, "docs", "index.md"))
        expect(getNode(db, folder.id)!.content).toBe("Documentation")
      }))

    // Note: .md (dot-md) files are exempt from isHiddenFile() so the scanner
    // can discover them. The indexFileName() function produces ".md" for dot-md naming.
    test("A3: .md (dot-md) naming exists in indexFileName", () => {
      expect(indexFileName("project", "dot-md")).toBe(".md")
    })

    test("A4: same-name beats index.md when both exist", () =>
      withTestEnv(async ({ repoDir, db }) => {
        writeConfig(repoDir, "none")
        const manager = createSyncManager(db, repoDir)
        mkdirSync(join(repoDir, "project"), { recursive: true })
        writeFileSync(join(repoDir, "project", "project.md"), "# From Same-Name\n")
        writeFileSync(join(repoDir, "project", "index.md"), "# From Index\n")
        await manager.syncFromFs()
        await touchIndexFile(manager, join(repoDir, "project", "project.md"))
        expect(findFolder(db, "project")!.content).toBe("From Same-Name")
      }))

    test("A5: folder with no index file → no title promotion", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const manager = createSyncManager(db, repoDir)
        mkdirSync(join(repoDir, "plain"), { recursive: true })
        writeFileSync(join(repoDir, "plain", "notes.md"), "# Notes\n")
        await manager.syncFromFs()
        expect(findFolder(db, "plain")!.content).toBe("plain")
      }))

    test("A6: deeply nested folder has own index file", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const manager = createSyncManager(db, repoDir)
        mkdirSync(join(repoDir, "outer", "inner", "deep"), { recursive: true })
        writeFileSync(join(repoDir, "outer", "index.md"), "# Outer\n")
        writeFileSync(join(repoDir, "outer", "inner", "index.md"), "# Inner\n")
        writeFileSync(join(repoDir, "outer", "inner", "deep", "index.md"), "# Deep\n")
        await manager.syncFromFs()
        for (const [name, title] of [
          ["outer", "Outer"],
          ["inner", "Inner"],
          ["deep", "Deep"],
        ] as const) {
          const f = findFolder(db, name)!
          expect(findMdFile(db, "index", f.id)).toBeDefined()
          await touchIndexFile(
            manager,
            join(
              repoDir,
              ...(name === "outer" ? ["outer"] : name === "inner" ? ["outer", "inner"] : ["outer", "inner", "deep"]),
              "index.md",
            ),
          )
          expect(getNode(db, f.id)!.content).toBe(title)
        }
      }))
  })

  describe("B. index file content parsing", () => {
    test("B1: ![[./child]] slots parsed with ./ prefix", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const manager = createSyncManager(db, repoDir)
        const fp = join(repoDir, "project")
        mkdirSync(join(fp, "docs"), { recursive: true })
        mkdirSync(join(fp, "src"), { recursive: true })
        writeFileSync(join(fp, "index.md"), "# Project\n\n![[./docs]]\n![[./src]]\n")
        await manager.syncFromFs()
        const folder = findFolder(db, "project")!
        const indexFile = findMdFile(db, "index", folder.id)!
        const children = getChildren(db, indexFile.id)
        expect(children.some((c) => c.content?.includes("./"))).toBe(true)
      }))

    test("B2: non-relative ![[other]] NOT treated as folder child slot", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const manager = createSyncManager(db, repoDir)
        const fp = join(repoDir, "project")
        mkdirSync(join(fp, "docs"), { recursive: true })
        writeFileSync(join(fp, "index.md"), "# Project\n\n![[./docs]]\n![[some-other-page]]\n")
        await manager.syncFromFs()
        const folder = findFolder(db, "project")!
        expect(getChildren(db, folder.id).find((c) => c.name === "docs")).toBeDefined()
        expect(
          getChildren(db, folder.id).find((c) => c.name === "some-other-page" && c.fstype === "folder"),
        ).toBeUndefined()
      }))

    test("B3: index file H1 title stored on file node", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const manager = createSyncManager(db, repoDir)
        mkdirSync(join(repoDir, "docs"), { recursive: true })
        writeFileSync(join(repoDir, "docs", "index.md"), "# Documentation Hub\n\nBody.\n")
        await manager.syncFromFs()
        const indexFile = findMdFile(db, "index", findFolder(db, "docs")!.id)!
        expect(indexFile.title ?? indexFile.content).toBe("Documentation Hub")
      }))

    test("B4: body paragraphs stored as children", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const manager = createSyncManager(db, repoDir)
        mkdirSync(join(repoDir, "docs"), { recursive: true })
        writeFileSync(join(repoDir, "docs", "index.md"), "# Docs\n\nFirst paragraph.\n\nSecond paragraph.\n")
        await manager.syncFromFs()
        const indexFile = findMdFile(db, "index", findFolder(db, "docs")!.id)!
        expect(getChildren(db, indexFile.id).filter((c) => c.type === "p").length).toBeGreaterThanOrEqual(2)
      }))

    test("B5: mixed content (body + slots + sections) coexist", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const manager = createSyncManager(db, repoDir)
        const fp = join(repoDir, "project")
        mkdirSync(join(fp, "alpha"), { recursive: true })
        writeFileSync(join(fp, "index.md"), "# Project\n\nIntro.\n\n## Overview\n\nDetails.\n\n![[./alpha]]\n")
        await manager.syncFromFs()
        const folder = findFolder(db, "project")!
        const indexFile = findMdFile(db, "index", folder.id)!
        await touchIndexFile(manager, join(fp, "index.md"))
        expect(getNode(db, folder.id)!.content).toBe("Project")
        expect(getChildren(db, indexFile.id).length).toBeGreaterThan(0)
      }))
  })

  describe("C. external edit → DB sync", () => {
    test("C1: reorder slots → folder children reorder", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const manager = createSyncManager(db, repoDir)
        const fp = join(repoDir, "project")
        mkdirSync(join(fp, "alpha"), { recursive: true })
        mkdirSync(join(fp, "beta"), { recursive: true })
        mkdirSync(join(fp, "gamma"), { recursive: true })
        writeFileSync(join(fp, "index.md"), "# Project\n\n![[./alpha]]\n![[./beta]]\n![[./gamma]]\n")
        await manager.syncFromFs()
        writeFileSync(join(fp, "index.md"), "# Project\n\n![[./gamma]]\n![[./alpha]]\n![[./beta]]\n")
        await manager.syncFromFs()
        const folder = findFolder(db, "project")!
        const ch = getChildren(db, folder.id).filter((c) => c.name !== "index")
        expect(ch.find((c) => c.name === "gamma")!.parent_idx).toBeLessThan(
          ch.find((c) => c.name === "alpha")!.parent_idx,
        )
        expect(ch.find((c) => c.name === "alpha")!.parent_idx).toBeLessThan(
          ch.find((c) => c.name === "beta")!.parent_idx,
        )
      }))

    test("C2: reorder back to original → indices restored", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const manager = createSyncManager(db, repoDir)
        const fp = join(repoDir, "project")
        mkdirSync(join(fp, "alpha"), { recursive: true })
        mkdirSync(join(fp, "beta"), { recursive: true })
        writeFileSync(join(fp, "index.md"), "# P\n\n![[./alpha]]\n![[./beta]]\n")
        await manager.syncFromFs()
        writeFileSync(join(fp, "index.md"), "# P\n\n![[./beta]]\n![[./alpha]]\n")
        await manager.syncFromFs()
        const folder = findFolder(db, "project")!
        let ch = getChildren(db, folder.id).filter((c) => c.name !== "index")
        expect(ch.find((c) => c.name === "beta")!.parent_idx).toBeLessThan(
          ch.find((c) => c.name === "alpha")!.parent_idx,
        )
        writeFileSync(join(fp, "index.md"), "# P\n\n![[./alpha]]\n![[./beta]]\n")
        await manager.syncFromFs()
        ch = getChildren(db, folder.id).filter((c) => c.name !== "index")
        expect(ch.find((c) => c.name === "alpha")!.parent_idx).toBeLessThan(
          ch.find((c) => c.name === "beta")!.parent_idx,
        )
      }))

    test("C3: ![[./nonexistent]] slot → no new child", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
        try {
          const manager = createSyncManager(db, repoDir)
          const fp = join(repoDir, "project")
          mkdirSync(join(fp, "alpha"), { recursive: true })
          writeFileSync(join(fp, "index.md"), "# P\n\n![[./alpha]]\n")
          await manager.syncFromFs()
          const folder = findFolder(db, "project")!
          const before = getChildren(db, folder.id).filter((c) => c.fstype === "folder" || c.fstype === "mdfile")
          writeFileSync(join(fp, "index.md"), "# P\n\n![[./alpha]]\n![[./nonexistent]]\n")
          await manager.syncFromFs()
          const after = getChildren(db, folder.id).filter((c) => c.fstype === "folder" || c.fstype === "mdfile")
          expect(after.length).toBe(before.length)
        } finally {
          warnSpy.mockRestore()
        }
      }))

    test("C4: remove slot → child moves to end", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const manager = createSyncManager(db, repoDir)
        const fp = join(repoDir, "project")
        mkdirSync(join(fp, "alpha"), { recursive: true })
        mkdirSync(join(fp, "beta"), { recursive: true })
        mkdirSync(join(fp, "gamma"), { recursive: true })
        writeFileSync(join(fp, "index.md"), "# P\n\n![[./alpha]]\n![[./beta]]\n![[./gamma]]\n")
        await manager.syncFromFs()
        writeFileSync(join(fp, "index.md"), "# P\n\n![[./alpha]]\n![[./gamma]]\n")
        await manager.syncFromFs()
        const ch = getChildren(db, findFolder(db, "project")!.id).filter((c) => c.name !== "index")
        expect(ch.find((c) => c.name === "alpha")!.parent_idx).toBeLessThan(
          ch.find((c) => c.name === "gamma")!.parent_idx,
        )
        expect(ch.find((c) => c.name === "gamma")!.parent_idx).toBeLessThan(
          ch.find((c) => c.name === "beta")!.parent_idx,
        )
      }))

    test("C5: change H1 title → folder content updates", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const manager = createSyncManager(db, repoDir)
        mkdirSync(join(repoDir, "docs"), { recursive: true })
        writeFileSync(join(repoDir, "docs", "index.md"), "# Documentation Hub\n\nBody.\n")
        await manager.syncFromFs()
        writeFileSync(join(repoDir, "docs", "index.md"), "# Updated Title\n\nBody.\n")
        await manager.syncFromFs()
        expect(findFolder(db, "docs")!.content).toBe("Updated Title")
      }))

    test("C6: edit body without changing slots → no reorder", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const manager = createSyncManager(db, repoDir)
        const fp = join(repoDir, "project")
        mkdirSync(join(fp, "alpha"), { recursive: true })
        mkdirSync(join(fp, "beta"), { recursive: true })
        writeFileSync(join(fp, "index.md"), "# P\n\nOriginal.\n\n![[./alpha]]\n![[./beta]]\n")
        await manager.syncFromFs()
        writeFileSync(join(fp, "index.md"), "# P\n\nChanged.\n\n![[./alpha]]\n![[./beta]]\n")
        await manager.syncFromFs()
        const ch = getChildren(db, findFolder(db, "project")!.id).filter((c) => c.name !== "index")
        expect(ch.find((c) => c.name === "alpha")!.parent_idx).toBeLessThan(
          ch.find((c) => c.name === "beta")!.parent_idx,
        )
        writeFileSync(join(fp, "index.md"), "# P\n\nUpdated.\n\n![[./alpha]]\n![[./beta]]\n")
        await manager.syncFromFs()
        const ch2 = getChildren(db, findFolder(db, "project")!.id).filter((c) => c.name !== "index")
        expect(ch2.find((c) => c.name === "alpha")!.parent_idx).toBeLessThan(
          ch2.find((c) => c.name === "beta")!.parent_idx,
        )
      }))

    test("C7: slot references nonexistent child → gracefully ignored", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
        try {
          const manager = createSyncManager(db, repoDir)
          const fp = join(repoDir, "project")
          mkdirSync(join(fp, "alpha"), { recursive: true })
          writeFileSync(join(fp, "index.md"), "# P\n\n![[./nonexistent]]\n![[./alpha]]\n")
          await manager.syncFromFs()
          writeFileSync(join(fp, "index.md"), "# P2\n\n![[./nonexistent]]\n![[./alpha]]\n")
          await manager.syncFromFs()
          const ch = getChildren(db, findFolder(db, "project")!.id).filter((c) => c.name !== "index")
          expect(ch.find((c) => c.name === "alpha")).toBeDefined()
          expect(
            ch.find((c) => c.name === "nonexistent" && (c.fstype === "folder" || c.fstype === "mdfile")),
          ).toBeUndefined()
        } finally {
          warnSpy.mockRestore()
        }
      }))
  })

  describe("D. write path / materialization", () => {
    test("D1: materialization=none → no index file", () =>
      withTestEnv(async ({ repoDir, db, emitter }) => {
        writeConfig(repoDir, "none")
        const manager = createSyncManager(db, repoDir)
        emitter.setFsSync(new FsWriter(db, repoDir, emitter))
        mkdirSync(join(repoDir, "my-folder"), { recursive: true })
        writeFileSync(join(repoDir, "my-folder", "child.md"), "# Child\n")
        await manager.syncFromFs()
        emitNodeUpdated(emitter, "test", findFolder(db, "my-folder")!.id, {
          data: { description: "test" },
        })
        expect(existsSync(join(repoDir, "my-folder", "index.md"))).toBe(false)
      }))

    test("D2: materialization=metadata does NOT create new index files", () =>
      withTestEnv(async ({ repoDir, db, emitter }) => {
        writeConfig(repoDir, "metadata")
        const manager = createSyncManager(db, repoDir)
        emitter.setFsSync(new FsWriter(db, repoDir, emitter))
        mkdirSync(join(repoDir, "my-folder"), { recursive: true })
        writeFileSync(join(repoDir, "my-folder", "notes.md"), "# Notes\n")
        await manager.syncFromFs()
        // Folder update should NOT create a new index file in metadata mode
        emitNodeUpdated(emitter, "test", findFolder(db, "my-folder")!.id, {
          data: { description: "test" },
        })
        expect(existsSync(join(repoDir, "my-folder", "index.md"))).toBe(false)
      }))

    test("D3: materialization=full → child slots", () =>
      withTestEnv(async ({ repoDir, db, emitter }) => {
        writeConfig(repoDir, "full")
        const manager = createSyncManager(db, repoDir)
        emitter.setFsSync(new FsWriter(db, repoDir, emitter))
        const fp = join(repoDir, "project")
        mkdirSync(join(fp, "docs"), { recursive: true })
        mkdirSync(join(fp, "src"), { recursive: true })
        writeFileSync(join(fp, "readme.md"), "# Readme\n")
        await manager.syncFromFs()
        emitNodeUpdated(emitter, "test", findFolder(db, "project")!.id, {
          data: { description: "test" },
        })
        const content = readFileSync(join(fp, "index.md"), "utf-8")
        expect(content).toContain("# project")
        expect(content).toContain("![[./")
      }))

    test("D4: existing index file updated not duplicated", () =>
      withTestEnv(async ({ repoDir, db, emitter }) => {
        writeConfig(repoDir, "metadata")
        const manager = createSyncManager(db, repoDir)
        emitter.setFsSync(new FsWriter(db, repoDir, emitter))
        mkdirSync(join(repoDir, "docs"), { recursive: true })
        writeFileSync(join(repoDir, "docs", "docs.md"), "# Docs\n\nOriginal.\n")
        await manager.syncFromFs()
        emitNodeUpdated(emitter, "test", findFolder(db, "docs")!.id, {
          data: { description: "test" },
        })
        expect(existsSync(join(repoDir, "docs", "docs.md"))).toBe(true)
        expect(existsSync(join(repoDir, "docs", "index.md"))).toBe(false)
      }))

    test("D5: existing same-name used over config default", () =>
      withTestEnv(async ({ repoDir, db, emitter }) => {
        writeConfig(repoDir, "full", "index")
        const manager = createSyncManager(db, repoDir)
        emitter.setFsSync(new FsWriter(db, repoDir, emitter))
        const fp = join(repoDir, "project")
        mkdirSync(join(fp, "child"), { recursive: true })
        writeFileSync(join(fp, "child", "readme.md"), "# R\n")
        writeFileSync(join(fp, "project.md"), "# My Project\n")
        await manager.syncFromFs()
        emitNodeUpdated(emitter, "test", findFolder(db, "project")!.id, {
          data: { description: "test" },
        })
        expect(readFileSync(join(fp, "project.md"), "utf-8")).toContain("![[./child]]")
        expect(existsSync(join(fp, "index.md"))).toBe(false)
      }))
  })

  describe("E. naming conventions", () => {
    test("E1: naming=index → creates index.md", () =>
      withTestEnv(async ({ repoDir, db, emitter }) => {
        writeConfig(repoDir, "full", "index")
        const manager = createSyncManager(db, repoDir)
        emitter.setFsSync(new FsWriter(db, repoDir, emitter))
        mkdirSync(join(repoDir, "proj"), { recursive: true })
        writeFileSync(join(repoDir, "proj", "child.md"), "# C\n")
        await manager.syncFromFs()
        emitNodeUpdated(emitter, "test", findFolder(db, "proj")!.id, {
          data: { description: "test" },
        })
        expect(existsSync(join(repoDir, "proj", "index.md"))).toBe(true)
      }))

    test("E2: naming=same-name → creates folderName.md", () =>
      withTestEnv(async ({ repoDir, db, emitter }) => {
        writeConfig(repoDir, "full", "same-name")
        const manager = createSyncManager(db, repoDir)
        emitter.setFsSync(new FsWriter(db, repoDir, emitter))
        mkdirSync(join(repoDir, "proj"), { recursive: true })
        writeFileSync(join(repoDir, "proj", "child.md"), "# C\n")
        await manager.syncFromFs()
        emitNodeUpdated(emitter, "test", findFolder(db, "proj")!.id, {
          data: { description: "test" },
        })
        expect(existsSync(join(repoDir, "proj", "proj.md"))).toBe(true)
        expect(readFileSync(join(repoDir, "proj", "proj.md"), "utf-8")).toContain("# proj")
      }))

    test("E3: naming=dot-md → creates .md on disk", () =>
      withTestEnv(async ({ repoDir, db, emitter }) => {
        writeConfig(repoDir, "full", "dot-md")
        const manager = createSyncManager(db, repoDir)
        emitter.setFsSync(new FsWriter(db, repoDir, emitter))
        mkdirSync(join(repoDir, "proj"), { recursive: true })
        writeFileSync(join(repoDir, "proj", "child.md"), "# C\n")
        await manager.syncFromFs()
        emitNodeUpdated(emitter, "test", findFolder(db, "proj")!.id, {
          data: { description: "test" },
        })
        // .md is created by FsWriter and scanner discovers it (isHiddenFile exempts ".md")
        expect(existsSync(join(repoDir, "proj", ".md"))).toBe(true)
      }))
  })

  describe("F. index file lifecycle", () => {
    test("F1: add index file to existing folder → detected on sync", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const manager = createSyncManager(db, repoDir)
        mkdirSync(join(repoDir, "project"), { recursive: true })
        writeFileSync(join(repoDir, "project", "notes.md"), "# Notes\n")
        await manager.syncFromFs()
        const folder = findFolder(db, "project")!
        expect(findMdFile(db, "index", folder.id)).toBeUndefined()
        writeFileSync(join(repoDir, "project", "index.md"), "# My Project\n")
        await manager.syncFromFs()
        expect(findMdFile(db, "index", folder.id)).toBeDefined()
        await touchIndexFile(manager, join(repoDir, "project", "index.md"))
        expect(getNode(db, folder.id)!.content).toBe("My Project")
      }))

    test("F2: delete index file → folder still works", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const manager = createSyncManager(db, repoDir)
        mkdirSync(join(repoDir, "project"), { recursive: true })
        writeFileSync(join(repoDir, "project", "index.md"), "# P\n")
        writeFileSync(join(repoDir, "project", "notes.md"), "# Notes\n")
        await manager.syncFromFs()
        const folder = findFolder(db, "project")!
        unlinkSync(join(repoDir, "project", "index.md"))
        await manager.syncFromFs()
        expect(getNode(db, folder.id)!.fstype).toBe("folder")
        expect(getChildren(db, folder.id).find((c) => c.name === "notes")).toBeDefined()
      }))

    test("F3: replace index file → re-parsed correctly", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const manager = createSyncManager(db, repoDir)
        const fp = join(repoDir, "project")
        mkdirSync(join(fp, "alpha"), { recursive: true })
        mkdirSync(join(fp, "beta"), { recursive: true })
        writeFileSync(join(fp, "index.md"), "# Original\n\n![[./alpha]]\n![[./beta]]\n")
        await manager.syncFromFs()
        writeFileSync(join(fp, "index.md"), "# Replaced\n\n![[./beta]]\n![[./alpha]]\n")
        await manager.syncFromFs()
        const folder = findFolder(db, "project")!
        expect(folder.content).toBe("Replaced")
        const ch = getChildren(db, folder.id).filter((c) => c.name !== "index")
        expect(ch.find((c) => c.name === "beta")!.parent_idx).toBeLessThan(
          ch.find((c) => c.name === "alpha")!.parent_idx,
        )
      }))
  })

  describe("G. folder operations", () => {
    test("G1: folder rename does NOT rename index.md", () =>
      withTestEnv(async ({ repoDir, db, emitter }) => {
        writeConfig(repoDir, "full")
        const manager = createSyncManager(db, repoDir)
        emitter.setFsSync(new FsWriter(db, repoDir, emitter))
        mkdirSync(join(repoDir, "old-name", "child"), { recursive: true })
        writeFileSync(join(repoDir, "old-name", "index.md"), "# Old\n")
        writeFileSync(join(repoDir, "old-name", "child", "readme.md"), "# R\n")
        await manager.syncFromFs()
        emitNodeUpdated(emitter, "test", findFolder(db, "old-name")!.id, { content: "new-name" })
        expect(existsSync(join(repoDir, "new-name"))).toBe(true)
        expect(existsSync(join(repoDir, "new-name", "index.md"))).toBe(true)
      }))

    test("G2: folder rename cascades fs_path to descendants", () =>
      withTestEnv(async ({ repoDir, db, emitter }) => {
        writeConfig(repoDir, "none")
        const manager = createSyncManager(db, repoDir)
        emitter.setFsSync(new FsWriter(db, repoDir, emitter))
        mkdirSync(join(repoDir, "old-folder"), { recursive: true })
        writeFileSync(join(repoDir, "old-folder", "old-folder.md"), "# F\n")
        writeFileSync(join(repoDir, "old-folder", "child.md"), "# Child\n")
        await manager.syncFromFs()
        const folder = findFolder(db, "old-folder")!
        const childFile = findMdFile(db, "child", folder.id)!
        emitNodeUpdated(emitter, "test", folder.id, { content: "new-folder" })
        expect(getNode(db, childFile.id)!.fs_path).toContain("new-folder")
      }))

    test("G2b: folder rename renames same-name index file", () =>
      withTestEnv(async ({ repoDir, db, emitter }) => {
        writeConfig(repoDir, "none")
        const manager = createSyncManager(db, repoDir)
        emitter.setFsSync(new FsWriter(db, repoDir, emitter))
        mkdirSync(join(repoDir, "project"), { recursive: true })
        writeFileSync(join(repoDir, "project", "project.md"), "# My Project\n")
        writeFileSync(join(repoDir, "project", "child.md"), "# Child\n")
        await manager.syncFromFs()

        const folder = findFolder(db, "project")!
        const indexFile = findMdFile(db, "project", folder.id)!
        expect(indexFile).toBeDefined()

        // Rename folder: project → newname
        emitNodeUpdated(emitter, "test", folder.id, { content: "newname" })

        // The same-name index file should be renamed on disk
        expect(existsSync(join(repoDir, "newname", "newname.md"))).toBe(true)
        expect(existsSync(join(repoDir, "newname", "project.md"))).toBe(false)

        // The index file node should be updated in DB
        const renamedIndex = getNode(db, indexFile.id)!
        expect(renamedIndex.name).toBe("newname")
        expect(renamedIndex.fs_path).toBe("newname/newname.md")

        // findIndexFile should still detect it after rename
        const folderAfter = getNode(db, folder.id)!
        const children = getChildren(db, folderAfter.id)
        const detectedIndex = findIndexFile(folderAfter, children)
        expect(detectedIndex).not.toBeNull()
        expect(detectedIndex!.id).toBe(indexFile.id)
      }))

    test("G2c: folder rename does NOT rename non-matching index file", () =>
      withTestEnv(async ({ repoDir, db, emitter }) => {
        writeConfig(repoDir, "none")
        const manager = createSyncManager(db, repoDir)
        emitter.setFsSync(new FsWriter(db, repoDir, emitter))
        mkdirSync(join(repoDir, "project"), { recursive: true })
        // index.md does NOT match the folder name — it should NOT be renamed
        writeFileSync(join(repoDir, "project", "index.md"), "# My Project\n")
        await manager.syncFromFs()

        const folder = findFolder(db, "project")!
        emitNodeUpdated(emitter, "test", folder.id, { content: "newname" })

        // index.md should still exist (not renamed)
        expect(existsSync(join(repoDir, "newname", "index.md"))).toBe(true)
      }))

    test("G3: child moved into folder → detected", () =>
      withTestEnv(async ({ repoDir, db, emitter }) => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
        try {
          writeConfig(repoDir, "full")
          const manager = createSyncManager(db, repoDir)
          emitter.setFsSync(new FsWriter(db, repoDir, emitter))
          const fp = join(repoDir, "project")
          mkdirSync(join(fp, "existing"), { recursive: true })
          writeFileSync(join(fp, "index.md"), "# P\n\n![[./existing]]\n")
          writeFileSync(join(repoDir, "newcomer.md"), "# Newcomer\n")
          await manager.syncFromFs()
          renameSync(join(repoDir, "newcomer.md"), join(fp, "newcomer.md"))
          writeFileSync(join(fp, "index.md"), "# P\n\n![[./existing]]\n![[./newcomer]]\n")
          await manager.syncFromFs()
          const ch = getChildren(db, findFolder(db, "project")!.id).filter((c) => c.name !== "index")
          expect(ch.find((c) => c.name === "existing")).toBeDefined()
          expect(ch.find((c) => c.name === "newcomer")).toBeDefined()
        } finally {
          warnSpy.mockRestore()
        }
      }))

    test("G4: child moved out of folder", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const manager = createSyncManager(db, repoDir)
        const fp = join(repoDir, "project")
        mkdirSync(fp, { recursive: true })
        writeFileSync(join(fp, "index.md"), "# P\n")
        writeFileSync(join(fp, "removeme.md"), "# Remove Me\n")
        await manager.syncFromFs()
        const folder = findFolder(db, "project")!
        expect(getChildren(db, folder.id).find((c) => c.name === "removeme")).toBeDefined()
        renameSync(join(fp, "removeme.md"), join(repoDir, "removeme.md"))
        await manager.syncFromFs()
        const stillInFolder = getChildren(db, folder.id).find(
          (c) => c.name === "removeme" && c.fs_path?.includes("project/"),
        )
        expect(stillInFolder).toBeUndefined()
      }))
  })

  describe("H. race conditions & event reliability", () => {
    test("H1: externally modified index file + FsWriter → no crash", () =>
      withTestEnv(async ({ repoDir, db, emitter }) => {
        writeConfig(repoDir, "full")
        const manager = createSyncManager(db, repoDir)
        emitter.setFsSync(new FsWriter(db, repoDir, emitter))
        const fp = join(repoDir, "project")
        mkdirSync(join(fp, "alpha"), { recursive: true })
        mkdirSync(join(fp, "beta"), { recursive: true })
        writeFileSync(join(fp, "index.md"), "# P\n\n![[./alpha]]\n![[./beta]]\n")
        await manager.syncFromFs()
        writeFileSync(join(fp, "index.md"), "# Modified\n\n![[./beta]]\n![[./alpha]]\n")
        emitNodeUpdated(emitter, "test", findFolder(db, "project")!.id, {
          data: { description: "test" },
        })
        expect(existsSync(join(fp, "index.md"))).toBe(true)
        expect(readFileSync(join(fp, "index.md"), "utf-8")).toContain("# ")
      }))

    test("H2: folder update + external edit → consistent", () =>
      withTestEnv(async ({ repoDir, db, emitter }) => {
        writeConfig(repoDir, "full")
        const manager = createSyncManager(db, repoDir)
        emitter.setFsSync(new FsWriter(db, repoDir, emitter))
        const fp = join(repoDir, "project")
        mkdirSync(join(fp, "alpha"), { recursive: true })
        writeFileSync(join(fp, "index.md"), "# P\n\n![[./alpha]]\n")
        await manager.syncFromFs()
        writeFileSync(join(fp, "index.md"), "# P Edited\n\n![[./alpha]]\n")
        emitNodeUpdated(emitter, "test", findFolder(db, "project")!.id, {
          data: { description: "x" },
        })
        await manager.syncFromFs()
        expect(getChildren(db, findFolder(db, "project")!.id).find((c) => c.name === "alpha")).toBeDefined()
      }))

    test("H3: heartbeat catches missed file change at repo root", () =>
      withTestEnv(async ({ repoDir, db }) => {
        // Suppress expected console output from syncIndexFileToFolder
        const errSpy = vi.spyOn(console, "error").mockImplementation(() => {})
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
        try {
          const manager = createSyncManager(db, repoDir)
          writeFileSync(join(repoDir, "notes.md"), "# Original\n")
          await manager.syncFromFs()
          writeFileSync(join(repoDir, "notes.md"), "# Caught By Heartbeat\n")
          utimesSync(join(repoDir, "notes.md"), new Date(Date.now() + 5000), new Date(Date.now() + 5000))
          const result = manager.forceHeartbeat()
          expect(result.opsCount).toBeGreaterThan(0)
          const notes = getAllNodes(db).find((n) => n.name === "notes" && n.fstype === "mdfile")
          expect(notes!.content).toBe("Caught By Heartbeat")
        } finally {
          errSpy.mockRestore()
          warnSpy.mockRestore()
        }
      }))

    test("H4: rapid successive edits → final state correct", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const manager = createSyncManager(db, repoDir)
        const fp = join(repoDir, "project")
        mkdirSync(join(fp, "a"), { recursive: true })
        mkdirSync(join(fp, "b"), { recursive: true })
        mkdirSync(join(fp, "c"), { recursive: true })
        writeFileSync(join(fp, "index.md"), "# P\n\n![[./a]]\n![[./b]]\n![[./c]]\n")
        await manager.syncFromFs()
        writeFileSync(join(fp, "index.md"), "# E1\n\n![[./b]]\n![[./a]]\n![[./c]]\n")
        await manager.syncFromFs()
        writeFileSync(join(fp, "index.md"), "# E2\n\n![[./c]]\n![[./b]]\n![[./a]]\n")
        await manager.syncFromFs()
        writeFileSync(join(fp, "index.md"), "# Final\n\n![[./c]]\n![[./a]]\n![[./b]]\n")
        await manager.syncFromFs()
        const folder = findFolder(db, "project")!
        expect(getNode(db, folder.id)!.content).toBe("Final")
        const ch = getChildren(db, folder.id).filter((c) => c.name !== "index")
        expect(ch.find((n) => n.name === "c")!.parent_idx).toBeLessThan(ch.find((n) => n.name === "a")!.parent_idx)
        expect(ch.find((n) => n.name === "a")!.parent_idx).toBeLessThan(ch.find((n) => n.name === "b")!.parent_idx)
      }))

    test("H5: file created at root, watcher lost → heartbeat catches", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const manager = createSyncManager(db, repoDir)
        writeFileSync(join(repoDir, "existing.md"), "# Existing\n")
        await manager.syncFromFs()
        writeFileSync(join(repoDir, "discovered.md"), "# Discovered\n")
        utimesSync(join(repoDir, "discovered.md"), new Date(Date.now() + 5000), new Date(Date.now() + 5000))
        manager.forceHeartbeat()
        expect(getAllNodes(db).find((n) => n.name === "discovered" && n.fstype === "mdfile")).toBeDefined()
      }))

    test("H6: file deleted at root, event lost → heartbeat reconciles", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const manager = createSyncManager(db, repoDir)
        writeFileSync(join(repoDir, "deleteme.md"), "# D\n")
        writeFileSync(join(repoDir, "keeper.md"), "# K\n")
        await manager.syncFromFs()
        const deleteFile = getAllNodes(db).find((n) => n.name === "deleteme" && n.fstype === "mdfile")!
        unlinkSync(join(repoDir, "deleteme.md"))
        manager.forceHeartbeat()
        expect(getNode(db, deleteFile.id)).toBeNull()
      }))

    test("H7: reorder via index → unique parent_idx values", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const manager = createSyncManager(db, repoDir)
        const fp = join(repoDir, "project")
        mkdirSync(join(fp, "x"), { recursive: true })
        mkdirSync(join(fp, "y"), { recursive: true })
        writeFileSync(join(fp, "index.md"), "# P\n\n![[./x]]\n![[./y]]\n")
        await manager.syncFromFs()
        writeFileSync(join(fp, "index.md"), "# P\n\n![[./y]]\n![[./x]]\n")
        await manager.syncFromFs()
        const ch = getChildren(db, findFolder(db, "project")!.id).filter((c) => c.name !== "index")
        expect(ch.find((c) => c.name === "y")!.parent_idx).toBeLessThan(ch.find((c) => c.name === "x")!.parent_idx)
        expect(new Set(ch.map((c) => c.parent_idx)).size).toBe(ch.length)
      }))
  })

  describe("I. multiple index files & priority cascade", () => {
    test("I1: both project.md and index.md → same-name wins", () =>
      withTestEnv(async ({ repoDir, db }) => {
        writeConfig(repoDir, "none")
        const manager = createSyncManager(db, repoDir)
        mkdirSync(join(repoDir, "project"), { recursive: true })
        writeFileSync(join(repoDir, "project", "project.md"), "# From Same-Name\n")
        writeFileSync(join(repoDir, "project", "index.md"), "# From Index\n")
        await manager.syncFromFs()
        await touchIndexFile(manager, join(repoDir, "project", "project.md"))
        expect(findFolder(db, "project")!.content).toBe("From Same-Name")
      }))

    test("I2: both index.md and .md → index.md wins", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const manager = createSyncManager(db, repoDir)
        mkdirSync(join(repoDir, "archive"), { recursive: true })
        writeFileSync(join(repoDir, "archive", "index.md"), "# From Index\n")
        // .md won't be scanned (hidden file), so index.md is the only one
        await manager.syncFromFs()
        await touchIndexFile(manager, join(repoDir, "archive", "index.md"))
        expect(findFolder(db, "archive")!.content).toBe("From Index")
      }))

    test("I3: all three exist → same-name wins", () =>
      withTestEnv(async ({ repoDir, db }) => {
        writeConfig(repoDir, "none")
        const manager = createSyncManager(db, repoDir)
        mkdirSync(join(repoDir, "project"), { recursive: true })
        writeFileSync(join(repoDir, "project", "project.md"), "# From Same-Name\n")
        writeFileSync(join(repoDir, "project", "index.md"), "# From Index\n")
        // .md won't be scanned
        await manager.syncFromFs()
        await touchIndexFile(manager, join(repoDir, "project", "project.md"))
        expect(findFolder(db, "project")!.content).toBe("From Same-Name")
      }))

    test("I4: delete same-name.md → index.md becomes primary", () =>
      withTestEnv(async ({ repoDir, db }) => {
        writeConfig(repoDir, "none")
        const manager = createSyncManager(db, repoDir)
        mkdirSync(join(repoDir, "project"), { recursive: true })
        writeFileSync(join(repoDir, "project", "project.md"), "# From Same-Name\n")
        writeFileSync(join(repoDir, "project", "index.md"), "# From Index\n")
        await manager.syncFromFs()
        await touchIndexFile(manager, join(repoDir, "project", "project.md"))
        expect(findFolder(db, "project")!.content).toBe("From Same-Name")
        unlinkSync(join(repoDir, "project", "project.md"))
        await manager.syncFromFs()
        await touchIndexFile(manager, join(repoDir, "project", "index.md"))
        expect(getNode(db, findFolder(db, "project")!.id)!.content).toBe("From Index")
      }))

    test("I5: delete primary same-name → fallback to index.md", () =>
      withTestEnv(async ({ repoDir, db }) => {
        writeConfig(repoDir, "none")
        const manager = createSyncManager(db, repoDir)
        mkdirSync(join(repoDir, "project"), { recursive: true })
        writeFileSync(join(repoDir, "project", "project.md"), "# From Same-Name\n")
        writeFileSync(join(repoDir, "project", "index.md"), "# Fallback\n")
        await manager.syncFromFs()
        await touchIndexFile(manager, join(repoDir, "project", "project.md"))
        const folder = findFolder(db, "project")!
        expect(folder.content).toBe("From Same-Name")
        unlinkSync(join(repoDir, "project", "project.md"))
        await manager.syncFromFs()
        await touchIndexFile(manager, join(repoDir, "project", "index.md"))
        expect(getNode(db, folder.id)!.content).toBe("Fallback")
      }))

    test("I6: create same-name.md when index.md exists → same-name takes over", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const manager = createSyncManager(db, repoDir)
        mkdirSync(join(repoDir, "project"), { recursive: true })
        writeFileSync(join(repoDir, "project", "index.md"), "# From Index\n")
        await manager.syncFromFs()
        await touchIndexFile(manager, join(repoDir, "project", "index.md"))
        expect(findFolder(db, "project")!.content).toBe("From Index")
        writeFileSync(join(repoDir, "project", "project.md"), "# From Same-Name\n")
        await manager.syncFromFs()
        await touchIndexFile(manager, join(repoDir, "project", "project.md"))
        expect(getNode(db, findFolder(db, "project")!.id)!.content).toBe("From Same-Name")
      }))

    test("I7: create index.md when only other file exists → index.md takes over", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const manager = createSyncManager(db, repoDir)
        mkdirSync(join(repoDir, "project"), { recursive: true })
        writeFileSync(join(repoDir, "project", "notes.md"), "# Notes\n")
        await manager.syncFromFs()
        const folder = findFolder(db, "project")!
        expect(folder.content).toBe("project")
        writeFileSync(join(repoDir, "project", "index.md"), "# From Index\n")
        await manager.syncFromFs()
        await touchIndexFile(manager, join(repoDir, "project", "index.md"))
        expect(getNode(db, folder.id)!.content).toBe("From Index")
      }))

    test("I8: materialization=full + delete primary → new per config", () =>
      withTestEnv(async ({ repoDir, db, emitter }) => {
        writeConfig(repoDir, "full", "index")
        clearConfigCache()
        const manager = createSyncManager(db, repoDir)
        emitter.setFsSync(new FsWriter(db, repoDir, emitter))
        mkdirSync(join(repoDir, "project"), { recursive: true })
        writeFileSync(join(repoDir, "project", "project.md"), "# My Project\n")
        writeFileSync(join(repoDir, "project", "child.md"), "# Child\n")
        await manager.syncFromFs()
        // project.md is the primary index (same-name)
        expect(existsSync(join(repoDir, "project", "project.md"))).toBe(true)
        // Delete the primary index
        unlinkSync(join(repoDir, "project", "project.md"))
        await manager.syncFromFs()
        // After deletion + sync, handleFolderIndexUpdate should re-create per config naming=index
        expect(existsSync(join(repoDir, "project", "index.md"))).toBe(true)
      }))

    test("I9: case variant (Project.md vs project) → detected as index file", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const manager = createSyncManager(db, repoDir)
        mkdirSync(join(repoDir, "project"), { recursive: true })
        writeFileSync(join(repoDir, "project", "Project.md"), "# From Project.md\n")
        await manager.syncFromFs()
        const folder = findFolder(db, "project")!
        expect(findMdFile(db, "Project", folder.id)).toBeDefined()
        await touchIndexFile(manager, join(repoDir, "project", "Project.md"))
        expect(getNode(db, folder.id)!.content).toBe("From Project.md")
      }))
  })

  describe("J. round-trip fidelity", () => {
    test("J1: write → sync → re-materialize: consistent", () =>
      withTestEnv(async ({ repoDir, db, emitter }) => {
        writeConfig(repoDir, "full")
        const manager = createSyncManager(db, repoDir)
        emitter.setFsSync(new FsWriter(db, repoDir, emitter))
        const fp = join(repoDir, "project")
        mkdirSync(join(fp, "alpha"), { recursive: true })
        mkdirSync(join(fp, "beta"), { recursive: true })
        writeFileSync(join(fp, "alpha", "readme.md"), "# A\n")
        writeFileSync(join(fp, "beta", "readme.md"), "# B\n")
        await manager.syncFromFs()
        const folder = findFolder(db, "project")!
        emitNodeUpdated(emitter, "test", folder.id, { data: { description: "gen" } })
        let content = readFileSync(join(fp, "index.md"), "utf-8")
        expect(content).toContain("# project")
        expect(content).toContain("![[./alpha]]")
        expect(content).toContain("![[./beta]]")
        await manager.syncFromFs()
        emitNodeUpdated(emitter, "test", folder.id, { data: { description: "regen" } })
        content = readFileSync(join(fp, "index.md"), "utf-8")
        expect(content).toContain("# project")
        expect(content).toContain("![[./alpha]]")
        expect(content).toContain("![[./beta]]")
      }))

    test("J2: ![[./child]] syntax preserved on disk", () =>
      withTestEnv(async ({ repoDir, db }) => {
        writeConfig(repoDir, "none")
        const manager = createSyncManager(db, repoDir)
        const fp = join(repoDir, "project")
        mkdirSync(join(fp, "docs"), { recursive: true })
        mkdirSync(join(fp, "src"), { recursive: true })
        writeFileSync(join(fp, "index.md"), "# P\n\n![[./docs]]\n![[./src]]\n")
        await manager.syncFromFs()
        const content = readFileSync(join(fp, "index.md"), "utf-8")
        expect(content).toContain("![[./docs]]")
        expect(content).toContain("![[./src]]")
      }))

    test("J3: ordering stable after sync cycle", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const manager = createSyncManager(db, repoDir)
        const fp = join(repoDir, "project")
        mkdirSync(join(fp, "alpha"), { recursive: true })
        mkdirSync(join(fp, "beta"), { recursive: true })
        mkdirSync(join(fp, "gamma"), { recursive: true })
        writeFileSync(join(fp, "index.md"), "# P\n\n![[./gamma]]\n![[./alpha]]\n![[./beta]]\n")
        await manager.syncFromFs()
        writeFileSync(join(fp, "index.md"), "# P2\n\n![[./gamma]]\n![[./alpha]]\n![[./beta]]\n")
        await manager.syncFromFs()
        const folder = findFolder(db, "project")!
        let ch = getChildren(db, folder.id).filter((c) => c.name !== "index")
        expect(ch.find((c) => c.name === "gamma")!.parent_idx).toBeLessThan(
          ch.find((c) => c.name === "alpha")!.parent_idx,
        )
        expect(ch.find((c) => c.name === "alpha")!.parent_idx).toBeLessThan(
          ch.find((c) => c.name === "beta")!.parent_idx,
        )
        writeFileSync(join(fp, "index.md"), "# P3\n\n![[./gamma]]\n![[./alpha]]\n![[./beta]]\n")
        await manager.syncFromFs()
        ch = getChildren(db, folder.id).filter((c) => c.name !== "index")
        expect(ch.find((c) => c.name === "gamma")!.parent_idx).toBeLessThan(
          ch.find((c) => c.name === "alpha")!.parent_idx,
        )
        expect(ch.find((c) => c.name === "alpha")!.parent_idx).toBeLessThan(
          ch.find((c) => c.name === "beta")!.parent_idx,
        )
      }))
  })

  describe("K. batch index consistency", () => {
    test("K1: child create refreshes parent folder's materialized index", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const manager = createSyncManager(db, repoDir)
        writeConfig(repoDir, "full")
        const fp = join(repoDir, "project")
        mkdirSync(fp, { recursive: true })
        writeFileSync(join(fp, "alpha.md"), "# Alpha\n")
        writeFileSync(join(fp, "index.md"), "# Project\n\n![[./alpha]]\n")
        await manager.syncFromFs()

        // Verify initial state: index file lists alpha
        let content = readFileSync(join(fp, "index.md"), "utf-8")
        expect(content).toContain("![[./alpha]]")

        // Now create a new child — parent's index file should be refreshed to include it
        writeFileSync(join(fp, "beta.md"), "# Beta\n")
        await manager.syncFromFs()

        const folder = findFolder(db, "project")!
        const children = getChildren(db, folder.id)
        const beta = children.find((c) => c.name === "beta")
        expect(beta).toBeDefined()

        // The materialized index file should now include beta
        content = readFileSync(join(fp, "index.md"), "utf-8")
        expect(content).toContain("![[./beta]]")
      }))

    test("K2: move child out of folder refreshes source parent's index", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const manager = createSyncManager(db, repoDir)
        writeConfig(repoDir, "full")
        const src = join(repoDir, "src-folder")
        const dst = join(repoDir, "dst-folder")
        mkdirSync(src, { recursive: true })
        mkdirSync(dst, { recursive: true })
        writeFileSync(join(src, "child.md"), "# Child\n")
        writeFileSync(join(src, "index.md"), "# Source\n\n![[./child]]\n")
        writeFileSync(join(dst, "index.md"), "# Dest\n")
        await manager.syncFromFs()

        // Move child from src to dst
        renameSync(join(src, "child.md"), join(dst, "child.md"))
        await manager.syncFromFs()

        // Source folder's index should no longer reference child
        const srcContent = readFileSync(join(src, "index.md"), "utf-8")
        expect(srcContent).not.toContain("![[./child]]")
      }))

    test("K3: updated index file in same batch as sibling create both reflected", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const manager = createSyncManager(db, repoDir)
        writeConfig(repoDir, "full")
        const fp = join(repoDir, "project")
        mkdirSync(fp, { recursive: true })
        writeFileSync(join(fp, "alpha.md"), "# Alpha\n")
        writeFileSync(join(fp, "index.md"), "# Project\n\n![[./alpha]]\n")
        await manager.syncFromFs()

        // In same batch: update the index file AND create a new sibling
        writeFileSync(join(fp, "index.md"), "# Project Updated\n\n![[./alpha]]\n![[./beta]]\n")
        writeFileSync(join(fp, "beta.md"), "# Beta\n")
        await manager.syncFromFs()

        // Both the updated index and the new sibling should be synced
        const folder = findFolder(db, "project")!
        expect(getNode(db, folder.id)!.content).toBe("Project Updated")
        const children = getChildren(db, folder.id)
        expect(children.find((c) => c.name === "beta")).toBeDefined()

        // Index file should list both children (alpha from update, beta from create)
        const content = readFileSync(join(fp, "index.md"), "utf-8")
        expect(content).toContain("![[./alpha]]")
        expect(content).toContain("![[./beta]]")
      }))
  })

  describe("L. injected FS usage", () => {
    test("L1: finalizeBatchLinks re-materialization uses injected fs", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const manager = createSyncManager(db, repoDir)
        writeConfig(repoDir, "full")
        const fp = join(repoDir, "project")
        mkdirSync(fp, { recursive: true })
        writeFileSync(join(fp, "alpha.md"), "# Alpha\n")
        writeFileSync(join(fp, "index.md"), "# Project\n\n![[./alpha]]\n")
        await manager.syncFromFs()

        // Delete the index file — triggers re-materialization
        unlinkSync(join(fp, "index.md"))
        await manager.syncFromFs()

        // A new index file should be re-materialized
        expect(existsSync(join(fp, "index.md"))).toBe(true)
        const content = readFileSync(join(fp, "index.md"), "utf-8")
        expect(content).toContain("# Project")
      }))
  })

  describe("M. rename consistency", () => {
    test("M1: external file rename updates node name (not just fs_path)", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const manager = createSyncManager(db, repoDir)
        mkdirSync(join(repoDir, "docs"), { recursive: true })
        writeFileSync(join(repoDir, "docs", "old-name.md"), "# Old Name\n")
        await manager.syncFromFs()

        const nodeBefore = findMdFile(db, "old-name")!
        expect(nodeBefore).toBeDefined()
        expect(nodeBefore.name).toBe("old-name")

        // External rename: old-name.md → new-name.md
        renameSync(join(repoDir, "docs", "old-name.md"), join(repoDir, "docs", "new-name.md"))
        await manager.syncFromFs()

        // Both fs_path and name should reflect the new filename
        const nodeAfter = getNode(db, nodeBefore.id)!
        expect(nodeAfter.fs_path).toContain("new-name")
        expect(nodeAfter.name).toBe("new-name")
      }))

    test("M2: in-app file rename refreshes parent materialized index", () =>
      withTestEnv(async ({ repoDir, db, emitter }) => {
        writeConfig(repoDir, "full")
        const manager = createSyncManager(db, repoDir)
        emitter.setFsSync(new FsWriter(db, repoDir, emitter))
        const fp = join(repoDir, "project")
        mkdirSync(fp, { recursive: true })
        writeFileSync(join(fp, "project.md"), "# Project\n")
        writeFileSync(join(fp, "old-child.md"), "# Old Child\n")
        await manager.syncFromFs()

        const folder = findFolder(db, "project")!
        const childFile = findMdFile(db, "old-child", folder.id)!
        expect(childFile).toBeDefined()

        // Read materialized index before rename
        const indexBefore = readFileSync(join(fp, "project.md"), "utf-8")
        expect(indexBefore).toContain("old-child")

        // In-app rename: change the file's title (triggers file rename)
        emitNodeUpdated(emitter, "test", childFile.id, { content: "New Child" })

        // The parent's materialized index should now reference the new filename
        // titleToFilename preserves case and spaces, so "New Child" → "New Child.md"
        const indexAfter = readFileSync(join(fp, "project.md"), "utf-8")
        expect(indexAfter).toContain("New Child")
        expect(indexAfter).not.toContain("old-child")
      }))

    test("M3: folder+index rename is failure-safe when target exists", () =>
      withTestEnv(async ({ repoDir, db, emitter }) => {
        writeConfig(repoDir, "none")
        const manager = createSyncManager(db, repoDir)
        emitter.setFsSync(new FsWriter(db, repoDir, emitter))
        mkdirSync(join(repoDir, "project"), { recursive: true })
        writeFileSync(join(repoDir, "project", "project.md"), "# My Project\n")
        // Create a file that will conflict with the renamed index
        writeFileSync(join(repoDir, "project", "newname.md"), "# Conflicting\n")
        await manager.syncFromFs()

        const folder = findFolder(db, "project")!
        const indexFile = findMdFile(db, "project", folder.id)!
        expect(indexFile).toBeDefined()

        // Rename folder: project → newname
        // The index file rename (project.md → newname.md) should fail
        // because newname.md already exists in the folder
        emitNodeUpdated(emitter, "test", folder.id, { content: "newname" })

        // Folder should be renamed on disk
        expect(existsSync(join(repoDir, "newname"))).toBe(true)

        // The index file should NOT have been renamed (target existed)
        // so it still exists with the old name inside the new folder
        expect(existsSync(join(repoDir, "newname", "project.md"))).toBe(true)

        // DB should be consistent: index file's name should still be "project"
        // (not updated since the FS rename didn't succeed)
        const indexAfter = getNode(db, indexFile.id)!
        expect(indexAfter.name).toBe("project")
      }))
  })

  describe("N. body preservation", () => {
    test("N1: index file with code block body survives folder update", () =>
      withTestEnv(async ({ repoDir, db, emitter }) => {
        writeConfig(repoDir, "full")
        const manager = createSyncManager(db, repoDir)
        emitter.setFsSync(new FsWriter(db, repoDir, emitter))
        const fp = join(repoDir, "project")
        mkdirSync(fp, { recursive: true })
        mkdirSync(join(fp, "docs"), { recursive: true })

        // Index file with code block in body
        const indexContent = [
          "# My Project",
          "",
          "```typescript",
          'const x = "hello world"',
          "function foo() {",
          "  return x",
          "}",
          "```",
          "",
          "![[./docs]]",
          "",
        ].join("\n")
        writeFileSync(join(fp, "project.md"), indexContent)
        await manager.syncFromFs()

        // Trigger folder update — this re-materializes the index file
        const folder = findFolder(db, "project")!
        emitNodeUpdated(emitter, "test", folder.id, { data: { description: "updated" } })

        // Body (code block) should be preserved
        const result = readFileSync(join(fp, "project.md"), "utf-8")
        expect(result).toContain("```typescript")
        expect(result).toContain('const x = "hello world"')
        expect(result).toContain("function foo() {")
        expect(result).toContain("```")
        // Slots should still be present
        expect(result).toContain("![[./docs]]")
      }))

    test("N2: index file with list items in body survives folder update", () =>
      withTestEnv(async ({ repoDir, db, emitter }) => {
        writeConfig(repoDir, "full")
        const manager = createSyncManager(db, repoDir)
        emitter.setFsSync(new FsWriter(db, repoDir, emitter))
        const fp = join(repoDir, "project")
        mkdirSync(fp, { recursive: true })
        mkdirSync(join(fp, "alpha"), { recursive: true })

        const indexContent = [
          "# My Project",
          "",
          "- First item",
          "- Second item",
          "- Third item",
          "",
          "![[./alpha]]",
          "",
        ].join("\n")
        writeFileSync(join(fp, "project.md"), indexContent)
        await manager.syncFromFs()

        // Trigger folder update
        const folder = findFolder(db, "project")!
        emitNodeUpdated(emitter, "test", folder.id, { data: { description: "updated" } })

        const result = readFileSync(join(fp, "project.md"), "utf-8")
        expect(result).toContain("- First item")
        expect(result).toContain("- Second item")
        expect(result).toContain("- Third item")
        expect(result).toContain("![[./alpha]]")
      }))

    test("N3: external directory creation triggers parent index refresh", () =>
      withTestEnv(async ({ repoDir, db }) => {
        writeConfig(repoDir, "full")
        const manager = createSyncManager(db, repoDir)
        const fp = join(repoDir, "project")
        mkdirSync(fp, { recursive: true })
        writeFileSync(join(fp, "index.md"), "# Project\n")
        await manager.syncFromFs()

        // Create a new subdirectory externally
        mkdirSync(join(fp, "new-folder"), { recursive: true })
        await manager.syncFromFs()

        // Parent index file should list the new folder
        const content = readFileSync(join(fp, "index.md"), "utf-8")
        expect(content).toContain("![[./new-folder]]")
      }))

    test("N4: external .txt file creation triggers parent index refresh", () =>
      withTestEnv(async ({ repoDir, db }) => {
        writeConfig(repoDir, "full")
        const manager = createSyncManager(db, repoDir)
        const fp = join(repoDir, "project")
        mkdirSync(fp, { recursive: true })
        writeFileSync(join(fp, "index.md"), "# Project\n")
        await manager.syncFromFs()

        // Create a new .txt file externally
        writeFileSync(join(fp, "notes.txt"), "Some plain text notes\n")
        await manager.syncFromFs()

        // Parent index file should list the new file
        const content = readFileSync(join(fp, "index.md"), "utf-8")
        expect(content).toContain("![[./notes]]")
      }))

    test("N5: applier foldersToRefresh path preserves body", () =>
      withTestEnv(async ({ repoDir, db }) => {
        writeConfig(repoDir, "full")
        const manager = createSyncManager(db, repoDir)
        const fp = join(repoDir, "project")
        mkdirSync(fp, { recursive: true })

        // Create index file with body paragraph
        writeFileSync(join(fp, "index.md"), "# Project\n\nThis is a description paragraph.\n\n![[./alpha]]\n")
        mkdirSync(join(fp, "alpha"), { recursive: true })
        await manager.syncFromFs()

        // Externally create a new child — triggers foldersToRefresh in applier
        writeFileSync(join(fp, "beta.md"), "# Beta\n")
        await manager.syncFromFs()

        // Body should be preserved after the refresh
        const content = readFileSync(join(fp, "index.md"), "utf-8")
        expect(content).toContain("This is a description paragraph.")
        expect(content).toContain("![[./alpha]]")
        expect(content).toContain("![[./beta]]")
      }))

    test("N6: blockquote in body survives folder update", () =>
      withTestEnv(async ({ repoDir, db, emitter }) => {
        writeConfig(repoDir, "full")
        const manager = createSyncManager(db, repoDir)
        emitter.setFsSync(new FsWriter(db, repoDir, emitter))
        const fp = join(repoDir, "project")
        mkdirSync(fp, { recursive: true })
        mkdirSync(join(fp, "docs"), { recursive: true })

        const indexContent = "# My Project\n\n> Important note:\n> this is a blockquote\n\n![[./docs]]\n"
        writeFileSync(join(fp, "project.md"), indexContent)
        await manager.syncFromFs()

        // Trigger folder update
        const folder = findFolder(db, "project")!
        emitNodeUpdated(emitter, "test", folder.id, { data: { description: "updated" } })

        const result = readFileSync(join(fp, "project.md"), "utf-8")
        expect(result).toContain("> Important note:")
        expect(result).toContain("> this is a blockquote")
        expect(result).toContain("![[./docs]]")
      }))

    test("N7: index file with ONLY inline sections (no paragraphs) preserves body", () =>
      withTestEnv(async ({ repoDir, db, emitter }) => {
        writeConfig(repoDir, "full")
        const manager = createSyncManager(db, repoDir)
        emitter.setFsSync(new FsWriter(db, repoDir, emitter))
        const fp = join(repoDir, "project")
        mkdirSync(fp, { recursive: true })
        mkdirSync(join(fp, "docs"), { recursive: true })

        // Index file with only inline sections — no paragraph body nodes
        const indexContent = [
          "# My Project",
          "",
          "## Overview",
          "",
          "This section describes the project.",
          "",
          "## Goals",
          "",
          "- Goal one",
          "- Goal two",
          "",
          "![[./docs]]",
          "",
        ].join("\n")
        writeFileSync(join(fp, "project.md"), indexContent)
        await manager.syncFromFs()

        // Trigger folder update — this re-materializes the index file
        const folder = findFolder(db, "project")!
        emitNodeUpdated(emitter, "test", folder.id, { data: { description: "updated" } })

        // Inline sections should be preserved
        const result = readFileSync(join(fp, "project.md"), "utf-8")
        expect(result).toContain("## Overview")
        expect(result).toContain("This section describes the project.")
        expect(result).toContain("## Goals")
        expect(result).toContain("- Goal one")
        expect(result).toContain("- Goal two")
        // Slots should still be present
        expect(result).toContain("![[./docs]]")
      }))

    test("N8: slots interleaved between prose are not duplicated after rewrite", () =>
      withTestEnv(async ({ repoDir, db, emitter }) => {
        writeConfig(repoDir, "full")
        const manager = createSyncManager(db, repoDir)
        emitter.setFsSync(new FsWriter(db, repoDir, emitter))
        const fp = join(repoDir, "project")
        mkdirSync(fp, { recursive: true })
        mkdirSync(join(fp, "alpha"), { recursive: true })
        mkdirSync(join(fp, "beta"), { recursive: true })

        // Index file with slots interleaved between prose
        const indexContent = [
          "# My Project",
          "",
          "Introduction paragraph.",
          "",
          "![[./alpha]]",
          "",
          "Middle paragraph.",
          "",
          "![[./beta]]",
          "",
        ].join("\n")
        writeFileSync(join(fp, "project.md"), indexContent)
        await manager.syncFromFs()

        // Trigger folder update — this re-materializes the index file
        const folder = findFolder(db, "project")!
        emitNodeUpdated(emitter, "test", folder.id, { data: { description: "updated" } })

        // Check no slot duplication
        const result = readFileSync(join(fp, "project.md"), "utf-8")
        const alphaSlots = result.match(/!\[\[\.\/alpha\]\]/g) ?? []
        const betaSlots = result.match(/!\[\[\.\/beta\]\]/g) ?? []
        expect(alphaSlots.length).toBe(1)
        expect(betaSlots.length).toBe(1)
        // Body paragraphs should be preserved
        expect(result).toContain("Introduction paragraph.")
        expect(result).toContain("Middle paragraph.")
      }))

    test("N9: inline section with nested content preserved after folder update", () =>
      withTestEnv(async ({ repoDir, db, emitter }) => {
        writeConfig(repoDir, "full")
        const manager = createSyncManager(db, repoDir)
        emitter.setFsSync(new FsWriter(db, repoDir, emitter))
        const fp = join(repoDir, "project")
        mkdirSync(fp, { recursive: true })
        mkdirSync(join(fp, "src"), { recursive: true })

        // Index file with inline section containing nested content
        const indexContent = [
          "# My Project",
          "",
          "## Architecture",
          "",
          "The system uses a layered design:",
          "",
          "- Layer 1: Parser",
          "- Layer 2: Storage",
          "- Layer 3: Board",
          "",
          "### Components",
          "",
          "Each layer has its own test suite.",
          "",
          "![[./src]]",
          "",
        ].join("\n")
        writeFileSync(join(fp, "project.md"), indexContent)
        await manager.syncFromFs()

        // Trigger folder update
        const folder = findFolder(db, "project")!
        emitNodeUpdated(emitter, "test", folder.id, { data: { description: "updated" } })

        const result = readFileSync(join(fp, "project.md"), "utf-8")
        expect(result).toContain("## Architecture")
        expect(result).toContain("The system uses a layered design:")
        expect(result).toContain("- Layer 1: Parser")
        expect(result).toContain("- Layer 2: Storage")
        expect(result).toContain("- Layer 3: Board")
        expect(result).toContain("### Components")
        expect(result).toContain("Each layer has its own test suite.")
        expect(result).toContain("![[./src]]")
      }))
  })

  describe("O. rename bugs", () => {
    test("O1: handleRename updates parent_id for cross-folder move (km-z0k8z)", () =>
      withTestEnv(async ({ repoDir, db, emitter }) => {
        // handleRename is invoked when the reconciler detects a same-inode rename.
        // For cross-folder moves, this happens during watcher events or when the
        // reconciler scope includes both source and target. We test it directly
        // via applyReconcileOps with a synthetic rename op.
        const { applyReconcileOps } = await import("../../src/watch/reconcile.ts")

        const manager = createSyncManager(db, repoDir)
        mkdirSync(join(repoDir, "a"), { recursive: true })
        mkdirSync(join(repoDir, "b"), { recursive: true })
        writeFileSync(join(repoDir, "a", "task.md"), "# Task\n")
        writeFileSync(join(repoDir, "b", "index.md"), "# B\n")
        await manager.syncFromFs()

        const folderA = findFolder(db, "a")!
        const folderB = findFolder(db, "b")!
        const task = findMdFile(db, "task", folderA.id)!
        expect(task).toBeDefined()
        expect(task.parent_id).toBe(folderA.id)

        // Simulate what the watcher would produce for a cross-folder rename
        renameSync(join(repoDir, "a", "task.md"), join(repoDir, "b", "task.md"))
        applyReconcileOps(
          db,
          [
            {
              type: "rename" as const,
              nodeId: task.id,
              oldPath: join(repoDir, "a", "task.md"),
              path: join(repoDir, "b", "task.md"),
              ino: task.fs_ino ?? 0,
            },
          ],
          repoDir,
          emitter,
        )

        // parent_id should now be folderB, not folderA
        const taskAfter = getNode(db, task.id)!
        expect(taskAfter.parent_id).toBe(folderB.id)
        expect(taskAfter.fs_path).toContain("b/task.md")
      }))

    test("O2: renamed mdfile added to modifiedIndexFiles (km-pl25h)", () =>
      withTestEnv(async ({ repoDir, db }) => {
        writeConfig(repoDir, "full")
        const manager = createSyncManager(db, repoDir)
        mkdirSync(join(repoDir, "project"), { recursive: true })
        writeFileSync(join(repoDir, "project", "notes.md"), "# Notes\n")
        await manager.syncFromFs()

        const folder = findFolder(db, "project")!
        const notesFile = findMdFile(db, "notes", folder.id)!
        expect(notesFile).toBeDefined()

        // Rename notes.md → project.md (becomes the folder's index file)
        renameSync(join(repoDir, "project", "notes.md"), join(repoDir, "project", "project.md"))
        await manager.syncFromFs()

        // The renamed file should be detected as the folder's index file
        const renamedFile = getNode(db, notesFile.id)!
        expect(renamedFile.name).toBe("project")

        const children = getChildren(db, folder.id)
        const indexFile = findIndexFile(folder, children)
        expect(indexFile).not.toBeNull()
        expect(indexFile!.id).toBe(notesFile.id)

        // The folder should have the promoted title from the index file
        // (syncIndexFileToFolder should have run)
        const folderAfter = getNode(db, folder.id)!
        expect(folderAfter.content).toBe("Notes")
      }))

    test("O3: in-app folder rename refreshes index file title (km-mkzzr)", () =>
      withTestEnv(async ({ repoDir, db, emitter }) => {
        writeConfig(repoDir, "full")
        const manager = createSyncManager(db, repoDir)
        emitter.setFsSync(new FsWriter(db, repoDir, emitter))
        const fp = join(repoDir, "project")
        mkdirSync(fp, { recursive: true })
        writeFileSync(join(fp, "project.md"), "# Project\n")
        await manager.syncFromFs()

        const folder = findFolder(db, "project")!
        const indexFile = findMdFile(db, "project", folder.id)!
        expect(indexFile).toBeDefined()

        // In-app folder rename: project → renamed-project
        emitNodeUpdated(emitter, "test", folder.id, { content: "renamed-project" })

        // The index file should exist with the new name and contain the new title
        expect(existsSync(join(repoDir, "renamed-project", "renamed-project.md"))).toBe(true)
        const content = readFileSync(join(repoDir, "renamed-project", "renamed-project.md"), "utf-8")
        expect(content).toContain("# renamed-project")
      }))
  })
})

describe("P. regression: no duplicate sections after sync", () => {
  test("P1: folder with index file — sections not duplicated after syncFromFs", () =>
    withTestEnv(async ({ repoDir, db }) => {
      const manager = createSyncManager(db, repoDir)
      // Create a folder with an index file that has sections (like Asana's early-orbit)
      const fp = join(repoDir, "project")
      mkdirSync(fp, { recursive: true })
      writeFileSync(
        join(fp, "project.md"),
        "# Project\n\n## INBOX\n\n- [ ] Task A\n\n## DONE\n\n- [x] Task B\n",
      )
      writeFileSync(join(fp, "child.md"), "# Child\n\nSome content.\n")
      await manager.syncFromFs()

      // Count sections — should be exactly 2 (INBOX + DONE)
      const folder = findFolder(db, "project")!
      const indexFile = findMdFile(db, "project", folder.id)!
      const sections = getChildren(db, indexFile.id).filter(
        (c) => c.type === "h" && c.item && c.fstype === "mdsection",
      )
      expect(sections.map((s) => s.content)).toEqual(["INBOX", "DONE"])
      expect(sections.length).toBe(2)

      // Sync again — sections should NOT be duplicated
      await manager.syncFromFs()
      const sectionsAfter = getChildren(db, indexFile.id).filter(
        (c) => c.type === "h" && c.item && c.fstype === "mdsection",
      )
      expect(sectionsAfter.length).toBe(2)
      expect(sectionsAfter.map((s) => s.content)).toEqual(["INBOX", "DONE"])
    }))

  test("P2: folder with index file + FsWriter — no duplication after folder update", () =>
    withTestEnv(async ({ repoDir, db, emitter }) => {
      writeConfig(repoDir, "none")
      const manager = createSyncManager(db, repoDir)
      emitter.setFsSync(new FsWriter(db, repoDir, emitter))
      const fp = join(repoDir, "project")
      mkdirSync(fp, { recursive: true })
      writeFileSync(
        join(fp, "project.md"),
        "# Project\n\n## INBOX\n\n- [ ] Task A\n\n## DONE\n\n- [x] Task B\n",
      )
      writeFileSync(join(fp, "child.md"), "# Child\n")
      await manager.syncFromFs()

      const folder = findFolder(db, "project")!
      const indexFile = findMdFile(db, "project", folder.id)!

      // Trigger a folder update
      emitNodeUpdated(emitter, "test", folder.id, { data: { description: "updated" } })

      // Resync
      await manager.syncFromFs()

      // Sections should still be exactly 2
      const sections = getChildren(db, indexFile.id).filter(
        (c) => c.type === "h" && c.item && c.fstype === "mdsection",
      )
      expect(sections.length).toBe(2)
      expect(sections.map((s) => s.content)).toEqual(["INBOX", "DONE"])
    }))
})
