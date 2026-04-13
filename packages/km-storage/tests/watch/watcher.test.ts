/**
 * Watcher Tests
 *
 * Tests for watcher.ts - directory scanning and symlink detection.
 */

import { describe, test, expect } from "vitest"
import { mkdirSync, writeFileSync, symlinkSync } from "fs"
import { join } from "path"
import {
  scanDirectory,
  scanSymlinks,
  detectCaseSensitivity,
  normalizePath,
  detectCaseCollisions,
} from "../../src/watch/watcher.ts"
import { withTestEnvSync } from "@km/storage"

describe("scanDirectory", () => {
  test("scans files and directories", () =>
    withTestEnvSync(({ repoDir }) => {
      writeFileSync(join(repoDir, "file1.md"), "# File 1")
      writeFileSync(join(repoDir, "file2.md"), "# File 2")
      mkdirSync(join(repoDir, "subdir"))

      const entries = scanDirectory(repoDir)

      expect(entries).toHaveLength(3)
      expect(entries.map((e) => e.path)).toContain(join(repoDir, "file1.md"))
      expect(entries.map((e) => e.path)).toContain(join(repoDir, "file2.md"))
      expect(entries.map((e) => e.path)).toContain(join(repoDir, "subdir"))
    }))

  test("skips hidden files", () =>
    withTestEnvSync(({ repoDir }) => {
      writeFileSync(join(repoDir, "visible.md"), "# Visible")
      writeFileSync(join(repoDir, ".hidden"), "hidden content")
      mkdirSync(join(repoDir, ".hidden-dir"))

      const entries = scanDirectory(repoDir)

      expect(entries).toHaveLength(1)
      expect(entries[0]?.path).toBe(join(repoDir, "visible.md"))
    }))

  test("follows symlinks and marks them", () =>
    withTestEnvSync(({ repoDir }) => {
      writeFileSync(join(repoDir, "real-file.md"), "# Real file")
      mkdirSync(join(repoDir, "real-dir"))

      // Create symlink to file
      symlinkSync(join(repoDir, "real-file.md"), join(repoDir, "link-to-file.md"))

      // Create symlink to directory
      symlinkSync(join(repoDir, "real-dir"), join(repoDir, "link-to-dir"))

      // Create circular symlink (points to parent) — still included in flat scan
      symlinkSync(repoDir, join(repoDir, "circular-link"))

      const entries = scanDirectory(repoDir)

      // All entries included: 2 real + 3 symlinks
      expect(entries).toHaveLength(5)
      const paths = entries.map((e) => e.path)
      expect(paths).toContain(join(repoDir, "real-file.md"))
      expect(paths).toContain(join(repoDir, "real-dir"))
      expect(paths).toContain(join(repoDir, "link-to-file.md"))
      expect(paths).toContain(join(repoDir, "link-to-dir"))
      expect(paths).toContain(join(repoDir, "circular-link"))

      // Symlink entries are flagged
      const symlinkEntries = entries.filter((e) => e.isEmbed)
      expect(symlinkEntries).toHaveLength(3)
    }))

  test("returns empty array for nonexistent directory", () =>
    withTestEnvSync(({ repoDir }) => {
      const entries = scanDirectory(join(repoDir, "nonexistent"))
      expect(entries).toEqual([])
    }))
})

describe("scanSymlinks", () => {
  test("detects symlinks and their targets", () =>
    withTestEnvSync(({ repoDir }) => {
      writeFileSync(join(repoDir, "real-file.md"), "# Real file")
      symlinkSync(join(repoDir, "real-file.md"), join(repoDir, "link-to-file.md"))

      const symlinks = scanSymlinks(repoDir)

      expect(symlinks).toHaveLength(1)
      expect(symlinks[0]?.path).toBe(join(repoDir, "link-to-file.md"))
      expect(symlinks[0]?.target).toBe(join(repoDir, "real-file.md"))
    }))

  test("detects broken symlinks", () =>
    withTestEnvSync(({ repoDir }) => {
      // Create symlink to nonexistent target
      symlinkSync(join(repoDir, "nonexistent"), join(repoDir, "broken-link"))

      const symlinks = scanSymlinks(repoDir)

      expect(symlinks).toHaveLength(1)
      expect(symlinks[0]?.path).toBe(join(repoDir, "broken-link"))
      expect(symlinks[0]?.target).toBe(join(repoDir, "nonexistent"))
    }))

  test("detects circular symlinks", () =>
    withTestEnvSync(({ repoDir }) => {
      symlinkSync(repoDir, join(repoDir, "circular"))

      const symlinks = scanSymlinks(repoDir)

      expect(symlinks).toHaveLength(1)
      expect(symlinks[0]?.path).toBe(join(repoDir, "circular"))
      expect(symlinks[0]?.target).toBe(repoDir)
    }))

  test("scans recursively when enabled", () =>
    withTestEnvSync(({ repoDir }) => {
      mkdirSync(join(repoDir, "subdir"))
      writeFileSync(join(repoDir, "subdir", "file.md"), "# File")
      symlinkSync(join(repoDir, "subdir", "file.md"), join(repoDir, "subdir", "link.md"))

      // Non-recursive: should not find symlink in subdir
      const nonRecursive = scanSymlinks(repoDir, undefined, false)
      expect(nonRecursive).toHaveLength(0)

      // Recursive: should find symlink in subdir
      const recursive = scanSymlinks(repoDir, undefined, true)
      expect(recursive).toHaveLength(1)
      expect(recursive[0]?.path).toBe(join(repoDir, "subdir", "link.md"))
    }))

  test("skips hidden symlinks", () =>
    withTestEnvSync(({ repoDir }) => {
      symlinkSync(repoDir, join(repoDir, ".hidden-link"))
      symlinkSync(repoDir, join(repoDir, "visible-link"))

      const symlinks = scanSymlinks(repoDir)

      expect(symlinks).toHaveLength(1)
      expect(symlinks[0]?.path).toBe(join(repoDir, "visible-link"))
    }))

  test("returns empty array when no symlinks", () =>
    withTestEnvSync(({ repoDir }) => {
      writeFileSync(join(repoDir, "file.md"), "# File")
      mkdirSync(join(repoDir, "dir"))

      const symlinks = scanSymlinks(repoDir)

      expect(symlinks).toHaveLength(0)
    }))
})

