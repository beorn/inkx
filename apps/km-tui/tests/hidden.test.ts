/**
 * Hidden System Tests
 *
 * Covers:
 * - readBoardHidden: parsing .km/hidden file
 * - addHidden / removeHidden: file mutations
 * - computeHiddenPath: path computation for different node types
 * - isHidden: matching nodes against hidden paths (direct, folder prefix)
 * - computeHiddenNodeIds: full hidden set computation for a board
 * - slugify: text normalization (indirectly via computeHiddenPath)
 *
 * Uses temp directories for file I/O tests, mock repos for pure logic tests.
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, renameSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  readBoardHidden,
  addHidden,
  removeHidden,
  computeHiddenPath,
  isHidden,
  computeHiddenNodeIds,
} from "../src/hidden.ts"
import type { KNode } from "@km/core"

// =============================================================================
// Helpers
// =============================================================================

/** Create a minimal KNode for testing */
function mkNode(overrides: Partial<KNode> = {}): KNode {
  return {
    id: "n1",
    type: "h",
    parent_id: null,
    parent_idx: 0,
    content: "",
    name: "",
    title: "",
    fs_path: null,
    fstype: null,
    item: {},
    ...overrides,
  } as KNode
}

/** Minimal mock repo that can look up nodes and children */
function mockRepo(nodes: KNode[]) {
  const map = new Map(nodes.map((n) => [n.id, n]))
  return {
    path: "/tmp/test-repo",
    getNode: (id: string) => map.get(id) ?? null,
    getChildren: (parentId: string | null) =>
      nodes.filter((n) => n.parent_id === parentId).sort((a, b) => a.parent_idx - b.parent_idx),
  }
}

let tempDir: string

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "km-hidden-test-"))
})

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true })
})

// =============================================================================
// readBoardHidden
// =============================================================================

describe("readBoardHidden", () => {
  test("returns empty set when .km/hidden does not exist", () => {
    const result = readBoardHidden(tempDir)
    expect(result.size).toBe(0)
  })

  test("parses paths from .km/hidden file", () => {
    const kmDir = join(tempDir, ".km")
    mkdirSync(kmDir, { recursive: true })
    writeFileSync(join(kmDir, "hidden"), "done.md\narchive/\n")

    const result = readBoardHidden(tempDir)
    expect(result.has("done.md")).toBe(true)
    expect(result.has("archive/")).toBe(true)
    expect(result.size).toBe(2)
  })

  test("ignores blank lines and comments", () => {
    const kmDir = join(tempDir, ".km")
    mkdirSync(kmDir, { recursive: true })
    writeFileSync(join(kmDir, "hidden"), "# This is a comment\n\ndone.md\n\n# Another comment\narchive/\n")

    const result = readBoardHidden(tempDir)
    expect(result.size).toBe(2)
    expect(result.has("done.md")).toBe(true)
    expect(result.has("archive/")).toBe(true)
  })

  test("trims whitespace from each line", () => {
    const kmDir = join(tempDir, ".km")
    mkdirSync(kmDir, { recursive: true })
    writeFileSync(join(kmDir, "hidden"), "  done.md  \n  archive/  \n")

    const result = readBoardHidden(tempDir)
    expect(result.has("done.md")).toBe(true)
    expect(result.has("archive/")).toBe(true)
  })
})

// =============================================================================
// addHidden / removeHidden
// =============================================================================

describe("addHidden", () => {
  test("creates .km/hidden file with header when it does not exist", () => {
    addHidden(tempDir, "done.md")

    const content = readFileSync(join(tempDir, ".km", "hidden"), "utf-8")
    expect(content).toContain("done.md")
    expect(content).toContain("# .km/hidden")
  })

  test("appends to existing file without duplicating", () => {
    const kmDir = join(tempDir, ".km")
    mkdirSync(kmDir, { recursive: true })
    writeFileSync(join(kmDir, "hidden"), "existing.md\n")

    addHidden(tempDir, "done.md")
    addHidden(tempDir, "done.md") // duplicate — should be no-op

    const result = readBoardHidden(tempDir)
    expect(result.size).toBe(2)
    expect(result.has("existing.md")).toBe(true)
    expect(result.has("done.md")).toBe(true)
  })
})

describe("removeHidden", () => {
  test("removes a path from .km/hidden", () => {
    const kmDir = join(tempDir, ".km")
    mkdirSync(kmDir, { recursive: true })
    writeFileSync(join(kmDir, "hidden"), "done.md\narchive/\n")

    removeHidden(tempDir, "done.md")

    const result = readBoardHidden(tempDir)
    expect(result.has("done.md")).toBe(false)
    expect(result.has("archive/")).toBe(true)
  })

  test("no-op when file does not exist", () => {
    // Should not throw
    removeHidden(tempDir, "nonexistent.md")
  })

  test("no-op when path is not in the file", () => {
    const kmDir = join(tempDir, ".km")
    mkdirSync(kmDir, { recursive: true })
    writeFileSync(join(kmDir, "hidden"), "done.md\n")

    removeHidden(tempDir, "other.md")

    const result = readBoardHidden(tempDir)
    expect(result.has("done.md")).toBe(true)
    expect(result.size).toBe(1)
  })
})

// =============================================================================
// computeHiddenPath
// =============================================================================

