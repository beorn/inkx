/**
 * Path Utilities Tests
 *
 * Tests for filesystem path resolution utilities:
 * - resolveFsPath: resolving paths to full info
 * - findKmRootFromPath: finding .km directory
 *
 * Uses isolated temp directories for parallelization.
 */

import { describe, test, expect, afterEach } from "vitest"
import { join } from "path"
import { mkdirSync, rmSync, writeFileSync, realpathSync } from "fs"
import { ulid } from "ulid"

import {
  resolveFsPath,
  findKmRootFromPath,
  getEffectiveRoot,
  resolvePathArg,
  toRelativeFsPath,
  toAbsoluteFsPath,
} from "../src/fs/path-utils.ts"

// Track created directories for cleanup
const createdDirs: string[] = []

afterEach(() => {
  for (const dir of createdDirs) {
    try {
      rmSync(dir, { recursive: true })
    } catch {
      // Ignore cleanup errors
    }
  }
  createdDirs.length = 0
})

/** Create an isolated test directory */
function createTestDir(): string {
  const dir = join("/tmp", `kmtest-path-${ulid()}`)
  mkdirSync(dir, { recursive: true })
  createdDirs.push(dir)
  // Return realpath for consistent comparison (e.g., /tmp -> /private/tmp on macOS)
  return realpathSync(dir)
}

describe("findKmRootFromPath", () => {
  test("finds .km directory in parent", () => {
    const testDir = createTestDir()
    mkdirSync(join(testDir, "repo/deep/nested"), { recursive: true })
    mkdirSync(join(testDir, "repo/.km"), { recursive: true })

    const result = findKmRootFromPath(join(testDir, "repo/deep"))
    expect(result).toBe(join(testDir, "repo/.km"))
  })

  test("finds .km directory from deeply nested path", () => {
    const testDir = createTestDir()
    mkdirSync(join(testDir, "repo/deep/nested"), { recursive: true })
    mkdirSync(join(testDir, "repo/.km"), { recursive: true })

    const result = findKmRootFromPath(join(testDir, "repo/deep/nested"))
    expect(result).toBe(join(testDir, "repo/.km"))
  })

  test("finds .km directory from file path", () => {
    const testDir = createTestDir()
    mkdirSync(join(testDir, "repo/deep/nested"), { recursive: true })
    mkdirSync(join(testDir, "repo/.km"), { recursive: true })
    writeFileSync(join(testDir, "repo/deep/nested/file.md"), "# Test")

    const result = findKmRootFromPath(join(testDir, "repo/deep/nested/file.md"))
    expect(result).toBe(join(testDir, "repo/.km"))
  })

  test("returns null when no .km directory exists", () => {
    const testDir = createTestDir()
    mkdirSync(join(testDir, "no-repo/folder"), { recursive: true })

    // Use stopAt to prevent walk from escaping test directory
    // (e.g., /private/tmp may have a stray .km directory)
    const result = findKmRootFromPath(join(testDir, "no-repo/folder"), testDir)
    expect(result).toBeNull()
  })
})

describe("resolveFsPath", () => {
  test("resolves existing file", () => {
    const testDir = createTestDir()
    mkdirSync(join(testDir, "repo/.km"), { recursive: true })
    writeFileSync(join(testDir, "repo/file.md"), "# Test")

    const result = resolveFsPath(join(testDir, "repo/file.md"))
    expect(result.exists).toBe(true)
    expect(result.isFile).toBe(true)
    expect(result.isDirectory).toBe(false)
    expect(result.kmRoot).toBe(join(testDir, "repo/.km"))
  })

  test("resolves existing directory", () => {
    const testDir = createTestDir()
    mkdirSync(join(testDir, "repo/.km"), { recursive: true })
    mkdirSync(join(testDir, "repo/folder"), { recursive: true })

    const result = resolveFsPath(join(testDir, "repo/folder"))
    expect(result.exists).toBe(true)
    expect(result.isFile).toBe(false)
    expect(result.isDirectory).toBe(true)
    expect(result.kmRoot).toBe(join(testDir, "repo/.km"))
  })

  test("handles non-existent path", () => {
    const testDir = createTestDir()
    mkdirSync(join(testDir, "repo/.km"), { recursive: true })

    const result = resolveFsPath(join(testDir, "repo/nonexistent.md"))
    expect(result.exists).toBe(false)
    expect(result.isFile).toBe(false)
    expect(result.isDirectory).toBe(false)
    // Should still find .km from parent
    expect(result.kmRoot).toBe(join(testDir, "repo/.km"))
  })

  test("returns null kmRoot when outside any repo", () => {
    const testDir = createTestDir()
    mkdirSync(join(testDir, "outside"), { recursive: true })

    // Use stopAt to prevent walk from escaping test directory
    const result = resolveFsPath(join(testDir, "outside"), testDir)
    expect(result.exists).toBe(true)
    expect(result.kmRoot).toBeNull()
  })
})

