/**
 * Tests for disk mode filesystem reconciliation (km-storage.disk-reconcile)
 *
 * When .km/ exists, loadRepo uses "disk mode" which reads events.jsonl.
 * After applying events, reconciliation scans the filesystem to detect:
 * - Files present on disk but missing from the DB (externally added)
 * - Files in the DB that no longer exist on disk (externally deleted)
 */
import { test, expect, describe } from "vitest"
import { Database } from "bun:sqlite"
import { mkdtempSync, writeFileSync, mkdirSync, existsSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { ulid } from "ulid"

import { SCHEMA } from "../src/db/schema.ts"
import { loadRepo } from "../src/repo/loader.ts"

/** Helper: exhaust a loadRepo generator and return the result */
function runLoadRepo(...args: Parameters<typeof loadRepo>) {
  const gen = loadRepo(...args)
  let result = gen.next()
  while (!result.done) {
    result = gen.next()
  }
  return result.value
}

/** Helper: create a .km directory with events.jsonl from given events */
function setupDiskMode(
  repoRoot: string,
  events: Array<{
    id?: string
    type: string
    actor?: string
    target?: string
    ts?: number
    data: Record<string, unknown>
  }>,
): void {
  const kmDir = join(repoRoot, ".km")
  mkdirSync(kmDir, { recursive: true })

  const lines = events.map((e) => {
    const event = {
      id: e.id ?? ulid(),
      type: e.type,
      actor: e.actor ?? "test",
      target: e.target,
      ts: e.ts ?? Date.now(),
      data: e.data,
    }
    return JSON.stringify(event)
  })

  writeFileSync(join(kmDir, "events.jsonl"), lines.join("\n") + "\n")
}

describe("disk mode filesystem reconciliation", () => {
  test("detects new .md file added externally", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "km-reconcile-"))

    // Set up disk mode with one existing file
    writeFileSync(join(tmpDir, "existing.md"), "# Existing\n\nSome content.")

    setupDiskMode(tmpDir, [
      {
        type: "node_created",
        data: {
          id: "existing.md",
          type: "h",
          item: {},
          fstype: "mdfile",
          parent_id: ".",
          parent_idx: 0,
          fs_path: "existing.md",
          name: "existing",
          title: "existing",
        },
      },
    ])

    // Now add a new file externally (not through events)
    writeFileSync(join(tmpDir, "new-file.md"), "# New File\n\nAdded externally.")

    const db = new Database(":memory:")
    db.run(SCHEMA)

    const result = runLoadRepo(tmpDir, { db })

    expect(result.mode).toBe("disk")

    // Both files should be in the DB
    const existing = db.prepare("SELECT id, fs_path, type FROM nodes WHERE fs_path = 'existing.md'").get() as {
      id: string
      fs_path: string
      type: string
    } | null
    expect(existing).toBeDefined()
    expect(existing?.type).toBe("h")

    const newFile = db.prepare("SELECT id, fs_path, type, name FROM nodes WHERE fs_path = 'new-file.md'").get() as {
      id: string
      fs_path: string
      type: string
      name: string
    } | null
    expect(newFile).toBeDefined()
    expect(newFile?.type).toBe("h")
    expect(newFile?.name).toBe("new-file")
  })

  test("detects new non-.md file added externally", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "km-reconcile-"))

    // Set up disk mode with empty events
    setupDiskMode(tmpDir, [])

    // Add a PDF file externally
    writeFileSync(join(tmpDir, "document.pdf"), "fake pdf content")

    const db = new Database(":memory:")
    db.run(SCHEMA)

    const result = runLoadRepo(tmpDir, { db })

    expect(result.mode).toBe("disk")

    const pdfNode = db.prepare("SELECT id, fs_path, type, content FROM nodes WHERE fs_path = 'document.pdf'").get() as {
      id: string
      fs_path: string
      type: string
      content: string
    } | null
    expect(pdfNode).toBeDefined()
    expect(pdfNode?.type).toBe("h")
    expect(pdfNode?.content).toBe("document.pdf")
  })

  test("detects new folder with files added externally", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "km-reconcile-"))

    // Set up disk mode with empty events
    setupDiskMode(tmpDir, [])

    // Add a folder with files externally
    mkdirSync(join(tmpDir, "notes"))
    writeFileSync(join(tmpDir, "notes", "idea.md"), "# Idea\n\nMy great idea.")

    const db = new Database(":memory:")
    db.run(SCHEMA)

    const result = runLoadRepo(tmpDir, { db })

    expect(result.mode).toBe("disk")

    // Folder should exist
    const folder = db.prepare("SELECT id, fs_path, type FROM nodes WHERE fs_path = 'notes'").get() as {
      id: string
      fs_path: string
      type: string
    } | null
    expect(folder).toBeDefined()
    expect(folder?.type).toBe("h")

    // File inside folder should exist with correct parent
    const file = db.prepare("SELECT id, fs_path, type, parent_id FROM nodes WHERE fs_path = 'notes/idea.md'").get() as {
      id: string
      fs_path: string
      type: string
      parent_id: string
    } | null
    expect(file).toBeDefined()
    expect(file?.type).toBe("h")
    expect(file?.parent_id).toBe(folder?.id)
  })

  test("detects file deleted externally", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "km-reconcile-"))

    // Set up disk mode with a file that will be "deleted"
    // (event says it exists, but the file is NOT on disk)
    setupDiskMode(tmpDir, [
      {
        type: "node_created",
        data: {
          id: "deleted.md",
          type: "h",
          item: {},
          fstype: "mdfile",
          parent_id: ".",
          parent_idx: 0,
          fs_path: "deleted.md",
          name: "deleted",
          title: "deleted",
        },
      },
    ])

    // Note: we do NOT create "deleted.md" on disk

    const db = new Database(":memory:")
    db.run(SCHEMA)

    const result = runLoadRepo(tmpDir, { db })

    expect(result.mode).toBe("disk")

    // The node should have been deleted from the DB
    const deletedNode = db.prepare("SELECT id FROM nodes WHERE fs_path = 'deleted.md'").get()
    expect(deletedNode).toBeNull()
  })

  test("does not create nodes for hidden files", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "km-reconcile-"))

    // Set up disk mode with empty events
    setupDiskMode(tmpDir, [])

    // Add hidden files
    writeFileSync(join(tmpDir, ".hidden-file"), "hidden content")
    writeFileSync(join(tmpDir, "visible.md"), "# Visible\n\nContent.")

    const db = new Database(":memory:")
    db.run(SCHEMA)

    runLoadRepo(tmpDir, { db })

    // Hidden file should NOT be in DB
    const hiddenNode = db.prepare("SELECT id FROM nodes WHERE fs_path = '.hidden-file'").get()
    expect(hiddenNode).toBeNull()

    // Visible file should be in DB
    const visibleNode = db.prepare("SELECT id FROM nodes WHERE fs_path = 'visible.md'").get()
    expect(visibleNode).toBeDefined()
  })

  test("does not create nodes for ignored files", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "km-reconcile-"))

    // Set up disk mode with empty events
    setupDiskMode(tmpDir, [])

    // Add node_modules (should be ignored by default patterns)
    mkdirSync(join(tmpDir, "node_modules"))
    writeFileSync(join(tmpDir, "node_modules", "package.json"), "{}")

    // Add a normal file
    writeFileSync(join(tmpDir, "readme.md"), "# Readme")

    const db = new Database(":memory:")
    db.run(SCHEMA)

    runLoadRepo(tmpDir, { db })

    // node_modules should NOT be in DB
    const nmNode = db.prepare("SELECT id FROM nodes WHERE fs_path LIKE 'node_modules%'").get()
    expect(nmNode).toBeNull()

    // Normal file should be in DB
    const readmeNode = db.prepare("SELECT id FROM nodes WHERE fs_path = 'readme.md'").get()
    expect(readmeNode).toBeDefined()
  })

  test("preserves existing event-based nodes that still exist on disk", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "km-reconcile-"))

    // Create a file that matches the event
    writeFileSync(join(tmpDir, "existing.md"), "# Existing\n\nContent.")

    setupDiskMode(tmpDir, [
      {
        type: "node_created",
        data: {
          id: "existing.md",
          type: "h",
          item: {},
          fstype: "mdfile",
          parent_id: ".",
          parent_idx: 0,
          fs_path: "existing.md",
          name: "existing",
          title: "existing",
          content: "Original content from event",
        },
      },
    ])

    const db = new Database(":memory:")
    db.run(SCHEMA)

    runLoadRepo(tmpDir, { db })

    // The existing node should still have its original content (from events, not overwritten)
    const node = db.prepare("SELECT id, content FROM nodes WHERE fs_path = 'existing.md'").get() as {
      id: string
      content: string
    } | null
    expect(node).toBeDefined()
    expect(node?.content).toBe("Original content from event")
  })

  test("reconciliation does not run in memory mode", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "km-reconcile-"))

    // No .km directory = memory mode
    writeFileSync(join(tmpDir, "file.md"), "# File\n\nContent.")

    const db = new Database(":memory:")
    db.run(SCHEMA)

    const result = runLoadRepo(tmpDir, { db })

    expect(result.mode).toBe("memory")
    // File should be discovered via normal memory mode discovery
    const node = db.prepare("SELECT id FROM nodes WHERE fs_path = 'file.md'").get()
    expect(node).toBeDefined()
  })

  test("handles mix of new, existing, and deleted files", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "km-reconcile-"))

    // File that exists both in events AND on disk
    writeFileSync(join(tmpDir, "kept.md"), "# Kept\n\nStays.")

    // File only in events (deleted from disk)
    // We do NOT create "removed.md" on disk

    // File only on disk (added externally)
    writeFileSync(join(tmpDir, "added.md"), "# Added\n\nNew file.")

    setupDiskMode(tmpDir, [
      {
        type: "node_created",
        data: {
          id: "kept.md",
          type: "h",
          item: {},
          fstype: "mdfile",
          parent_id: ".",
          fs_path: "kept.md",
          name: "kept",
        },
      },
      {
        type: "node_created",
        data: {
          id: "removed.md",
          type: "h",
          item: {},
          fstype: "mdfile",
          parent_id: ".",
          fs_path: "removed.md",
          name: "removed",
        },
      },
    ])

    const db = new Database(":memory:")
    db.run(SCHEMA)

    runLoadRepo(tmpDir, { db })

    // Kept file should exist
    const kept = db.prepare("SELECT id FROM nodes WHERE fs_path = 'kept.md'").get()
    expect(kept).toBeDefined()

    // Removed file should NOT exist
    const removed = db.prepare("SELECT id FROM nodes WHERE fs_path = 'removed.md'").get()
    expect(removed).toBeNull()

    // Added file should exist
    const added = db.prepare("SELECT id FROM nodes WHERE fs_path = 'added.md'").get()
    expect(added).toBeDefined()
  })
})
