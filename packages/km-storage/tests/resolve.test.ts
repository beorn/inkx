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

import { describe, test, expect } from "vitest"
import { join } from "path"
import { writeFileSync } from "fs"
import { ulid } from "ulid"

import { resolveNode } from "../src/db/db.ts"
import { withTestEnvSync } from "@km/storage"

describe("resolveNode", () => {
  test("resolves by exact ID", () =>
    withTestEnvSync(({ db, emitter }) => {
      const id = ulid()
      emitter.apply({
        type: "node_created",
        actor: "test",
        data: { id, type: "p", item: {}, content: "Test task" },
      })

      const node = resolveNode(db, id)
      expect(node).not.toBeNull()
      expect(node?.id).toBe(id)
    }))

  test("resolves by ID prefix", () =>
    withTestEnvSync(({ db, emitter }) => {
      const id = ulid()
      emitter.apply({
        type: "node_created",
        actor: "test",
        data: { id, type: "p", item: {}, content: "Test task" },
      })

      const prefix = id.slice(0, 8)
      const node = resolveNode(db, prefix)
      expect(node).not.toBeNull()
      expect(node?.id).toBe(id)
    }))

  test("resolves by ID suffix", () =>
    withTestEnvSync(({ db, emitter }) => {
      const id = ulid()
      emitter.apply({
        type: "node_created",
        actor: "test",
        data: { id, type: "p", item: {}, content: "Test task" },
      })

      const suffix = id.slice(-8)
      const node = resolveNode(db, suffix)
      expect(node).not.toBeNull()
      expect(node?.id).toBe(id)
    }))

  test("resolves by exact filesystem path", () =>
    withTestEnvSync(({ repoDir, db, emitter }) => {
      const fsPath = join(repoDir, "test.md")
      emitter.apply({
        type: "node_created",
        actor: "test",
        data: { id: ulid(), type: "h", item: {}, fstype: "mdfile", fs_path: fsPath },
      })

      const node = resolveNode(db, fsPath)
      expect(node).not.toBeNull()
      expect(node?.fs_path).toBe(fsPath)
    }))

  test("resolves by filename with extension", () =>
    withTestEnvSync(({ repoDir, db, emitter }) => {
      const fsPath = join(repoDir, "@next.md")
      emitter.apply({
        type: "node_created",
        actor: "test",
        data: { id: ulid(), type: "h", item: {}, fstype: "mdfile", fs_path: fsPath },
      })

      const node = resolveNode(db, "@next.md")
      expect(node).not.toBeNull()
      expect(node?.fs_path).toBe(fsPath)
    }))

  test("resolves by filename without extension", () =>
    withTestEnvSync(({ repoDir, db, emitter }) => {
      const fsPath = join(repoDir, "@next.md")
      emitter.apply({
        type: "node_created",
        actor: "test",
        data: { id: ulid(), type: "h", item: {}, fstype: "mdfile", fs_path: fsPath },
      })

      const node = resolveNode(db, "@next")
      expect(node).not.toBeNull()
      expect(node?.fs_path).toBe(fsPath)
    }))

  test("resolves by relative path ./file.md", () =>
    withTestEnvSync(({ db, emitter }) => {
      const fsPath = join(process.cwd(), "test-file.md")
      emitter.apply({
        type: "node_created",
        actor: "test",
        data: { id: ulid(), type: "h", item: {}, fstype: "mdfile", fs_path: fsPath },
      })

      const node = resolveNode(db, "./test-file.md")
      expect(node).not.toBeNull()
      expect(node?.fs_path).toBe(fsPath)
    }))

  test("resolves by content match", () =>
    withTestEnvSync(({ db, emitter }) => {
      const id = ulid()
      emitter.apply({
        type: "node_created",
        actor: "test",
        data: { id, type: "h", item: {}, content: "My Section" },
      })

      const node = resolveNode(db, "My Section")
      expect(node).not.toBeNull()
      expect(node?.id).toBe(id)
    }))

  test("filters by type when specified", () =>
    withTestEnvSync(({ repoDir, db, emitter }) => {
      const taskId = ulid()
      const fileId = ulid()
      emitter.apply({
        type: "node_created",
        actor: "test",
        data: { id: taskId, type: "p", item: {}, content: "Test" },
      })
      emitter.apply({
        type: "node_created",
        actor: "test",
        data: { id: fileId, type: "h", item: {}, fstype: "mdfile", fs_path: join(repoDir, "Test.md") },
      })

      // Without type filter, could match either
      const anyNode = resolveNode(db, "Test")
      expect(anyNode).not.toBeNull()

      // With type filter, only matches li
      const taskNode = resolveNode(db, "Test", "p")
      expect(taskNode).not.toBeNull()
      expect(taskNode?.type).toBe("p")
    }))

  test("returns null for non-existent node", () =>
    withTestEnvSync(({ db }) => {
      const node = resolveNode(db, "nonexistent")
      expect(node).toBeNull()
    }))

  // Additional resolution tests for various path formats
  test("resolves by relative path without ./ prefix (dir/file)", () =>
    withTestEnvSync(({ repoDir, db, emitter }) => {
      const fsPath = join(repoDir, "subdir/test.md")
      emitter.apply({
        type: "node_created",
        actor: "test",
        data: { id: ulid(), type: "h", item: {}, fstype: "mdfile", fs_path: fsPath },
      })

      const node = resolveNode(db, "subdir/test.md")
      expect(node).not.toBeNull()
      expect(node?.fs_path).toBe(fsPath)
    }))

  test("resolves by relative path without extension (dir/file)", () =>
    withTestEnvSync(({ repoDir, db, emitter }) => {
      const fsPath = join(repoDir, "projects/myproject.md")
      emitter.apply({
        type: "node_created",
        actor: "test",
        data: { id: ulid(), type: "h", item: {}, fstype: "mdfile", fs_path: fsPath },
      })

      // Note: resolveNode adds .md extension for paths
      const node = resolveNode(db, "projects/myproject")
      expect(node).not.toBeNull()
      expect(node?.fs_path).toBe(fsPath)
    }))

  test("resolves folder by name", () =>
    withTestEnvSync(({ repoDir, db, emitter }) => {
      const fsPath = join(repoDir, "inbox")
      emitter.apply({
        type: "node_created",
        actor: "test",
        data: { id: ulid(), type: "h", item: {}, fstype: "folder", fs_path: fsPath, name: "inbox" },
      })

      const node = resolveNode(db, "inbox")
      expect(node).not.toBeNull()
      expect(node?.fstype).toBe("folder")
      expect(node?.fs_path).toBe(fsPath)
    }))

  test("resolves folder by path with trailing slash", () =>
    withTestEnvSync(({ repoDir, db, emitter }) => {
      const fsPath = join(repoDir, "projects")
      emitter.apply({
        type: "node_created",
        actor: "test",
        data: { id: ulid(), type: "h", item: {}, fstype: "folder", fs_path: fsPath, name: "projects" },
      })

      // Trailing slash is normalized
      const node = resolveNode(db, "projects/")
      expect(node).not.toBeNull()
      expect(node?.fstype).toBe("folder")
      expect(node?.fs_path).toBe(fsPath)
    }))

  test("prefers folder over file when both match name", () =>
    withTestEnvSync(({ repoDir, db, emitter }) => {
      const folderPath = join(repoDir, "inbox")
      const filePath = join(repoDir, "inbox/inbox.md")
      emitter.apply({
        type: "node_created",
        actor: "test",
        data: {
          id: ulid(),
          type: "h",
          item: {},
          fstype: "folder",
          fs_path: folderPath,
          name: "inbox",
        },
      })
      emitter.apply({
        type: "node_created",
        actor: "test",
        data: {
          id: ulid(),
          type: "h",
          item: {},
          fstype: "mdfile",
          fs_path: filePath,
          name: "inbox.md",
        },
      })

      // Should prefer folder (parent) over file (child)
      const node = resolveNode(db, "inbox")
      expect(node).not.toBeNull()
      expect(node?.fstype).toBe("folder")
    }))

  test("resolves nested directory path", () =>
    withTestEnvSync(({ repoDir, db, emitter }) => {
      const fsPath = join(repoDir, "areas/work/projects")
      emitter.apply({
        type: "node_created",
        actor: "test",
        data: {
          id: ulid(),
          type: "h",
          item: {},
          fstype: "folder",
          fs_path: fsPath,
          name: "projects",
        },
      })

      const node = resolveNode(db, "areas/work/projects")
      expect(node).not.toBeNull()
      expect(node?.fs_path).toBe(fsPath)
    }))

  test("resolves explicit path through symlinks (macOS /tmp → /private/tmp)", () =>
    withTestEnvSync(({ repoDir, db, emitter }) => {
      // Create file on disk so realpathSync can resolve symlinks
      const filePath = join(repoDir, "test.md")
      writeFileSync(filePath, "# Test")

      // Store node with relative fs_path (as production code does)
      emitter.apply({
        type: "node_created",
        actor: "test",
        data: { id: ulid(), type: "h", item: {}, fstype: "mdfile", fs_path: "test.md" },
      })

      // repoDir is under /tmp which is a symlink to /private/tmp on macOS.
      // resolveExplicitPath uses realpathSync on the query but must also
      // resolve repoRoot to produce correct relative paths for DB lookup.
      const node = resolveNode(db, filePath, { repoRoot: repoDir })
      expect(node).not.toBeNull()
      expect(node?.fs_path).toBe("test.md")
    }))

  // ===========================================================================
  // Block-id resolution — regression for km-markdown.block-id-prod-sync
  // ===========================================================================
  //
  // `km show '^testid'` → resolveNode("^testid") → resolveBlockId(). The
  // resolver used to require a 5+ digit numeric string (Asana GID heuristic),
  // so non-numeric block-ids (^testid, ^apr15-ca-ftb) returned null even
  // though the DB stored them correctly. Fix: an explicit `^id` prefix is
  // an unambiguous block-id marker — match by exact stripped string.

  describe("block-id resolution", () => {
    /** Seed a row directly via SQL — the emitter path doesn't propagate
     *  block_id cleanly in this test harness. Direct insert keeps the test
     *  focused on the resolver, not the event apply pipeline. */
    function seedBlockIdNode(
      db: ReturnType<typeof withTestEnvSync> extends (fn: (env: infer E) => infer R) => unknown ? E : never,
      blockId: string,
      content: string,
    ) {
      const id = ulid()
      const now = Date.now()
      ;(db as { prepare: (sql: string) => { run: (...args: unknown[]) => void } })
        .prepare(
          `INSERT INTO nodes (id, type, fstype, parent_id, item, parent_idx, block_id, content, data, created_at, updated_at, version)
           VALUES (?, 'p', NULL, NULL, '{"list":"-"}', 0, ?, ?, '{}', ?, ?, '')`,
        )
        .run(id, blockId, content, now, now)
      return id
    }

    test("resolves non-numeric block id via ^prefix", () =>
      withTestEnvSync(({ db }) => {
        seedBlockIdNode(db as never, "testid", "task one")
        const node = resolveNode(db, "^testid")
        expect(node, "^testid should resolve even though 'testid' is not numeric").not.toBeNull()
        expect(node?.block_id).toBe("testid")
      }))

    test("resolves hyphenated block id via ^prefix", () =>
      withTestEnvSync(({ db }) => {
        seedBlockIdNode(db as never, "apr15-ca-ftb", "tax payment")
        const node = resolveNode(db, "^apr15-ca-ftb")
        expect(node).not.toBeNull()
        expect(node?.block_id).toBe("apr15-ca-ftb")
      }))

    test("resolves numeric block id with ^prefix (Asana GID back-compat)", () =>
      withTestEnvSync(({ db }) => {
        seedBlockIdNode(db as never, "123456789", "asana task")
        const node = resolveNode(db, "^123456789")
        expect(node).not.toBeNull()
        expect(node?.block_id).toBe("123456789")
      }))

    test("bare numeric string (no ^) still resolves — Asana GID fallback", () =>
      withTestEnvSync(({ db }) => {
        seedBlockIdNode(db as never, "987654321", "asana bare")
        const node = resolveNode(db, "987654321")
        expect(node).not.toBeNull()
        expect(node?.block_id).toBe("987654321")
      }))
  })
})
