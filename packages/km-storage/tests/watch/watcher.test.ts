/**
 * Watcher Tests
 *
 * Tests for watcher.ts - directory scanning and symlink detection.
 */

import { describe, test, expect } from "bun:test";
import { mkdirSync, writeFileSync, symlinkSync } from "fs";
import { join } from "path";
import {
  scanDirectory,
  scanSymlinks,
  detectCaseSensitivity,
  normalizePath,
  detectCaseCollisions,
} from "../../src/watch/watcher.ts";
import { withTestEnvSync } from "@km/storage";

describe("scanDirectory", () => {
  test("scans files and directories", () =>
    withTestEnvSync(({ vaultDir }) => {
      writeFileSync(join(vaultDir, "file1.md"), "# File 1");
      writeFileSync(join(vaultDir, "file2.md"), "# File 2");
      mkdirSync(join(vaultDir, "subdir"));

      const entries = scanDirectory(vaultDir);

      expect(entries).toHaveLength(3);
      expect(entries.map((e) => e.path)).toContain(join(vaultDir, "file1.md"));
      expect(entries.map((e) => e.path)).toContain(join(vaultDir, "file2.md"));
      expect(entries.map((e) => e.path)).toContain(join(vaultDir, "subdir"));
    }));

  test("skips hidden files", () =>
    withTestEnvSync(({ vaultDir }) => {
      writeFileSync(join(vaultDir, "visible.md"), "# Visible");
      writeFileSync(join(vaultDir, ".hidden"), "hidden content");
      mkdirSync(join(vaultDir, ".hidden-dir"));

      const entries = scanDirectory(vaultDir);

      expect(entries).toHaveLength(1);
      expect(entries[0]?.path).toBe(join(vaultDir, "visible.md"));
    }));

  test("skips symlinks to avoid circular references", () =>
    withTestEnvSync(({ vaultDir }) => {
      writeFileSync(join(vaultDir, "real-file.md"), "# Real file");
      mkdirSync(join(vaultDir, "real-dir"));

      // Create symlink to file
      symlinkSync(
        join(vaultDir, "real-file.md"),
        join(vaultDir, "link-to-file.md"),
      );

      // Create symlink to directory
      symlinkSync(join(vaultDir, "real-dir"), join(vaultDir, "link-to-dir"));

      // Create circular symlink (points to parent)
      symlinkSync(vaultDir, join(vaultDir, "circular-link"));

      const entries = scanDirectory(vaultDir);

      // Should only contain real file and real directory, not symlinks
      expect(entries).toHaveLength(2);
      const paths = entries.map((e) => e.path);
      expect(paths).toContain(join(vaultDir, "real-file.md"));
      expect(paths).toContain(join(vaultDir, "real-dir"));
      expect(paths).not.toContain(join(vaultDir, "link-to-file.md"));
      expect(paths).not.toContain(join(vaultDir, "link-to-dir"));
      expect(paths).not.toContain(join(vaultDir, "circular-link"));
    }));

  test("returns empty array for nonexistent directory", () =>
    withTestEnvSync(({ vaultDir }) => {
      const entries = scanDirectory(join(vaultDir, "nonexistent"));
      expect(entries).toEqual([]);
    }));
});

describe("scanSymlinks", () => {
  test("detects symlinks and their targets", () =>
    withTestEnvSync(({ vaultDir }) => {
      writeFileSync(join(vaultDir, "real-file.md"), "# Real file");
      symlinkSync(
        join(vaultDir, "real-file.md"),
        join(vaultDir, "link-to-file.md"),
      );

      const symlinks = scanSymlinks(vaultDir);

      expect(symlinks).toHaveLength(1);
      expect(symlinks[0]?.path).toBe(join(vaultDir, "link-to-file.md"));
      expect(symlinks[0]?.target).toBe(join(vaultDir, "real-file.md"));
    }));

  test("detects broken symlinks", () =>
    withTestEnvSync(({ vaultDir }) => {
      // Create symlink to nonexistent target
      symlinkSync(join(vaultDir, "nonexistent"), join(vaultDir, "broken-link"));

      const symlinks = scanSymlinks(vaultDir);

      expect(symlinks).toHaveLength(1);
      expect(symlinks[0]?.path).toBe(join(vaultDir, "broken-link"));
      expect(symlinks[0]?.target).toBe(join(vaultDir, "nonexistent"));
    }));

  test("detects circular symlinks", () =>
    withTestEnvSync(({ vaultDir }) => {
      symlinkSync(vaultDir, join(vaultDir, "circular"));

      const symlinks = scanSymlinks(vaultDir);

      expect(symlinks).toHaveLength(1);
      expect(symlinks[0]?.path).toBe(join(vaultDir, "circular"));
      expect(symlinks[0]?.target).toBe(vaultDir);
    }));

  test("scans recursively when enabled", () =>
    withTestEnvSync(({ vaultDir }) => {
      mkdirSync(join(vaultDir, "subdir"));
      writeFileSync(join(vaultDir, "subdir", "file.md"), "# File");
      symlinkSync(
        join(vaultDir, "subdir", "file.md"),
        join(vaultDir, "subdir", "link.md"),
      );

      // Non-recursive: should not find symlink in subdir
      const nonRecursive = scanSymlinks(vaultDir, undefined, false);
      expect(nonRecursive).toHaveLength(0);

      // Recursive: should find symlink in subdir
      const recursive = scanSymlinks(vaultDir, undefined, true);
      expect(recursive).toHaveLength(1);
      expect(recursive[0]?.path).toBe(join(vaultDir, "subdir", "link.md"));
    }));

  test("skips hidden symlinks", () =>
    withTestEnvSync(({ vaultDir }) => {
      symlinkSync(vaultDir, join(vaultDir, ".hidden-link"));
      symlinkSync(vaultDir, join(vaultDir, "visible-link"));

      const symlinks = scanSymlinks(vaultDir);

      expect(symlinks).toHaveLength(1);
      expect(symlinks[0]?.path).toBe(join(vaultDir, "visible-link"));
    }));

  test("returns empty array when no symlinks", () =>
    withTestEnvSync(({ vaultDir }) => {
      writeFileSync(join(vaultDir, "file.md"), "# File");
      mkdirSync(join(vaultDir, "dir"));

      const symlinks = scanSymlinks(vaultDir);

      expect(symlinks).toHaveLength(0);
    }));
});

