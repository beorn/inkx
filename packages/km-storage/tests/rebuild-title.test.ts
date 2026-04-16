/**
 * Tests for rebuild-from-WAL title derivation (km-storage.rebuild-different-titles)
 *
 * When state.db is deleted and rebuilt from changes.jsonl, stub nodes from a
 * prior discoverOnly session must be re-parsed so that H1-merged titles are
 * restored. Without the fix, stubs keep their filename-stem title (e.g., "TODO")
 * instead of the H1 heading title (e.g., "Project TODOs").
 */
import { test, expect, describe } from "vitest"
import { Database } from "bun:sqlite"
import { mkdtempSync, writeFileSync, mkdirSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { ulid } from "ulid"

import { SCHEMA } from "../src/db/schema.ts"
import { loadRepo, parseDeferredAsync } from "../src/repo/loader.ts"
import { getNodeDisplayName } from "@km/tree"

/** Helper: exhaust a loadRepo generator and return the result */
function runLoadRepo(...args: Parameters<typeof loadRepo>) {
  const gen = loadRepo(...args)
  let result = gen.next()
  while (!result.done) {
    result = gen.next()
  }
  return result.value
}

/** Helper: create a .km directory with changes.jsonl from given events */
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

  writeFileSync(join(kmDir, "changes.jsonl"), lines.join("\n") + "\n")
}

