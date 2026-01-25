/**
 * Path Utilities Tests
 *
 * Tests for filesystem path resolution utilities:
 * - isExplicitPath: detecting filesystem paths
 * - resolveFsPath: resolving paths to full info
 * - findKmRootFromPath: finding .km directory
 *
 * Uses isolated temp directories for parallelization.
 */

import { describe, test, expect, afterEach } from "bun:test"
import { join } from "path"
import { mkdirSync, rmSync, writeFileSync } from "fs"
import { ulid } from "ulid"

import {
  isExplicitPath,
  resolveFsPath,
  findKmRootFromPath,
  getEffectiveRoot,
  resolvePathArg,
} from "../src/path-utils.ts"

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
  return dir
}

// Pure function tests - no filesystem needed
describe("isExplicitPath", () => {
  test("returns true for absolute paths", () => {
    expect(isExplicitPath("/usr/local/bin")).toBe(true)
    expect(isExplicitPath("/home/user/file.md")).toBe(true)
    expect(isExplicitPath("/")).toBe(true)
  })

  test("returns true for relative paths with ./", () => {
    expect(isExplicitPath("./file.md")).toBe(true)
    expect(isExplicitPath("./folder/file.md")).toBe(true)
  })

  test("returns true for parent paths with ../", () => {
    expect(isExplicitPath("../file.md")).toBe(true)
    expect(isExplicitPath("../../folder/file.md")).toBe(true)
  })

  // Note: ~ is expanded by the shell before reaching the program,
  // so we don't need to detect it as an explicit path
  test("returns false for tilde paths (shell handles expansion)", () => {
    expect(isExplicitPath("~/Documents")).toBe(false)
    expect(isExplicitPath("~/file.md")).toBe(false)
  })

  test("returns false for IDs and filenames", () => {
    expect(isExplicitPath("abc123")).toBe(false)
    expect(isExplicitPath("@inbox.md")).toBe(false)
    expect(isExplicitPath("@inbox")).toBe(false)
    expect(isExplicitPath("My Task")).toBe(false)
    expect(isExplicitPath("01ARZ3NDEKTSV4RRFFQ69G5FAV")).toBe(false)
  })
})

describe("findKmRootFromPath", () => {
  test("finds .km directory in parent", () => {
    const testDir = createTestDir()
    mkdirSync(join(testDir, "vault/deep/nested"), { recursive: true })
    mkdirSync(join(testDir, "vault/.km"), { recursive: true })

    const result = findKmRootFromPath(join(testDir, "vault/deep"))
    expect(result).toBe(join(testDir, "vault/.km"))
  })

  test("finds .km directory from deeply nested path", () => {
    const testDir = createTestDir()
    mkdirSync(join(testDir, "vault/deep/nested"), { recursive: true })
    mkdirSync(join(testDir, "vault/.km"), { recursive: true })

    const result = findKmRootFromPath(join(testDir, "vault/deep/nested"))
    expect(result).toBe(join(testDir, "vault/.km"))
  })

  test("finds .km directory from file path", () => {
    const testDir = createTestDir()
    mkdirSync(join(testDir, "vault/deep/nested"), { recursive: true })
    mkdirSync(join(testDir, "vault/.km"), { recursive: true })
    writeFileSync(join(testDir, "vault/deep/nested/file.md"), "# Test")

    const result = findKmRootFromPath(
      join(testDir, "vault/deep/nested/file.md"),
    )
    expect(result).toBe(join(testDir, "vault/.km"))
  })

  test("returns null when no .km directory exists", () => {
    const testDir = createTestDir()
    mkdirSync(join(testDir, "no-vault/folder"), { recursive: true })

    const result = findKmRootFromPath(join(testDir, "no-vault/folder"))
    expect(result).toBeNull()
  })
})

describe("resolveFsPath", () => {
  test("resolves existing file", () => {
    const testDir = createTestDir()
    mkdirSync(join(testDir, "vault/.km"), { recursive: true })
    writeFileSync(join(testDir, "vault/file.md"), "# Test")

    const result = resolveFsPath(join(testDir, "vault/file.md"))
    expect(result.exists).toBe(true)
    expect(result.isFile).toBe(true)
    expect(result.isDirectory).toBe(false)
    expect(result.kmRoot).toBe(join(testDir, "vault/.km"))
  })

  test("resolves existing directory", () => {
    const testDir = createTestDir()
    mkdirSync(join(testDir, "vault/.km"), { recursive: true })
    mkdirSync(join(testDir, "vault/folder"), { recursive: true })

    const result = resolveFsPath(join(testDir, "vault/folder"))
    expect(result.exists).toBe(true)
    expect(result.isFile).toBe(false)
    expect(result.isDirectory).toBe(true)
    expect(result.kmRoot).toBe(join(testDir, "vault/.km"))
  })

  test("handles non-existent path", () => {
    const testDir = createTestDir()
    mkdirSync(join(testDir, "vault/.km"), { recursive: true })

    const result = resolveFsPath(join(testDir, "vault/nonexistent.md"))
    expect(result.exists).toBe(false)
    expect(result.isFile).toBe(false)
    expect(result.isDirectory).toBe(false)
    // Should still find .km from parent
    expect(result.kmRoot).toBe(join(testDir, "vault/.km"))
  })

  test("returns null kmRoot when outside any vault", () => {
    const testDir = createTestDir()
    mkdirSync(join(testDir, "outside"), { recursive: true })

    const result = resolveFsPath(join(testDir, "outside"))
    expect(result.exists).toBe(true)
    expect(result.kmRoot).toBeNull()
  })
})