describe("Case Sensitivity", () => {
  test("detectCaseSensitivity returns boolean", () =>
    withTestEnvSync(({ repoDir }) => {
      // This test is environment-dependent but should always return a boolean
      const result = detectCaseSensitivity(repoDir)
      expect(typeof result).toBe("boolean")
    }))

  test("normalizePath lowercases when case-insensitive", () => {
    expect(normalizePath("/Path/To/File.MD", false)).toBe("/path/to/file.md")
    expect(normalizePath("/path/to/file.md", false)).toBe("/path/to/file.md")
  })

  test("normalizePath preserves case when case-sensitive", () => {
    expect(normalizePath("/Path/To/File.MD", true)).toBe("/Path/To/File.MD")
    expect(normalizePath("/path/to/file.md", true)).toBe("/path/to/file.md")
  })

  test("detectCaseCollisions finds no collisions in normal case", () =>
    withTestEnvSync(({ repoDir }) => {
      writeFileSync(join(repoDir, "file1.md"), "# File 1")
      writeFileSync(join(repoDir, "file2.md"), "# File 2")

      const collisions = detectCaseCollisions(repoDir)

      expect(collisions).toHaveLength(0)
    }))

  // This test is only valid on case-sensitive filesystems (Linux)
  // On macOS/Windows, creating File.md and file.md will overwrite
  test("detectCaseCollisions finds collisions on case-sensitive fs", () =>
    withTestEnvSync(({ repoDir }) => {
      const isCaseSensitive = detectCaseSensitivity(repoDir)

      if (isCaseSensitive) {
        // Create files that differ only by case
        writeFileSync(join(repoDir, "File.md"), "# File")
        writeFileSync(join(repoDir, "file.md"), "# file")

        const collisions = detectCaseCollisions(repoDir)

        expect(collisions).toHaveLength(1)
        expect(collisions[0]?.paths).toHaveLength(2)
        expect(collisions[0]?.paths).toContain(join(repoDir, "File.md"))
        expect(collisions[0]?.paths).toContain(join(repoDir, "file.md"))
      } else {
        // On case-insensitive fs, we can't create case-colliding files
        // Just verify the function handles empty case
        const collisions = detectCaseCollisions(repoDir)
        expect(Array.isArray(collisions)).toBe(true)
      }
    }))

  test("detectCaseCollisions scans recursively when enabled", () =>
    withTestEnvSync(({ repoDir }) => {
      const isCaseSensitive = detectCaseSensitivity(repoDir)

      if (isCaseSensitive) {
        mkdirSync(join(repoDir, "subdir"))
        writeFileSync(join(repoDir, "subdir", "Test.md"), "# Test")
        writeFileSync(join(repoDir, "subdir", "test.md"), "# test")

        // Non-recursive: should not find collision in subdir
        const nonRecursive = detectCaseCollisions(repoDir, false)
        expect(nonRecursive).toHaveLength(0)

        // Recursive: should find collision in subdir
        const recursive = detectCaseCollisions(repoDir, true)
        expect(recursive).toHaveLength(1)
      }
    }))

  test("detectCaseCollisions skips hidden files", () =>
    withTestEnvSync(({ repoDir }) => {
      const isCaseSensitive = detectCaseSensitivity(repoDir)

      if (isCaseSensitive) {
        writeFileSync(join(repoDir, ".Hidden"), "hidden")
        writeFileSync(join(repoDir, ".hidden"), "hidden2")

        const collisions = detectCaseCollisions(repoDir)
        // Hidden files are skipped, so no collisions detected
        expect(collisions).toHaveLength(0)
      }
    }))
})