describe("getEffectiveRoot", () => {
  test("returns repo root when .km exists", () => {
    const testDir = createTestDir()
    mkdirSync(join(testDir, "repo/.km"), { recursive: true })
    writeFileSync(join(testDir, "repo/file.md"), "# Test")

    const resolution = resolveFsPath(join(testDir, "repo/file.md"))
    const root = getEffectiveRoot(resolution)
    expect(root).toBe(join(testDir, "repo"))
  })

  test("returns file parent for memory mode", () => {
    const testDir = createTestDir()
    mkdirSync(join(testDir, "no-repo"), { recursive: true })
    writeFileSync(join(testDir, "no-repo/file.md"), "# Test")

    // Use stopAt to prevent walk from escaping test directory
    const resolution = resolveFsPath(join(testDir, "no-repo/file.md"), testDir)
    const root = getEffectiveRoot(resolution)
    expect(root).toBe(join(testDir, "no-repo"))
  })

  test("returns directory itself for memory mode directory", () => {
    const testDir = createTestDir()
    mkdirSync(join(testDir, "no-repo"), { recursive: true })

    // Use stopAt to prevent walk from escaping test directory
    const resolution = resolveFsPath(join(testDir, "no-repo"), testDir)
    const root = getEffectiveRoot(resolution)
    expect(root).toBe(join(testDir, "no-repo"))
  })
})

describe("resolvePathArg", () => {
  test("no argument returns fallback root with null nodeRef", () => {
    const result = resolvePathArg(undefined, "/fallback")
    expect(result.repoRoot).toBe("/fallback")
    expect(result.nodeRef).toBeNull()
    expect(result.wasExplicitPath).toBe(false)
  })

  test("file path returns repo root and file as nodeRef", () => {
    const testDir = createTestDir()
    mkdirSync(join(testDir, "repo/.km"), { recursive: true })
    writeFileSync(join(testDir, "repo/inbox.md"), "# Inbox")

    const filePath = join(testDir, "repo/inbox.md")
    const result = resolvePathArg(filePath)
    expect(result.repoRoot).toBe(join(testDir, "repo"))
    expect(result.nodeRef).toBe(filePath)
    expect(result.wasExplicitPath).toBe(true)
  })

  test("directory inside repo returns repo root and directory as nodeRef", () => {
    const testDir = createTestDir()
    mkdirSync(join(testDir, "repo/.km"), { recursive: true })
    mkdirSync(join(testDir, "repo/Projects"), { recursive: true })

    const dirPath = join(testDir, "repo/Projects")
    const result = resolvePathArg(dirPath)
    expect(result.repoRoot).toBe(join(testDir, "repo"))
    expect(result.nodeRef).toBe(dirPath)
    expect(result.wasExplicitPath).toBe(true)
  })

  test("repo root directory returns itself with null nodeRef", () => {
    const testDir = createTestDir()
    mkdirSync(join(testDir, "repo/.km"), { recursive: true })

    const repoPath = join(testDir, "repo")
    const result = resolvePathArg(repoPath)
    expect(result.repoRoot).toBe(repoPath)
    expect(result.nodeRef).toBeNull()
    expect(result.wasExplicitPath).toBe(true)
  })

  test("directory outside any repo returns itself as root with null nodeRef", () => {
    const testDir = createTestDir()
    mkdirSync(join(testDir, "standalone"), { recursive: true })

    const dirPath = join(testDir, "standalone")
    // Use stopAt to prevent walk from escaping test directory
    const result = resolvePathArg(dirPath, undefined, testDir)
    expect(result.repoRoot).toBe(dirPath)
    expect(result.nodeRef).toBeNull()
    expect(result.wasExplicitPath).toBe(true)
  })

  test("non-path argument passes through as nodeRef", () => {
    const result = resolvePathArg("@next", "/fallback")
    expect(result.repoRoot).toBe("/fallback")
    expect(result.nodeRef).toBe("@next")
    expect(result.wasExplicitPath).toBe(false)
  })
})

// ============================================================================
// toRelativeFsPath / toAbsoluteFsPath — only test non-obvious behavior
// ============================================================================

describe("toRelativeFsPath", () => {
  test("returns '.' for repoRoot itself (not empty string)", () => {
    expect(toRelativeFsPath("/repo", "/repo")).toBe(".")
  })

  test("returns absolute path unchanged if outside repo (safety)", () => {
    expect(toRelativeFsPath("/repo", "/other/file.md")).toBe("/other/file.md")
  })
})

describe("toAbsoluteFsPath", () => {
  test("resolves '.' to repoRoot", () => {
    expect(toAbsoluteFsPath("/repo", ".")).toBe("/repo")
  })

  test("passes through already-absolute paths", () => {
    expect(toAbsoluteFsPath("/repo", "/already/absolute")).toBe("/already/absolute")
  })
})

describe("toRelativeFsPath / toAbsoluteFsPath round-trip", () => {
  test("round-trips root and nested paths", () => {
    const root = "/private/tmp/vt"
    expect(toAbsoluteFsPath(root, toRelativeFsPath(root, root))).toBe(root)
    const nested = "/private/tmp/vt/sub/file.md"
    expect(toAbsoluteFsPath(root, toRelativeFsPath(root, nested))).toBe(nested)
  })
})