describe("Case Sensitivity", () => {
  test("detectCaseSensitivity returns boolean", () =>
    withTestEnvSync(({ vaultDir }) => {
      // This test is environment-dependent but should always return a boolean
      const result = detectCaseSensitivity(vaultDir);
      expect(typeof result).toBe("boolean");
    }));

  test("normalizePath lowercases when case-insensitive", () => {
    expect(normalizePath("/Path/To/File.MD", false)).toBe("/path/to/file.md");
    expect(normalizePath("/path/to/file.md", false)).toBe("/path/to/file.md");
  });

  test("normalizePath preserves case when case-sensitive", () => {
    expect(normalizePath("/Path/To/File.MD", true)).toBe("/Path/To/File.MD");
    expect(normalizePath("/path/to/file.md", true)).toBe("/path/to/file.md");
  });

  test("detectCaseCollisions finds no collisions in normal case", () =>
    withTestEnvSync(({ vaultDir }) => {
      writeFileSync(join(vaultDir, "file1.md"), "# File 1");
      writeFileSync(join(vaultDir, "file2.md"), "# File 2");

      const collisions = detectCaseCollisions(vaultDir);

      expect(collisions).toHaveLength(0);
    }));

  // This test is only valid on case-sensitive filesystems (Linux)
  // On macOS/Windows, creating File.md and file.md will overwrite
  test("detectCaseCollisions finds collisions on case-sensitive fs", () =>
    withTestEnvSync(({ vaultDir }) => {
      const isCaseSensitive = detectCaseSensitivity(vaultDir);

      if (isCaseSensitive) {
        // Create files that differ only by case
        writeFileSync(join(vaultDir, "File.md"), "# File");
        writeFileSync(join(vaultDir, "file.md"), "# file");

        const collisions = detectCaseCollisions(vaultDir);

        expect(collisions).toHaveLength(1);
        expect(collisions[0]?.paths).toHaveLength(2);
        expect(collisions[0]?.paths).toContain(join(vaultDir, "File.md"));
        expect(collisions[0]?.paths).toContain(join(vaultDir, "file.md"));
      } else {
        // On case-insensitive fs, we can't create case-colliding files
        // Just verify the function handles empty case
        const collisions = detectCaseCollisions(vaultDir);
        expect(Array.isArray(collisions)).toBe(true);
      }
    }));

  test("detectCaseCollisions scans recursively when enabled", () =>
    withTestEnvSync(({ vaultDir }) => {
      const isCaseSensitive = detectCaseSensitivity(vaultDir);

      if (isCaseSensitive) {
        mkdirSync(join(vaultDir, "subdir"));
        writeFileSync(join(vaultDir, "subdir", "Test.md"), "# Test");
        writeFileSync(join(vaultDir, "subdir", "test.md"), "# test");

        // Non-recursive: should not find collision in subdir
        const nonRecursive = detectCaseCollisions(vaultDir, false);
        expect(nonRecursive).toHaveLength(0);

        // Recursive: should find collision in subdir
        const recursive = detectCaseCollisions(vaultDir, true);
        expect(recursive).toHaveLength(1);
      }
    }));

  test("detectCaseCollisions skips hidden files", () =>
    withTestEnvSync(({ vaultDir }) => {
      const isCaseSensitive = detectCaseSensitivity(vaultDir);

      if (isCaseSensitive) {
        writeFileSync(join(vaultDir, ".Hidden"), "hidden");
        writeFileSync(join(vaultDir, ".hidden"), "hidden2");

        const collisions = detectCaseCollisions(vaultDir);
        // Hidden files are skipped, so no collisions detected
        expect(collisions).toHaveLength(0);
      }
    }));
});
