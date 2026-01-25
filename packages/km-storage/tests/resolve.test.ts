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

import { describe, test, expect } from "bun:test"
import { join } from "path"
import { ulid } from "ulid"

import { getDb, resolveNode } from "../src/db.ts"
import { emitNodeCreated } from "../src/emit.ts"
import { withTestEnvSync } from "@km/storage"

describe("resolveNode", () => {
  test("resolves by exact ID", () =>
    withTestEnvSync(({ vaultDir }) => {
      const id = ulid()
      emitNodeCreated("test", { id, type: "task", content: "Test task" })

      const node = resolveNode(getDb(), id)
      expect(node).not.toBeNull()
      expect(node?.id).toBe(id)
    }))

  test("resolves by ID prefix", () =>
    withTestEnvSync(() => {
      const id = ulid()
      emitNodeCreated("test", { id, type: "task", content: "Test task" })

      const prefix = id.slice(0, 8)
      const node = resolveNode(getDb(), prefix)
      expect(node).not.toBeNull()
      expect(node?.id).toBe(id)
    }))

  test("resolves by ID suffix", () =>
    withTestEnvSync(() => {
      const id = ulid()
      emitNodeCreated("test", { id, type: "task", content: "Test task" })

      const suffix = id.slice(-8)
      const node = resolveNode(getDb(), suffix)
      expect(node).not.toBeNull()
      expect(node?.id).toBe(id)
    }))

  test("resolves by exact filesystem path", () =>
    withTestEnvSync(({ vaultDir }) => {
      const fsPath = join(vaultDir, "test.md")
      emitNodeCreated("test", { id: ulid(), type: "file", fs_path: fsPath })

      const node = resolveNode(getDb(), fsPath)
      expect(node).not.toBeNull()
      expect(node?.fs_path).toBe(fsPath)
    }))

  test("resolves by filename with extension", () =>
    withTestEnvSync(({ vaultDir }) => {
      const fsPath = join(vaultDir, "@inbox.md")
      emitNodeCreated("test", { id: ulid(), type: "file", fs_path: fsPath })

      const node = resolveNode(getDb(), "@inbox.md")
      expect(node).not.toBeNull()
      expect(node?.fs_path).toBe(fsPath)
    }))

  test("resolves by filename without extension", () =>
    withTestEnvSync(({ vaultDir }) => {
      const fsPath = join(vaultDir, "@inbox.md")
      emitNodeCreated("test", { id: ulid(), type: "file", fs_path: fsPath })

      const node = resolveNode(getDb(), "@inbox")
      expect(node).not.toBeNull()
      expect(node?.fs_path).toBe(fsPath)
    }))

  test("resolves by relative path ./file.md", () =>
    withTestEnvSync(() => {
      const fsPath = join(process.cwd(), "test-file.md")
      emitNodeCreated("test", { id: ulid(), type: "file", fs_path: fsPath })

      const node = resolveNode(getDb(), "./test-file.md")
      expect(node).not.toBeNull()
      expect(node?.fs_path).toBe(fsPath)
    }))

  test("resolves by content match", () =>
    withTestEnvSync(() => {
      const id = ulid()
      emitNodeCreated("test", { id, type: "section", content: "My Section" })

      const node = resolveNode(getDb(), "My Section")
      expect(node).not.toBeNull()
      expect(node?.id).toBe(id)
    }))

  test("filters by type when specified", () =>
    withTestEnvSync(({ vaultDir }) => {
      const taskId = ulid()
      const fileId = ulid()
      emitNodeCreated("test", { id: taskId, type: "task", content: "Test" })
      emitNodeCreated("test", {
        id: fileId,
        type: "file",
        fs_path: join(vaultDir, "Test.md"),
      })

      // Without type filter, could match either
      const anyNode = resolveNode(getDb(), "Test")
      expect(anyNode).not.toBeNull()

      // With type filter, only matches task
      const taskNode = resolveNode(getDb(), "Test", "task")
      expect(taskNode).not.toBeNull()
      expect(taskNode?.type).toBe("task")
    }))

  test("returns null for non-existent node", () =>
    withTestEnvSync(() => {
      const node = resolveNode(getDb(), "nonexistent")
      expect(node).toBeNull()
    }))
})