describe("rebuild from WAL preserves H1 titles", () => {
  test("memory mode full parse: title comes from H1 heading, not filename", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "km-rebuild-title-"))

    // File named TODO.md but with H1 "Project TODOs"
    writeFileSync(
      join(tmpDir, "TODO.md"),
      `# Project TODOs

## Backend

- [ ] Fix database migration
- [ ] Add API endpoint

## Frontend

- [ ] Update dashboard
`,
    )

    const db = new Database(":memory:")
    db.run(SCHEMA)

    const result = runLoadRepo(tmpDir, { db, mode: "memory" })
    expect(result.mode).toBe("memory")

    // Find the file node
    const fileRow = db.prepare("SELECT * FROM nodes WHERE fs_path = 'TODO.md'").get() as {
      id: string
      title: string | null
      content: string | null
      name: string | null
      data: string
    } | null
    expect(fileRow).toBeDefined()

    // In full parse mode, the H1 heading is merged into the file node
    expect(fileRow!.title).toBe("Project TODOs")
    expect(fileRow!.content).toBe("Project TODOs")
  })

  test("discoverOnly mode: stub has filename title, deferred parse restores H1", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "km-rebuild-title-"))

    writeFileSync(
      join(tmpDir, "TODO.md"),
      `# Project TODOs

## Backend

- [ ] Fix database migration
`,
    )

    const db = new Database(":memory:")
    db.run(SCHEMA)

    // Load with discoverOnly (stub mode)
    const result = runLoadRepo(tmpDir, { db, discoverOnly: true })
    expect(result.mode).toBe("memory")

    // Before deferred parsing: stub has filename-stem title
    const stubRow = db.prepare("SELECT title, name, parsed FROM nodes WHERE fs_path = 'TODO.md'").get() as {
      title: string | null
      name: string | null
      parsed: number
    } | null
    expect(stubRow).toBeDefined()
    expect(stubRow!.title).toBe("TODO") // filename stem
    expect(stubRow!.parsed).toBe(0)

    // Parse deferred files
    expect(result.deferredFiles).toBeDefined()
    expect(result.deferredFiles!.length).toBeGreaterThan(0)
    await parseDeferredAsync(db, result.deferredFiles!)

    // After deferred parsing: title should be the H1 heading
    const parsedRow = db.prepare("SELECT title, content, parsed FROM nodes WHERE fs_path = 'TODO.md'").get() as {
      title: string | null
      content: string | null
      parsed: number
    } | null
    expect(parsedRow).toBeDefined()
    expect(parsedRow!.title).toBe("Project TODOs")
    expect(parsedRow!.content).toBe("Project TODOs")
    expect(parsedRow!.parsed).toBe(1)
  })

  test("disk mode rebuild: stubs from changes.jsonl are re-queued for deferred parsing", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "km-rebuild-title-"))

    // Create the file with an H1 heading different from filename
    writeFileSync(
      join(tmpDir, "TODO.md"),
      `# Project TODOs

## Backend

- [ ] Fix database migration
`,
    )

    // Simulate a prior discoverOnly session: changes.jsonl has a stub node
    const stubNodeId = ulid()
    setupDiskMode(tmpDir, [
      {
        type: "node_created",
        data: {
          id: stubNodeId,
          type: "h",
          item: {},
          fstype: "mdfile",
          parent_id: ".",
          parent_idx: 0,
          fs_path: "TODO.md",
          name: "TODO",
          title: "TODO", // filename stem — not the H1
          data: { _stub: true },
        },
      },
    ])

    // Rebuild: load in disk mode (simulating state.db deletion + rebuild)
    const db = new Database(":memory:")
    db.run(SCHEMA)

    const result = runLoadRepo(tmpDir, { db })
    expect(result.mode).toBe("disk")

    // The stub should be in the DB with the filename-stem title
    const beforeRow = db.prepare("SELECT title, parsed FROM nodes WHERE id = ?").get(stubNodeId) as {
      title: string | null
      parsed: number
    } | null
    expect(beforeRow).toBeDefined()
    expect(beforeRow!.title).toBe("TODO")
    expect(beforeRow!.parsed).toBe(0)

    // The rebuild should have detected the unparsed stub and queued it
    expect(result.deferredFiles).toBeDefined()
    expect(result.deferredFiles!.length).toBeGreaterThan(0)

    // Find our stub in the deferred files
    const ourDeferred = result.deferredFiles!.find((f) => f.nodeId === stubNodeId)
    expect(ourDeferred).toBeDefined()

    // Parse deferred files
    await parseDeferredAsync(db, result.deferredFiles!)

    // After deferred parsing: title should be the H1 heading
    const afterRow = db.prepare("SELECT title, content, parsed FROM nodes WHERE fs_path = 'TODO.md'").get() as {
      title: string | null
      content: string | null
      parsed: number
    } | null
    expect(afterRow).toBeDefined()
    expect(afterRow!.title).toBe("Project TODOs")
    expect(afterRow!.content).toBe("Project TODOs")
    expect(afterRow!.parsed).toBe(1)
  })

  test("getNodeDisplayName returns H1 title after rebuild + deferred parse", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "km-rebuild-title-"))

    writeFileSync(
      join(tmpDir, "TODO.md"),
      `# Project TODOs

## Backend

- [ ] Fix database migration
`,
    )

    // Simulate stub in changes.jsonl
    const stubNodeId = ulid()
    setupDiskMode(tmpDir, [
      {
        type: "node_created",
        data: {
          id: stubNodeId,
          type: "h",
          item: {},
          fstype: "mdfile",
          parent_id: ".",
          parent_idx: 0,
          fs_path: "TODO.md",
          name: "TODO",
          title: "TODO",
          data: { _stub: true },
        },
      },
    ])

    const db = new Database(":memory:")
    db.run(SCHEMA)

    const result = runLoadRepo(tmpDir, { db })

    // Before parse: display name is filename stem
    const beforeNode = db.prepare("SELECT * FROM nodes WHERE id = ?").get(stubNodeId)
    expect(getNodeDisplayName(beforeNode as any)).toBe("TODO")

    // Parse deferred
    await parseDeferredAsync(db, result.deferredFiles!)

    // After parse: display name is H1 title
    const afterNode = db.prepare("SELECT * FROM nodes WHERE fs_path = 'TODO.md'").get()
    expect(getNodeDisplayName(afterNode as any)).toBe("Project TODOs")
  })
})