describe("getEffectiveRoot", () => {
  test("returns vault root when .km exists", () => {
    const testDir = createTestDir()
    mkdirSync(join(testDir, "vault/.km"), { recursive: true })
    writeFileSync(join(testDir, "vault/file.md"), "# Test")

    const resolution = resolveFsPath(join(testDir, "vault/file.md"))
    const root = getEffectiveRoot(resolution)
    expect(root).toBe(join(testDir, "vault"))
  })

  test("returns file parent for memory mode", () => {
    const testDir = createTestDir()
    mkdirSync(join(testDir, "no-vault"), { recursive: true })
    writeFileSync(join(testDir, "no-vault/file.md"), "# Test")

    const resolution = resolveFsPath(join(testDir, "no-vault/file.md"))
    const root = getEffectiveRoot(resolution)
    expect(root).toBe(join(testDir, "no-vault"))
  })

  test("returns directory itself for memory mode directory", () => {
    const testDir = createTestDir()
    mkdirSync(join(testDir, "no-vault"), { recursive: true })

    const resolution = resolveFsPath(join(testDir, "no-vault"))
    const root = getEffectiveRoot(resolution)
    expect(root).toBe(join(testDir, "no-vault"))
  })
})

describe("resolvePathArg", () => {
  test("no argument returns fallback root with null nodeRef", () => {
    const result = resolvePathArg(undefined, "/fallback")
    expect(result.vaultRoot).toBe("/fallback")
    expect(result.nodeRef).toBeNull()
    expect(result.wasExplicitPath).toBe(false)
  })

  test("file path returns vault root and file as nodeRef", () => {
    const testDir = createTestDir()
    mkdirSync(join(testDir, "vault/.km"), { recursive: true })
    writeFileSync(join(testDir, "vault/inbox.md"), "# Inbox")

    const filePath = join(testDir, "vault/inbox.md")
    const result = resolvePathArg(filePath)
    expect(result.vaultRoot).toBe(join(testDir, "vault"))
    expect(result.nodeRef).toBe(filePath)
    expect(result.wasExplicitPath).toBe(true)
  })

  test("directory inside vault returns vault root and directory as nodeRef", () => {
    const testDir = createTestDir()
    mkdirSync(join(testDir, "vault/.km"), { recursive: true })
    mkdirSync(join(testDir, "vault/Projects"), { recursive: true })

    const dirPath = join(testDir, "vault/Projects")
    const result = resolvePathArg(dirPath)
    expect(result.vaultRoot).toBe(join(testDir, "vault"))
    expect(result.nodeRef).toBe(dirPath)
    expect(result.wasExplicitPath).toBe(true)
  })

  test("vault root directory returns itself with null nodeRef", () => {
    const testDir = createTestDir()
    mkdirSync(join(testDir, "vault/.km"), { recursive: true })

    const vaultPath = join(testDir, "vault")
    const result = resolvePathArg(vaultPath)
    expect(result.vaultRoot).toBe(vaultPath)
    expect(result.nodeRef).toBeNull()
    expect(result.wasExplicitPath).toBe(true)
  })

  test("directory outside any vault returns itself as root with null nodeRef", () => {
    const testDir = createTestDir()
    mkdirSync(join(testDir, "standalone"), { recursive: true })

    const dirPath = join(testDir, "standalone")
    const result = resolvePathArg(dirPath)
    expect(result.vaultRoot).toBe(dirPath)
    expect(result.nodeRef).toBeNull()
    expect(result.wasExplicitPath).toBe(true)
  })

  test("non-path argument passes through as nodeRef", () => {
    const result = resolvePathArg("@inbox", "/fallback")
    expect(result.vaultRoot).toBe("/fallback")
    expect(result.nodeRef).toBe("@inbox")
    expect(result.wasExplicitPath).toBe(false)
  })
})
