/**
 * FileTree Interface Tests
 *
 * Tests for FileTree factories: createDiskFileTree, createMemFileTree.
 * These are unit tests that verify the interface contracts.
 *
 * Pattern: shared test suite runs against both implementations.
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, rmSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { createDiskFileTree, createMemFileTree, type FileTree } from "../src/fs/file-tree.ts"

// =============================================================================
// Shared Test Suite (runs against all implementations)
// =============================================================================

function testFileTree(name: string, createFileTree: () => FileTree, cleanup?: () => void) {
  describe(name, () => {
    let tree: FileTree

    beforeEach(() => {
      tree = createFileTree()
    })

    afterEach(() => {
      tree.close()
      cleanup?.()
    })

    describe("root", () => {
      test("returns the root path", () => {
        expect(tree.root).toBeTruthy()
        expect(typeof tree.root).toBe("string")
      })
    })

    describe("read/write round-trip", () => {
      test("writes and reads back content", () => {
        const content = "# Hello\n\nThis is a test file."
        tree.write("test.md", content)
        expect(tree.read("test.md")).toBe(content)
      })

      test("overwrites existing content", () => {
        tree.write("test.md", "original")
        tree.write("test.md", "updated")
        expect(tree.read("test.md")).toBe("updated")
      })

      test("handles unicode content", () => {
        const content = "# Unicode Test\n- Task with emoji: \u2705\n- Japanese: \u3053\u3093\u306b\u3061\u306f"
        tree.write("unicode.md", content)
        expect(tree.read("unicode.md")).toBe(content)
      })

      test("handles empty content", () => {
        tree.write("empty.md", "")
        expect(tree.read("empty.md")).toBe("")
      })

      test("handles multi-line content", () => {
        const content = "line1\nline2\nline3\n"
        tree.write("lines.md", content)
        expect(tree.read("lines.md")).toBe(content)
      })
    })

    describe("exists()", () => {
      test("returns true for existing file", () => {
        tree.write("exists.md", "content")
        expect(tree.exists("exists.md")).toBe(true)
      })

      test("returns false for non-existing file", () => {
        expect(tree.exists("nonexistent.md")).toBe(false)
      })

      test("returns true for directory with files", () => {
        tree.write("subdir/file.md", "content")
        expect(tree.exists("subdir")).toBe(true)
      })

      test("returns false for non-existing directory", () => {
        expect(tree.exists("nonexistent-dir")).toBe(false)
      })
    })

    describe("list()", () => {
      test("returns files in root", () => {
        tree.write("a.md", "a")
        tree.write("b.md", "b")

        const entries = tree.list()
        expect(entries).toContain("a.md")
        expect(entries).toContain("b.md")
      })

      test("returns files in subdirectory", () => {
        tree.write("notes/file1.md", "1")
        tree.write("notes/file2.md", "2")

        const entries = tree.list("notes")
        expect(entries).toContain("file1.md")
        expect(entries).toContain("file2.md")
      })

      test("returns subdirectories", () => {
        tree.write("parent/child/file.md", "content")

        const entries = tree.list("parent")
        expect(entries).toContain("child")
      })

      test("does not recurse into subdirectories", () => {
        tree.write("dir/subdir/nested.md", "content")

        const entries = tree.list("dir")
        expect(entries).toContain("subdir")
        expect(entries).not.toContain("nested.md")
      })
    })

    describe("write() creates parent directories", () => {
      test("creates single parent directory", () => {
        tree.write("parent/file.md", "content")
        expect(tree.exists("parent/file.md")).toBe(true)
      })

      test("creates nested parent directories", () => {
        tree.write("a/b/c/d/file.md", "content")
        expect(tree.exists("a/b/c/d/file.md")).toBe(true)
        expect(tree.read("a/b/c/d/file.md")).toBe("content")
      })
    })

    describe("read() throws for non-existent file", () => {
      test("throws with ENOENT-like message", () => {
        expect(() => tree.read("nonexistent.md")).toThrow()
      })

      test("throws for missing nested file", () => {
        expect(() => tree.read("dir/nested/file.md")).toThrow()
      })
    })

    describe("close()", () => {
      test("prevents read operations", () => {
        tree.write("test.md", "content")
        tree.close()
        expect(() => tree.read("test.md")).toThrow("closed")
      })

      test("prevents write operations", () => {
        tree.close()
        expect(() => tree.write("test.md", "content")).toThrow("closed")
      })

      test("prevents exists operations", () => {
        tree.close()
        expect(() => tree.exists("test.md")).toThrow("closed")
      })

      test("prevents list operations", () => {
        tree.close()
        expect(() => tree.list()).toThrow("closed")
      })

      test("is idempotent", () => {
        tree.close()
        tree.close() // Should not throw
      })
    })

    describe("Symbol.dispose", () => {
      test("calls close", () => {
        tree.write("test.md", "content")
        tree[Symbol.dispose]()
        expect(() => tree.read("test.md")).toThrow("closed")
      })

      test("works with using syntax", () => {
        const localTree = createFileTree()
        {
          using _tree = localTree
          _tree.write("dispose-test.md", "content")
        }
        // After using block, tree should be closed
        expect(() => localTree.read("dispose-test.md")).toThrow("closed")
      })
    })
  })
}

// =============================================================================
// Run tests for each implementation
// =============================================================================

// In-memory implementation
testFileTree("createMemFileTree", () => createMemFileTree())

// Disk implementation with temp directory
let tempDir: string
testFileTree(
  "createDiskFileTree",
  () => {
    tempDir = mkdtempSync(join(tmpdir(), "km-filetree-test-"))
    return createDiskFileTree(tempDir)
  },
  () => {
    rmSync(tempDir, { recursive: true, force: true })
  },
)

// =============================================================================
// Implementation-specific tests
// =============================================================================

describe("createMemFileTree (specific)", () => {
  test("uses default root /mem when not specified", () => {
    const tree = createMemFileTree()
    expect(tree.root).toBe("/mem")
    tree.close()
  })

  test("uses custom root when specified", () => {
    const tree = createMemFileTree("/custom/root")
    expect(tree.root).toBe("/custom/root")
    tree.close()
  })

  test("watch() throws not supported error", () => {
    const tree = createMemFileTree()
    expect(() => tree.watch()).toThrow("not supported")
    tree.close()
  })

  test("normalizes paths with leading slashes", () => {
    const tree = createMemFileTree()
    tree.write("/leading/slash.md", "content")
    expect(tree.read("leading/slash.md")).toBe("content")
    tree.close()
  })

  test("normalizes paths with trailing slashes", () => {
    const tree = createMemFileTree()
    tree.write("trailing/slash.md/", "content")
    expect(tree.read("trailing/slash.md")).toBe("content")
    tree.close()
  })
})

describe("createDiskFileTree (specific)", () => {
  let tempDir: string
  let tree: FileTree

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "km-filetree-disk-test-"))
    tree = createDiskFileTree(tempDir)
  })

  afterEach(() => {
    tree.close()
    rmSync(tempDir, { recursive: true, force: true })
  })

  test("root matches provided directory", () => {
    expect(tree.root).toBe(tempDir)
  })

  test("watch() returns a watcher", () => {
    const watcher = tree.watch()
    expect(watcher).toBeTruthy()
    expect(typeof watcher.close).toBe("function")
    watcher.close()
  })

  test("files persist to disk", () => {
    tree.write("persist.md", "persisted content")
    tree.close()

    // Create new tree to verify file exists on disk
    const tree2 = createDiskFileTree(tempDir)
    expect(tree2.read("persist.md")).toBe("persisted content")
    tree2.close()
  })
})
