/**
 * Path Utilities Tests
 *
 * Tests for filesystem path resolution utilities:
 * - isExplicitPath: detecting filesystem paths
 * - resolveFsPath: resolving paths to full info
 * - findKmRootFromPath: finding .km directory
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { join } from "path";
import { mkdirSync, rmSync, existsSync, writeFileSync } from "fs";

import {
  isExplicitPath,
  resolveFsPath,
  findKmRootFromPath,
  getEffectiveRoot,
} from "../src/path-utils.ts";

// Use /tmp to avoid finding the actual .km directory in the codebase
const TEST_DIR = "/tmp/km-test-path-utils";

describe("isExplicitPath", () => {
  test("returns true for absolute paths", () => {
    expect(isExplicitPath("/usr/local/bin")).toBe(true);
    expect(isExplicitPath("/home/user/file.md")).toBe(true);
    expect(isExplicitPath("/")).toBe(true);
  });

  test("returns true for relative paths with ./", () => {
    expect(isExplicitPath("./file.md")).toBe(true);
    expect(isExplicitPath("./folder/file.md")).toBe(true);
  });

  test("returns true for parent paths with ../", () => {
    expect(isExplicitPath("../file.md")).toBe(true);
    expect(isExplicitPath("../../folder/file.md")).toBe(true);
  });

  // Note: ~ is expanded by the shell before reaching the program,
  // so we don't need to detect it as an explicit path
  test("returns false for tilde paths (shell handles expansion)", () => {
    expect(isExplicitPath("~/Documents")).toBe(false);
    expect(isExplicitPath("~/file.md")).toBe(false);
  });

  test("returns false for IDs and filenames", () => {
    expect(isExplicitPath("abc123")).toBe(false);
    expect(isExplicitPath("@inbox.md")).toBe(false);
    expect(isExplicitPath("@inbox")).toBe(false);
    expect(isExplicitPath("My Task")).toBe(false);
    expect(isExplicitPath("01ARZ3NDEKTSV4RRFFQ69G5FAV")).toBe(false);
  });
});

describe("findKmRootFromPath", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(join(TEST_DIR, "vault/deep/nested"), { recursive: true });
    mkdirSync(join(TEST_DIR, "vault/.km"), { recursive: true });
    mkdirSync(join(TEST_DIR, "no-vault/folder"), { recursive: true });
    writeFileSync(join(TEST_DIR, "vault/deep/nested/file.md"), "# Test");
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  test("finds .km directory in parent", () => {
    const result = findKmRootFromPath(join(TEST_DIR, "vault/deep"));
    expect(result).toBe(join(TEST_DIR, "vault/.km"));
  });

  test("finds .km directory from deeply nested path", () => {
    const result = findKmRootFromPath(join(TEST_DIR, "vault/deep/nested"));
    expect(result).toBe(join(TEST_DIR, "vault/.km"));
  });

  test("finds .km directory from file path", () => {
    const result = findKmRootFromPath(
      join(TEST_DIR, "vault/deep/nested/file.md"),
    );
    expect(result).toBe(join(TEST_DIR, "vault/.km"));
  });

  test("returns null when no .km directory exists", () => {
    const result = findKmRootFromPath(join(TEST_DIR, "no-vault/folder"));
    expect(result).toBeNull();
  });
});

describe("resolveFsPath", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(join(TEST_DIR, "vault/.km"), { recursive: true });
    mkdirSync(join(TEST_DIR, "vault/folder"), { recursive: true });
    writeFileSync(join(TEST_DIR, "vault/file.md"), "# Test");
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  test("resolves existing file", () => {
    const result = resolveFsPath(join(TEST_DIR, "vault/file.md"));
    expect(result.exists).toBe(true);
    expect(result.isFile).toBe(true);
    expect(result.isDirectory).toBe(false);
    expect(result.kmRoot).toBe(join(TEST_DIR, "vault/.km"));
  });

  test("resolves existing directory", () => {
    const result = resolveFsPath(join(TEST_DIR, "vault/folder"));
    expect(result.exists).toBe(true);
    expect(result.isFile).toBe(false);
    expect(result.isDirectory).toBe(true);
    expect(result.kmRoot).toBe(join(TEST_DIR, "vault/.km"));
  });

  test("handles non-existent path", () => {
    const result = resolveFsPath(join(TEST_DIR, "vault/nonexistent.md"));
    expect(result.exists).toBe(false);
    expect(result.isFile).toBe(false);
    expect(result.isDirectory).toBe(false);
    // Should still find .km from parent
    expect(result.kmRoot).toBe(join(TEST_DIR, "vault/.km"));
  });

  test("returns null kmRoot when outside any vault", () => {
    mkdirSync(join(TEST_DIR, "outside"), { recursive: true });
    const result = resolveFsPath(join(TEST_DIR, "outside"));
    expect(result.exists).toBe(true);
    expect(result.kmRoot).toBeNull();
  });
});

describe("getEffectiveRoot", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(join(TEST_DIR, "vault/.km"), { recursive: true });
    mkdirSync(join(TEST_DIR, "no-vault"), { recursive: true });
    writeFileSync(join(TEST_DIR, "vault/file.md"), "# Test");
    writeFileSync(join(TEST_DIR, "no-vault/file.md"), "# Test");
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  test("returns vault root when .km exists", () => {
    const resolution = resolveFsPath(join(TEST_DIR, "vault/file.md"));
    const root = getEffectiveRoot(resolution);
    expect(root).toBe(join(TEST_DIR, "vault"));
  });

  test("returns file parent for memory mode", () => {
    const resolution = resolveFsPath(join(TEST_DIR, "no-vault/file.md"));
    const root = getEffectiveRoot(resolution);
    expect(root).toBe(join(TEST_DIR, "no-vault"));
  });

  test("returns directory itself for memory mode directory", () => {
    const resolution = resolveFsPath(join(TEST_DIR, "no-vault"));
    const root = getEffectiveRoot(resolution);
    expect(root).toBe(join(TEST_DIR, "no-vault"));
  });
});
