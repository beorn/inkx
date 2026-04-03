/**
 * DB Event Application Tests
 *
 * Verifies that applyEventWithDb correctly updates the database for
 * task_status and date field changes WITHOUT directly writing to the
 * filesystem. Filesystem write-back is handled by FS decorators
 * (withFsWriter/withSync) that wrap emitter.apply().
 */

import { describe, test, expect } from "vitest"
import { Database } from "bun:sqlite"
import { writeFileSync, readFileSync, mkdirSync, rmSync } from "fs"
import { join } from "path"
import { ulid } from "ulid"
import { applyEventWithDb } from "../src/db-events.ts"
import { SCHEMA } from "../src/schema.ts"

// =============================================================================
// Helpers
// =============================================================================

function createTestDb(): Database {
  const db = new Database(":memory:")
  db.run(SCHEMA)
  return db
}

function createTmpDir(): string {
  const dir = join("/tmp", `kmtest-writeback-${ulid()}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

/** Insert a file node and a task node into the DB, returning their IDs */
function seedFileWithTask(
  db: Database,
  fsPath: string,
  taskLine: number,
  taskStatus: string = "todo",
): { fileId: string; taskId: string } {
  const fileId = ulid()
  const taskId = ulid()

  db.run(
    `INSERT INTO nodes (id, type, fstype, parent_id, item, parent_idx, fs_path, name, content, task_status, md_line, created_at, updated_at, version, data)
     VALUES (?, 'h', 'mdfile', '.', 1, 0, ?, 'test', '# Test', NULL, NULL, ?, ?, ?, '{}')`,
    [fileId, fsPath, Date.now(), Date.now(), ulid()],
  )

  const taskMarker = taskStatus === "done" ? "[x]" : "[ ]"
  db.run(
    `INSERT INTO nodes (id, type, fstype, parent_id, item, parent_idx, fs_path, name, content, task_status, task_marker, md_line, created_at, updated_at, version, data)
     VALUES (?, 'p', NULL, ?, 1, 0, NULL, NULL, 'Test task', ?, ?, ?, ?, ?, ?, '{}')`,
    [taskId, fileId, taskStatus, taskMarker, taskLine, Date.now(), Date.now(), ulid()],
  )

  return { fileId, taskId }
}

// =============================================================================
// DB-only: task_status updates the database correctly
// =============================================================================

describe("applyEventWithDb: task_status updates DB without FS writes", () => {
  test("node_updated with task_status updates DB", () => {
    const db = createTestDb()
    const { taskId } = seedFileWithTask(db, "/fake/tasks.md", 2, "todo")

    applyEventWithDb(db, {
      id: ulid(),
      type: "node_updated",
      actor: "user",
      target: taskId,
      ts: Date.now(),
      data: { task_status: "done" },
    })

    const row = db.query("SELECT task_status FROM nodes WHERE id = ?").get(taskId) as { task_status: string }
    expect(row.task_status).toBe("done")

    db.close()
  })

  test("node_updated with task_status does NOT write to filesystem", async () => {
    const dir = createTmpDir()
    const db = createTestDb()

    const filePath = join(dir, "tasks.md")
    const originalContent = "# Test\n\n- [ ] Test task\n"
    writeFileSync(filePath, originalContent)

    const { taskId } = seedFileWithTask(db, filePath, 2, "todo")

    applyEventWithDb(db, {
      id: ulid(),
      type: "node_updated",
      actor: "user",
      target: taskId,
      ts: Date.now(),
      data: { task_status: "done" },
    })

    // Wait to ensure no async writes land
    await Bun.sleep(100)

    // File should be UNCHANGED -- FS writes are handled by FS decorators, not db-events
    const content = readFileSync(filePath, "utf-8")
    expect(content).toBe(originalContent)

    db.close()
    rmSync(dir, { recursive: true })
  })
})

// =============================================================================
// DB-only: date field updates
// =============================================================================

describe("applyEventWithDb: date field updates DB without FS writes", () => {
  test("node_updated with due_at updates DB", () => {
    const db = createTestDb()
    const { taskId } = seedFileWithTask(db, "/fake/tasks.md", 2, "todo")

    applyEventWithDb(db, {
      id: ulid(),
      type: "node_updated",
      actor: "user",
      target: taskId,
      ts: Date.now(),
      data: { due_at: "2026-04-01" },
    })

    const row = db.query("SELECT due_at FROM nodes WHERE id = ?").get(taskId) as { due_at: string }
    expect(row.due_at).toBe("2026-04-01")

    db.close()
  })

  test("node_updated with due_at does NOT write to filesystem", async () => {
    const dir = createTmpDir()
    const db = createTestDb()

    const filePath = join(dir, "tasks.md")
    const originalContent = "# Test\n\n- [ ] Test task\n"
    writeFileSync(filePath, originalContent)

    const { taskId } = seedFileWithTask(db, filePath, 2, "todo")

    applyEventWithDb(db, {
      id: ulid(),
      type: "node_updated",
      actor: "user",
      target: taskId,
      ts: Date.now(),
      data: { due_at: "2026-04-01" },
    })

    // Wait to ensure no async writes land
    await Bun.sleep(100)

    // File should be UNCHANGED
    const content = readFileSync(filePath, "utf-8")
    expect(content).toBe(originalContent)

    db.close()
    rmSync(dir, { recursive: true })
  })
})

// =============================================================================
// Task lifecycle events update DB correctly
// =============================================================================

describe("applyEventWithDb: task lifecycle events", () => {
  test("task_claimed sets status to wip and assigns actor", () => {
    const db = createTestDb()
    const { taskId } = seedFileWithTask(db, "/fake/tasks.md", 2, "todo")

    applyEventWithDb(db, {
      id: ulid(),
      type: "task_claimed",
      actor: "agent-1",
      target: taskId,
      ts: Date.now(),
      data: {},
    })

    const row = db.query("SELECT task_status, assigned_to FROM nodes WHERE id = ?").get(taskId) as {
      task_status: string
      assigned_to: string
    }
    expect(row.task_status).toBe("wip")
    expect(row.assigned_to).toBe("agent-1")

    db.close()
  })

  test("task_released resets status to todo and clears assignee", () => {
    const db = createTestDb()
    const { taskId } = seedFileWithTask(db, "/fake/tasks.md", 2, "todo")

    // First claim it
    applyEventWithDb(db, {
      id: ulid(),
      type: "task_claimed",
      actor: "agent-1",
      target: taskId,
      ts: Date.now(),
      data: {},
    })

    // Then release it
    applyEventWithDb(db, {
      id: ulid(),
      type: "task_released",
      actor: "agent-1",
      target: taskId,
      ts: Date.now(),
      data: {},
    })

    const row = db.query("SELECT task_status, assigned_to FROM nodes WHERE id = ?").get(taskId) as {
      task_status: string
      assigned_to: string | null
    }
    expect(row.task_status).toBe("todo")
    expect(row.assigned_to).toBeNull()

    db.close()
  })

  test("task_completed sets status to done and marker to [x]", () => {
    const db = createTestDb()
    const { taskId } = seedFileWithTask(db, "/fake/tasks.md", 2, "todo")

    applyEventWithDb(db, {
      id: ulid(),
      type: "task_completed",
      actor: "agent-1",
      target: taskId,
      ts: Date.now(),
      data: {},
    })

    const row = db.query("SELECT task_status, task_marker FROM nodes WHERE id = ?").get(taskId) as {
      task_status: string
      task_marker: string
    }
    expect(row.task_status).toBe("done")
    expect(row.task_marker).toBe("[x]")

    db.close()
  })
})