describe("computeHiddenPath", () => {
  test("returns fs_path for file nodes", () => {
    const node = mkNode({ fs_path: "tasks.md", type: "h", fstype: "mdfile", item: {} })
    const repo = mockRepo([node])
    expect(computeHiddenPath(node, repo as any)).toBe("tasks.md")
  })

  test("returns fs_path with trailing slash for folders", () => {
    const node = mkNode({ fs_path: "archive", type: "h", fstype: "folder", item: {} })
    const repo = mockRepo([node])
    expect(computeHiddenPath(node, repo as any)).toBe("archive/")
  })

  test("returns file#slug for sections", () => {
    const file = mkNode({ id: "file1", fs_path: "tasks.md", type: "h", fstype: "mdfile", item: {} })
    const section = mkNode({
      id: "sec1",
      parent_id: "file1",
      type: "h",
      fstype: "mdsection",
      name: "Done Items",
      item: {},
    })
    const repo = mockRepo([file, section])
    expect(computeHiddenPath(section, repo as any)).toBe("tasks.md#done-items")
  })

  test("returns bare #slug when no parent file found", () => {
    const orphan = mkNode({ id: "orphan", parent_id: null, type: "p", name: "My Node", item: null } as any)
    const repo = mockRepo([orphan])
    expect(computeHiddenPath(orphan, repo as any)).toBe("#my-node")
  })

  test("returns null for nodes with no name/title/content", () => {
    const node = mkNode({ id: "empty", parent_id: null, type: "p", name: "", title: "", content: "" })
    const repo = mockRepo([node])
    expect(computeHiddenPath(node, repo as any)).toBeNull()
  })
})

// =============================================================================
// isHidden
// =============================================================================

describe("isHidden", () => {
  test("returns false for empty hidden set", () => {
    const node = mkNode({ fs_path: "tasks.md" })
    const repo = mockRepo([node])
    expect(isHidden(new Set(), node, repo as any)).toBe(false)
  })

  test("returns true for direct match", () => {
    const node = mkNode({ fs_path: "done.md", type: "h", fstype: "mdfile", item: {} })
    const repo = mockRepo([node])
    expect(isHidden(new Set(["done.md"]), node, repo as any)).toBe(true)
  })

  test("returns false for non-matching path", () => {
    const node = mkNode({ fs_path: "tasks.md", type: "h", fstype: "mdfile", item: {} })
    const repo = mockRepo([node])
    expect(isHidden(new Set(["done.md"]), node, repo as any)).toBe(false)
  })

  test("folder prefix match hides files within folder", () => {
    const node = mkNode({ fs_path: "archive/old.md", type: "h", fstype: "mdfile", item: {} })
    const repo = mockRepo([node])
    expect(isHidden(new Set(["archive/"]), node, repo as any)).toBe(true)
  })

  test("folder prefix does not match non-prefix paths", () => {
    const node = mkNode({ fs_path: "active/tasks.md", type: "h", fstype: "mdfile", item: {} })
    const repo = mockRepo([node])
    expect(isHidden(new Set(["archive/"]), node, repo as any)).toBe(false)
  })
})

// =============================================================================
// computeHiddenNodeIds
// =============================================================================

describe("computeHiddenNodeIds", () => {
  test("returns empty set when no hidden file exists", () => {
    const root = mkNode({ id: "root", parent_id: null })
    const col = mkNode({ id: "col", parent_id: "root", parent_idx: 0, fs_path: "col.md" })
    const card = mkNode({ id: "card", parent_id: "col", parent_idx: 0, fs_path: "card.md" })
    const repo = mockRepo([root, col, card])
    // Use a temp dir with no .km/hidden
    const result = computeHiddenNodeIds({ ...repo, path: tempDir }, "root")
    expect(result.size).toBe(0)
  })

  test("hides matching columns and cards", () => {
    const root = mkNode({ id: "root", parent_id: null })
    const col1 = mkNode({
      id: "col1",
      parent_id: "root",
      parent_idx: 0,
      fs_path: "todo.md",
      type: "h",
      fstype: "mdfile",
      item: {},
    })
    const col2 = mkNode({
      id: "col2",
      parent_id: "root",
      parent_idx: 1,
      fs_path: "done.md",
      type: "h",
      fstype: "mdfile",
      item: {},
    })
    const card = mkNode({
      id: "card1",
      parent_id: "col1",
      parent_idx: 0,
      fs_path: "task.md",
      type: "h",
      fstype: "mdfile",
      item: {},
    })

    const kmDir = join(tempDir, ".km")
    mkdirSync(kmDir, { recursive: true })
    writeFileSync(join(kmDir, "hidden"), "done.md\n")

    const repo = mockRepo([root, col1, col2, card])
    const result = computeHiddenNodeIds({ ...repo, path: tempDir }, "root")
    expect(result.has("col2")).toBe(true)
    expect(result.has("col1")).toBe(false)
    expect(result.has("card1")).toBe(false)
  })
})

// =============================================================================
// Migration: .km/ignored -> .km/hidden
// =============================================================================

describe("migration from .km/ignored to .km/hidden", () => {
  test("reads from .km/ignored when .km/hidden does not exist", () => {
    // Use a fresh temp dir for this test to avoid migration cache
    const migDir = mkdtempSync(join(tmpdir(), "km-hidden-migrate-"))
    try {
      const kmDir = join(migDir, ".km")
      mkdirSync(kmDir, { recursive: true })
      writeFileSync(join(kmDir, "ignored"), "old-hidden.md\n")

      const result = readBoardHidden(migDir)
      // After migration, .km/hidden should exist
      expect(existsSync(join(kmDir, "hidden"))).toBe(true)
      expect(result.has("old-hidden.md")).toBe(true)
    } finally {
      rmSync(migDir, { recursive: true, force: true })
    }
  })
})
