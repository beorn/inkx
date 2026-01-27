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

import { resolveNode } from "../src/db.ts"
import { emitNodeCreated } from "../src/emit.ts"
import { withTestEnvSync } from "@km/storage"

describe("resolveNode", () => {
  test("resolves by exact ID", () =>
    withTestEnvSync(({ db }) => {
      const id = ulid()
      emitNodeCreated("test", { id, type: "task", content: "Test task" })

      const node = resolveNode(db, id)
      expect(node).not.toBeNull()
      expect(node?.id).toBe(id)
    }))

  test("resolves by ID prefix", () =>
    withTestEnvSync(({ db }) => {
      const id = ulid()
      emitNodeCreated("test", { id, type: "task", content: "Test task" })

      const prefix = id.slice(0, 8)
      const node = resolveNode(db, prefix)
      expect(node).not.toBeNull()
      expect(node?.id).toBe(id)
    }))

  test("resolves by ID suffix", () =>
    withTestEnvSync(({ db }) => {
      const id = ulid()
      emitNodeCreated("test", { id, type: "task", content: "Test task" })

      const suffix = id.slice(-8)
      const node = resolveNode(db, suffix)
      expect(node).not.toBeNull()
      expect(node?.id).toBe(id)
    }))

  test("resolves by exact filesystem path", () =>
    withTestEnvSync(({ repoDir, db }) => {
      const fsPath = join(repoDir, "test.md")
      emitNodeCreated("test", { id: ulid(), type: "file", fs_path: fsPath })

      const node = resolveNode(db, fsPath)
      expect(node).not.toBeNull()
      expect(node?.fs_path).toBe(fsPath)
    }))

  test("resolves by filename with extension", () =>
    withTestEnvSync(({ repoDir, db }) => {
      const fsPath = join(repoDir, "@inbox.md")
      emitNodeCreated("test", { id: ulid(), type: "file", fs_path: fsPath })

      const node = resolveNode(db, "@inbox.md")
      expect(node).not.toBeNull()
      expect(node?.fs_path).toBe(fsPath)
    }))

  test("resolves by filename without extension", () =>
    withTestEnvSync(({ repoDir, db }) => {
      const fsPath = join(repoDir, "@inbox.md")
      emitNodeCreated("test", { id: ulid(), type: "file", fs_path: fsPath })

      const node = resolveNode(db, "@inbox")
      expect(node).not.toBeNull()
      expect(node?.fs_path).toBe(fsPath)
    }))

  test("resolves by relative path ./file.md", () =>
    withTestEnvSync(({ db }) => {
      const fsPath = join(process.cwd(), "test-file.md")
      emitNodeCreated("test", { id: ulid(), type: "file", fs_path: fsPath })

      const node = resolveNode(db, "./test-file.md")
      expect(node).not.toBeNull()
      expect(node?.fs_path).toBe(fsPath)
    }))

  test("resolves by content match", () =>
    withTestEnvSync(({ db }) => {
      const id = ulid()
      emitNodeCreated("test", { id, type: "section", content: "My Section" })

      const node = resolveNode(db, "My Section")
      expect(node).not.toBeNull()
      expect(node?.id).toBe(id)
    }))

  test("filters by type when specified", () =>
    withTestEnvSync(({ repoDir, db }) => {
      const taskId = ulid()
      const fileId = ulid()
      emitNodeCreated("test", { id: taskId, type: "task", content: "Test" })
      emitNodeCreated("test", {
        id: fileId,
        type: "file",
        fs_path: join(repoDir, "Test.md"),
      })

      // Without type filter, could match either
      const anyNode = resolveNode(db, "Test")
      expect(anyNode).not.toBeNull()

      // With type filter, only matches task
      const taskNode = resolveNode(db, "Test", "task")
      expect(taskNode).not.toBeNull()
      expect(taskNode?.type).toBe("task")
    }))

  test("returns null for non-existent node", () =>
    withTestEnvSync(({ db }) => {
      const node = resolveNode(db, "nonexistent")
      expect(node).toBeNull()
    }))
})
