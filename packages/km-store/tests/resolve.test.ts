/**
 * resolveNode Tests
 *
 * Tests for the node resolution function that finds nodes by:
 * - ID (exact, prefix, suffix)
 * - Filesystem path (exact, relative, filename)
 * - Content match
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { join } from "path";
import { mkdirSync, rmSync, existsSync } from "fs";

import { closeDb, resolveNode, resetDb, applyEvent } from "../src/db.ts";
import { emitNodeCreated, setKmDir, setDatabase } from "@km/core";
import { ulid } from "ulid";

const TEST_DIR = join(import.meta.dir, ".test-resolve");

describe("resolveNode", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    setKmDir(TEST_DIR);
    setDatabase({ applyEvent });
    resetDb();
  });

  afterEach(() => {
    closeDb();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  test("resolves by exact ID", () => {
    const id = ulid();
    emitNodeCreated("test", { id, type: "task", content: "Test task" });

    const node = resolveNode(id);
    expect(node).not.toBeNull();
    expect(node?.id).toBe(id);
  });

  test("resolves by ID prefix", () => {
    const id = ulid();
    emitNodeCreated("test", { id, type: "task", content: "Test task" });

    const prefix = id.slice(0, 8);
    const node = resolveNode(prefix);
    expect(node).not.toBeNull();
    expect(node?.id).toBe(id);
  });

  test("resolves by ID suffix", () => {
    const id = ulid();
    emitNodeCreated("test", { id, type: "task", content: "Test task" });

    const suffix = id.slice(-8);
    const node = resolveNode(suffix);
    expect(node).not.toBeNull();
    expect(node?.id).toBe(id);
  });

  test("resolves by exact filesystem path", () => {
    const fsPath = join(TEST_DIR, "test.md");
    emitNodeCreated("test", { id: ulid(), type: "file", fs_path: fsPath });

    const node = resolveNode(fsPath);
    expect(node).not.toBeNull();
    expect(node?.fs_path).toBe(fsPath);
  });

  test("resolves by filename with extension", () => {
    const fsPath = join(TEST_DIR, "@inbox.md");
    emitNodeCreated("test", { id: ulid(), type: "file", fs_path: fsPath });

    const node = resolveNode("@inbox.md");
    expect(node).not.toBeNull();
    expect(node?.fs_path).toBe(fsPath);
  });

  test("resolves by filename without extension", () => {
    const fsPath = join(TEST_DIR, "@inbox.md");
    emitNodeCreated("test", { id: ulid(), type: "file", fs_path: fsPath });

    const node = resolveNode("@inbox");
    expect(node).not.toBeNull();
    expect(node?.fs_path).toBe(fsPath);
  });

  test("resolves by relative path ./file.md", () => {
    const fsPath = join(process.cwd(), "test-file.md");
    emitNodeCreated("test", { id: ulid(), type: "file", fs_path: fsPath });

    const node = resolveNode("./test-file.md");
    expect(node).not.toBeNull();
    expect(node?.fs_path).toBe(fsPath);
  });

  test("resolves by content match", () => {
    const id = ulid();
    emitNodeCreated("test", { id, type: "section", content: "My Section" });

    const node = resolveNode("My Section");
    expect(node).not.toBeNull();
    expect(node?.id).toBe(id);
  });

  test("filters by type when specified", () => {
    const taskId = ulid();
    const fileId = ulid();
    emitNodeCreated("test", { id: taskId, type: "task", content: "Test" });
    emitNodeCreated("test", {
      id: fileId,
      type: "file",
      fs_path: join(TEST_DIR, "Test.md"),
    });

    // Without type filter, could match either
    const anyNode = resolveNode("Test");
    expect(anyNode).not.toBeNull();

    // With type filter, only matches task
    const taskNode = resolveNode("Test", "task");
    expect(taskNode).not.toBeNull();
    expect(taskNode?.type).toBe("task");
  });

  test("returns null for non-existent node", () => {
    const node = resolveNode("nonexistent");
    expect(node).toBeNull();
  });
});
