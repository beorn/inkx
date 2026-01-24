/**
 * resolveNode Tests
 *
 * Tests for the node resolution function that finds nodes by:
 * - ID (exact, prefix, suffix)
 * - Filesystem path (exact, relative, filename)
 * - Content match
 *
 * Uses isolated temp directories for parallel test execution.
 */

import { describe, test, expect } from "bun:test";
import { join } from "path";
import { ulid } from "ulid";

import { resolveNode, applyEvent } from "../src/db.ts";
import { emitNodeCreated, setDatabase } from "../src/emit.ts";
import { withTestEnvSync } from "./test-utils.ts";

describe("resolveNode", () => {
  test("resolves by exact ID", () =>
    withTestEnvSync(({ vaultDir }) => {
      setDatabase({ applyEvent });

      const id = ulid();
      emitNodeCreated("test", { id, type: "task", content: "Test task" });

      const node = resolveNode(id);
      expect(node).not.toBeNull();
      expect(node?.id).toBe(id);
    }));

  test("resolves by ID prefix", () =>
    withTestEnvSync(() => {
      setDatabase({ applyEvent });

      const id = ulid();
      emitNodeCreated("test", { id, type: "task", content: "Test task" });

      const prefix = id.slice(0, 8);
      const node = resolveNode(prefix);
      expect(node).not.toBeNull();
      expect(node?.id).toBe(id);
    }));

  test("resolves by ID suffix", () =>
    withTestEnvSync(() => {
      setDatabase({ applyEvent });

      const id = ulid();
      emitNodeCreated("test", { id, type: "task", content: "Test task" });

      const suffix = id.slice(-8);
      const node = resolveNode(suffix);
      expect(node).not.toBeNull();
      expect(node?.id).toBe(id);
    }));

  test("resolves by exact filesystem path", () =>
    withTestEnvSync(({ vaultDir }) => {
      setDatabase({ applyEvent });

      const fsPath = join(vaultDir, "test.md");
      emitNodeCreated("test", { id: ulid(), type: "file", fs_path: fsPath });

      const node = resolveNode(fsPath);
      expect(node).not.toBeNull();
      expect(node?.fs_path).toBe(fsPath);
    }));

  test("resolves by filename with extension", () =>
    withTestEnvSync(({ vaultDir }) => {
      setDatabase({ applyEvent });

      const fsPath = join(vaultDir, "@inbox.md");
      emitNodeCreated("test", { id: ulid(), type: "file", fs_path: fsPath });

      const node = resolveNode("@inbox.md");
      expect(node).not.toBeNull();
      expect(node?.fs_path).toBe(fsPath);
    }));

  test("resolves by filename without extension", () =>
    withTestEnvSync(({ vaultDir }) => {
      setDatabase({ applyEvent });

      const fsPath = join(vaultDir, "@inbox.md");
      emitNodeCreated("test", { id: ulid(), type: "file", fs_path: fsPath });

      const node = resolveNode("@inbox");
      expect(node).not.toBeNull();
      expect(node?.fs_path).toBe(fsPath);
    }));

  test("resolves by relative path ./file.md", () =>
    withTestEnvSync(() => {
      setDatabase({ applyEvent });

      const fsPath = join(process.cwd(), "test-file.md");
      emitNodeCreated("test", { id: ulid(), type: "file", fs_path: fsPath });

      const node = resolveNode("./test-file.md");
      expect(node).not.toBeNull();
      expect(node?.fs_path).toBe(fsPath);
    }));

  test("resolves by content match", () =>
    withTestEnvSync(() => {
      setDatabase({ applyEvent });

      const id = ulid();
      emitNodeCreated("test", { id, type: "section", content: "My Section" });

      const node = resolveNode("My Section");
      expect(node).not.toBeNull();
      expect(node?.id).toBe(id);
    }));

  test("filters by type when specified", () =>
    withTestEnvSync(({ vaultDir }) => {
      setDatabase({ applyEvent });

      const taskId = ulid();
      const fileId = ulid();
      emitNodeCreated("test", { id: taskId, type: "task", content: "Test" });
      emitNodeCreated("test", {
        id: fileId,
        type: "file",
        fs_path: join(vaultDir, "Test.md"),
      });

      // Without type filter, could match either
      const anyNode = resolveNode("Test");
      expect(anyNode).not.toBeNull();

      // With type filter, only matches task
      const taskNode = resolveNode("Test", "task");
      expect(taskNode).not.toBeNull();
      expect(taskNode?.type).toBe("task");
    }));

  test("returns null for non-existent node", () =>
    withTestEnvSync(() => {
      setDatabase({ applyEvent });

      const node = resolveNode("nonexistent");
      expect(node).toBeNull();
    }));
});
