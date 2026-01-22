/**
 * Watcher Tests
 *
 * Tests for watcher.ts - directory scanning and symlink detection.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  symlinkSync,
} from "fs";
import { join } from "path";
import {
  scanDirectory,
  scanSymlinks,
  detectCaseSensitivity,
  normalizePath,
  detectCaseCollisions,
} from "../../src/watch/watcher.ts";

const TEST_DIR = join("/tmp", "kmtest-watcher");

describe("scanDirectory", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  test("scans files and directories", () => {
    writeFileSync(join(TEST_DIR, "file1.md"), "# File 1");
    writeFileSync(join(TEST_DIR, "file2.md"), "# File 2");
    mkdirSync(join(TEST_DIR, "subdir"));

    const entries = scanDirectory(TEST_DIR);

    expect(entries).toHaveLength(3);
    expect(entries.map((e) => e.path)).toContain(join(TEST_DIR, "file1.md"));
    expect(entries.map((e) => e.path)).toContain(join(TEST_DIR, "file2.md"));
    expect(entries.map((e) => e.path)).toContain(join(TEST_DIR, "subdir"));
  });

  test("skips hidden files", () => {
    writeFileSync(join(TEST_DIR, "visible.md"), "# Visible");
    writeFileSync(join(TEST_DIR, ".hidden"), "hidden content");
    mkdirSync(join(TEST_DIR, ".hidden-dir"));

    const entries = scanDirectory(TEST_DIR);

    expect(entries).toHaveLength(1);
    expect(entries[0]?.path).toBe(join(TEST_DIR, "visible.md"));
  });

  test("skips symlinks to avoid circular references", () => {
    writeFileSync(join(TEST_DIR, "real-file.md"), "# Real file");
    mkdirSync(join(TEST_DIR, "real-dir"));

    // Create symlink to file
    symlinkSync(
      join(TEST_DIR, "real-file.md"),
      join(TEST_DIR, "link-to-file.md"),
    );

    // Create symlink to directory
    symlinkSync(join(TEST_DIR, "real-dir"), join(TEST_DIR, "link-to-dir"));

    // Create circular symlink (points to parent)
    symlinkSync(TEST_DIR, join(TEST_DIR, "circular-link"));

    const entries = scanDirectory(TEST_DIR);

    // Should only contain real file and real directory, not symlinks
    expect(entries).toHaveLength(2);
    const paths = entries.map((e) => e.path);
    expect(paths).toContain(join(TEST_DIR, "real-file.md"));
    expect(paths).toContain(join(TEST_DIR, "real-dir"));
    expect(paths).not.toContain(join(TEST_DIR, "link-to-file.md"));
    expect(paths).not.toContain(join(TEST_DIR, "link-to-dir"));
    expect(paths).not.toContain(join(TEST_DIR, "circular-link"));
  });

  test("returns empty array for nonexistent directory", () => {
    const entries = scanDirectory(join(TEST_DIR, "nonexistent"));
    expect(entries).toEqual([]);
  });
});

describe("scanSymlinks", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  test("detects symlinks and their targets", () => {
    writeFileSync(join(TEST_DIR, "real-file.md"), "# Real file");
    symlinkSync(
      join(TEST_DIR, "real-file.md"),
      join(TEST_DIR, "link-to-file.md"),
    );

    const symlinks = scanSymlinks(TEST_DIR);

    expect(symlinks).toHaveLength(1);
    expect(symlinks[0]?.path).toBe(join(TEST_DIR, "link-to-file.md"));
    expect(symlinks[0]?.target).toBe(join(TEST_DIR, "real-file.md"));
  });

  test("detects broken symlinks", () => {
    // Create symlink to nonexistent target
    symlinkSync(join(TEST_DIR, "nonexistent"), join(TEST_DIR, "broken-link"));

    const symlinks = scanSymlinks(TEST_DIR);

    expect(symlinks).toHaveLength(1);
    expect(symlinks[0]?.path).toBe(join(TEST_DIR, "broken-link"));
    expect(symlinks[0]?.target).toBe(join(TEST_DIR, "nonexistent"));
  });

  test("detects circular symlinks", () => {
    symlinkSync(TEST_DIR, join(TEST_DIR, "circular"));

    const symlinks = scanSymlinks(TEST_DIR);

    expect(symlinks).toHaveLength(1);
    expect(symlinks[0]?.path).toBe(join(TEST_DIR, "circular"));
    expect(symlinks[0]?.target).toBe(TEST_DIR);
  });

  test("scans recursively when enabled", () => {
    mkdirSync(join(TEST_DIR, "subdir"));
    writeFileSync(join(TEST_DIR, "subdir", "file.md"), "# File");
    symlinkSync(
      join(TEST_DIR, "subdir", "file.md"),
      join(TEST_DIR, "subdir", "link.md"),
    );

    // Non-recursive: should not find symlink in subdir
    const nonRecursive = scanSymlinks(TEST_DIR, undefined, false);
    expect(nonRecursive).toHaveLength(0);

    // Recursive: should find symlink in subdir
    const recursive = scanSymlinks(TEST_DIR, undefined, true);
    expect(recursive).toHaveLength(1);
    expect(recursive[0]?.path).toBe(join(TEST_DIR, "subdir", "link.md"));
  });

  test("skips hidden symlinks", () => {
    symlinkSync(TEST_DIR, join(TEST_DIR, ".hidden-link"));
    symlinkSync(TEST_DIR, join(TEST_DIR, "visible-link"));

    const symlinks = scanSymlinks(TEST_DIR);

    expect(symlinks).toHaveLength(1);
    expect(symlinks[0]?.path).toBe(join(TEST_DIR, "visible-link"));
  });

  test("returns empty array when no symlinks", () => {
    writeFileSync(join(TEST_DIR, "file.md"), "# File");
    mkdirSync(join(TEST_DIR, "dir"));

    const symlinks = scanSymlinks(TEST_DIR);

    expect(symlinks).toHaveLength(0);
  });
});

describe("Case Sensitivity", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  test("detectCaseSensitivity returns boolean", () => {
    // This test is environment-dependent but should always return a boolean
    const result = detectCaseSensitivity(TEST_DIR);
    expect(typeof result).toBe("boolean");
  });

  test("normalizePath lowercases when case-insensitive", () => {
    expect(normalizePath("/Path/To/File.MD", false)).toBe("/path/to/file.md");
    expect(normalizePath("/path/to/file.md", false)).toBe("/path/to/file.md");
  });

  test("normalizePath preserves case when case-sensitive", () => {
    expect(normalizePath("/Path/To/File.MD", true)).toBe("/Path/To/File.MD");
    expect(normalizePath("/path/to/file.md", true)).toBe("/path/to/file.md");
  });

  test("detectCaseCollisions finds no collisions in normal case", () => {
    writeFileSync(join(TEST_DIR, "file1.md"), "# File 1");
    writeFileSync(join(TEST_DIR, "file2.md"), "# File 2");

    const collisions = detectCaseCollisions(TEST_DIR);

    expect(collisions).toHaveLength(0);
  });

  // This test is only valid on case-sensitive filesystems (Linux)
  // On macOS/Windows, creating File.md and file.md will overwrite
  test("detectCaseCollisions finds collisions on case-sensitive fs", () => {
    const isCaseSensitive = detectCaseSensitivity(TEST_DIR);

    if (isCaseSensitive) {
      // Create files that differ only by case
      writeFileSync(join(TEST_DIR, "File.md"), "# File");
      writeFileSync(join(TEST_DIR, "file.md"), "# file");

      const collisions = detectCaseCollisions(TEST_DIR);

      expect(collisions).toHaveLength(1);
      expect(collisions[0]?.paths).toHaveLength(2);
      expect(collisions[0]?.paths).toContain(join(TEST_DIR, "File.md"));
      expect(collisions[0]?.paths).toContain(join(TEST_DIR, "file.md"));
    } else {
      // On case-insensitive fs, we can't create case-colliding files
      // Just verify the function handles empty case
      const collisions = detectCaseCollisions(TEST_DIR);
      expect(Array.isArray(collisions)).toBe(true);
    }
  });

  test("detectCaseCollisions scans recursively when enabled", () => {
    const isCaseSensitive = detectCaseSensitivity(TEST_DIR);

    if (isCaseSensitive) {
      mkdirSync(join(TEST_DIR, "subdir"));
      writeFileSync(join(TEST_DIR, "subdir", "Test.md"), "# Test");
      writeFileSync(join(TEST_DIR, "subdir", "test.md"), "# test");

      // Non-recursive: should not find collision in subdir
      const nonRecursive = detectCaseCollisions(TEST_DIR, false);
      expect(nonRecursive).toHaveLength(0);

      // Recursive: should find collision in subdir
      const recursive = detectCaseCollisions(TEST_DIR, true);
      expect(recursive).toHaveLength(1);
    }
  });

  test("detectCaseCollisions skips hidden files", () => {
    const isCaseSensitive = detectCaseSensitivity(TEST_DIR);

    if (isCaseSensitive) {
      writeFileSync(join(TEST_DIR, ".Hidden"), "hidden");
      writeFileSync(join(TEST_DIR, ".hidden"), "hidden2");

      const collisions = detectCaseCollisions(TEST_DIR);
      // Hidden files are skipped, so no collisions detected
      expect(collisions).toHaveLength(0);
    }
  });
});
