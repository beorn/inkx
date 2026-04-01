/**
 * CLI Commands Unit Tests (km-d9f)
 *
 * Unit tests for CLI command handlers: actions, list, search, tree
 * These test the command logic directly rather than through the CLI.
 */

import { describe, test, expect } from "vitest"

import { getNode, getTasksByStatus, withTestEnv } from "@km/storage"
import type { KNode, TaskStatus } from "@km/core"
import type { Database } from "bun:sqlite"

/**
 * Helper to create a task directly in the database
 */
function createTask(db: Database, content: string, options: Partial<KNode> & { task_status?: TaskStatus } = {}): KNode {
  const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const now = Date.now()

  const { task_status, ...rest } = options
  const status = task_status ?? "todo"
  const marker = status === "done" ? "[x]" : status === "wip" ? "[/]" : status === "dropped" ? "[-]" : "[ ]"

  const node: KNode = {
    id,
    type: "p",
    item: { list: "-", task: { marker, status } },
    content,
    created_at: now,
    updated_at: now,
    ...rest,
  } as KNode

  db.prepare(
    `INSERT INTO nodes (id, type, list_marker, task_marker, content, task_status, priority, due_at, assigned_to, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    node.id,
    node.type,
    (node as KNode).item?.list ?? "-",
    (node as KNode).item?.task?.marker ?? "[ ]",
    node.content ?? null,
    node.item?.task?.status ?? "todo",
    node.priority ?? null,
    node.due_at ?? null,
    node.assigned_to ?? null,
    node.created_at,
    node.updated_at,
  )

  return node
}

describe.sequential("Task Status Filtering", () => {
  test("should filter by single status", async () => {
    await withTestEnv(async ({ db }) => {
      createTask(db, "Open task", { task_status: "todo" })
      createTask(db, "Done task", { task_status: "done" })
      createTask(db, "In progress", { task_status: "wip" })

      const openTasks = getTasksByStatus(db, ["todo"])
      expect(openTasks.length).toBe(1)
      expect(openTasks[0]!.content).toBe("Open task")

      const doneTasks = getTasksByStatus(db, ["done"])
      expect(doneTasks.length).toBe(1)
      expect(doneTasks[0]!.content).toBe("Done task")
    })
  })

  test("should filter by multiple statuses", async () => {
    await withTestEnv(async ({ db }) => {
      createTask(db, "Open task", { task_status: "todo" })
      createTask(db, "Done task", { task_status: "done" })
      createTask(db, "In progress", { task_status: "wip" })

      const tasks = getTasksByStatus(db, ["todo", "wip"])
      expect(tasks.length).toBe(2)
      expect(tasks.map((t) => t.content)).toContain("Open task")
      expect(tasks.map((t) => t.content)).toContain("In progress")
    })
  })

  test("should return empty for no matches", async () => {
    await withTestEnv(async ({ db }) => {
      createTask(db, "Open task", { task_status: "todo" })

      const blockedTasks = getTasksByStatus(db, ["blocked"])
      expect(blockedTasks.length).toBe(0)
    })
  })
})

describe.sequential("Task Priority Sorting", () => {
  test("should sort by priority ascending", async () => {
    await withTestEnv(async ({ db }) => {
      createTask(db, "Low priority", { priority: "P5" })
      createTask(db, "High priority", { priority: "P1" })
      createTask(db, "Medium priority", { priority: "P3" })

      const tasks = getTasksByStatus(db, ["todo"])
      tasks.sort((a, b) => (a.priority ?? "ZZ").localeCompare(b.priority ?? "ZZ"))

      expect(tasks[0]!.content).toBe("High priority")
      expect(tasks[1]!.content).toBe("Medium priority")
      expect(tasks[2]!.content).toBe("Low priority")
    })
  })

  test("should handle null priorities", async () => {
    await withTestEnv(async ({ db }) => {
      createTask(db, "No priority")
      createTask(db, "Has priority", { priority: "P2" })

      const tasks = getTasksByStatus(db, ["todo"])
      tasks.sort((a, b) => (a.priority ?? "ZZ").localeCompare(b.priority ?? "ZZ"))

      expect(tasks[0]!.content).toBe("Has priority")
      expect(tasks[1]!.content).toBe("No priority")
    })
  })
})

describe.sequential("Task Due Date Sorting", () => {
  test("should sort by due date ascending", async () => {
    await withTestEnv(async ({ db }) => {
      createTask(db, "Due tomorrow", { due_at: "2026-01-10" })
      createTask(db, "Due today", { due_at: "2026-01-09" })
      createTask(db, "Due next week", { due_at: "2026-01-16" })

      const tasks = getTasksByStatus(db, ["todo"])
      tasks.sort((a, b) => {
        if (!a.due_at && !b.due_at) return 0
        if (!a.due_at) return 1
        if (!b.due_at) return -1
        return a.due_at.localeCompare(b.due_at)
      })

      expect(tasks[0]!.content).toBe("Due today")
      expect(tasks[1]!.content).toBe("Due tomorrow")
      expect(tasks[2]!.content).toBe("Due next week")
    })
  })

  test("should put tasks without due date last", async () => {
    await withTestEnv(async ({ db }) => {
      createTask(db, "No due date")
      createTask(db, "Has due date", { due_at: "2026-01-15" })

      const tasks = getTasksByStatus(db, ["todo"])
      tasks.sort((a, b) => {
        if (!a.due_at && !b.due_at) return 0
        if (!a.due_at) return 1
        if (!b.due_at) return -1
        return a.due_at.localeCompare(b.due_at)
      })

      expect(tasks[0]!.content).toBe("Has due date")
      expect(tasks[1]!.content).toBe("No due date")
    })
  })
})

describe.sequential("Task Status Validation", () => {
  const validStatuses: TaskStatus[] = ["todo", "wip", "done", "blocked", "dropped"]

  test("should accept valid status values", () => {
    for (const status of validStatuses) {
      expect(validStatuses.includes(status)).toBe(true)
    }
  })

  test("should have correct status list", () => {
    expect(validStatuses.length).toBe(5)
  })

  test("should reject invalid status values", () => {
    const invalidStatuses = ["complete", "pending", "active", "open", "in_progress"]
    for (const status of invalidStatuses) {
      expect(validStatuses.includes(status as TaskStatus)).toBe(false)
    }
  })
})

describe.sequential("Node ID Prefix Matching", () => {
  test("should find node by full ID", async () => {
    await withTestEnv(async ({ db }) => {
      const task = createTask(db, "Test task")
      const found = getNode(db, task.id)

      expect(found).not.toBeNull()
      expect(found?.id).toBe(task.id)
    })
  })

  test("should return null for non-existent ID", async () => {
    await withTestEnv(async ({ db }) => {
      const found = getNode(db, "nonexistent-id")
      expect(found).toBeNull()
    })
  })

  test("should get node with all fields", async () => {
    await withTestEnv(async ({ db }) => {
      const task = createTask(db, "Test task", {
        priority: "P2",
        due_at: "2026-01-15",
        assigned_to: "alice",
      })

      const found = getNode(db, task.id)

      expect(found?.content).toBe("Test task")
      expect(found?.priority).toBe("P2")
      expect(found?.due_at).toBe("2026-01-15")
      expect(found?.assigned_to).toBe("alice")
    })
  })
})

describe.sequential("Task Assignment", () => {
  test("should filter tasks by assigned_to", async () => {
    await withTestEnv(async ({ db }) => {
      createTask(db, "Alice task", { assigned_to: "alice" })
      createTask(db, "Bob task", { assigned_to: "bob" })
      createTask(db, "Unassigned task")

      const aliceTasks = db
        .prepare("SELECT * FROM nodes WHERE task_status IS NOT NULL AND assigned_to = ?")
        .all("alice") as KNode[]

      expect(aliceTasks.length).toBe(1)
      expect(aliceTasks[0]!.content).toBe("Alice task")
    })
  })

  test("should find unassigned tasks", async () => {
    await withTestEnv(async ({ db }) => {
      createTask(db, "Alice task", { assigned_to: "alice" })
      createTask(db, "Unassigned 1")
      createTask(db, "Unassigned 2")

      const unassigned = db
        .prepare("SELECT * FROM nodes WHERE task_status IS NOT NULL AND assigned_to IS NULL")
        .all() as KNode[]

      expect(unassigned.length).toBe(2)
    })
  })
})

describe.sequential("Task Content Parsing", () => {
  // These tests verify that task content can contain metadata markers
  // The actual parsing happens in md/parser.ts which is tested elsewhere

  test("should store content with emoji markers", async () => {
    await withTestEnv(async ({ db }) => {
      const task = createTask(db, "Task with due 📅 2025-12-25")
      const found = getNode(db, task.id)

      expect(found?.content).toContain("📅")
      expect(found?.content).toContain("2025-12-25")
    })
  })

  test("should store content with priority marker", async () => {
    await withTestEnv(async ({ db }) => {
      const task = createTask(db, "Urgent task ⏫")
      const found = getNode(db, task.id)

      expect(found?.content).toContain("⏫")
    })
  })

  test("should store content with tags", async () => {
    await withTestEnv(async ({ db }) => {
      const task = createTask(db, "Task #work #urgent")
      const found = getNode(db, task.id)

      expect(found?.content).toContain("#work")
      expect(found?.content).toContain("#urgent")
    })
  })
})

describe.sequential("Search Functionality", () => {
  test("should find tasks by content substring", async () => {
    await withTestEnv(async ({ db }) => {
      createTask(db, "Buy groceries")
      createTask(db, "Call Alice")
      createTask(db, "Review code")

      const results = db
        .prepare("SELECT * FROM nodes WHERE task_status IS NOT NULL AND content LIKE ?")
        .all("%Alice%") as KNode[]

      expect(results.length).toBe(1)
      expect(results[0]!.content).toBe("Call Alice")
    })
  })

  test("should find tasks case-insensitively", async () => {
    await withTestEnv(async ({ db }) => {
      createTask(db, "Buy GROCERIES")
      createTask(db, "groceries list")

      const results = db
        .prepare("SELECT * FROM nodes WHERE task_status IS NOT NULL AND LOWER(content) LIKE LOWER(?)")
        .all("%groceries%") as KNode[]

      expect(results.length).toBe(2)
    })
  })

  test("should return empty for no matches", async () => {
    await withTestEnv(async ({ db }) => {
      createTask(db, "Buy groceries")

      const results = db
        .prepare("SELECT * FROM nodes WHERE task_status IS NOT NULL AND content LIKE ?")
        .all("%nonexistent%") as KNode[]

      expect(results.length).toBe(0)
    })
  })
})

describe.sequential("Task Data Field", () => {
  test("should store and retrieve JSON data", async () => {
    await withTestEnv(async ({ db }) => {
      const id = `task-${Date.now()}`
      const data = { tags: ["work", "urgent"], notes: "Important" }

      db.prepare(
        `INSERT INTO nodes (id, type, list_marker, task_marker, content, task_status, data, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(id, "li", "-", "[ ]", "Test task", "todo", JSON.stringify(data), Date.now(), Date.now())

      const found = getNode(db, id)
      expect(found?.data).toEqual(data)
    })
  })

  test("should handle empty data field", async () => {
    await withTestEnv(async ({ db }) => {
      const task = createTask(db, "Task without data")
      const found = getNode(db, task.id)

      // Data defaults to empty object when not specified
      expect(found?.data).toEqual({})
    })
  })
})

describe.sequential("Overdue Detection", () => {
  test("should detect overdue tasks", async () => {
    await withTestEnv(async ({ db }) => {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      const yesterdayStr = yesterday.toISOString().split("T")[0]

      createTask(db, "Overdue task", { due_at: yesterdayStr })

      const tasks = getTasksByStatus(db, ["todo"])
      const overdue = tasks.filter((t) => {
        if (!t.due_at) return false
        return new Date(t.due_at) < new Date()
      })

      expect(overdue.length).toBe(1)
      expect(overdue[0]!.content).toBe("Overdue task")
    })
  })

  test("should not mark future tasks as overdue", async () => {
    await withTestEnv(async ({ db }) => {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      const tomorrowStr = tomorrow.toISOString().split("T")[0]

      createTask(db, "Future task", { due_at: tomorrowStr })

      const tasks = getTasksByStatus(db, ["todo"])
      const overdue = tasks.filter((t) => {
        if (!t.due_at) return false
        return new Date(t.due_at) < new Date()
      })

      expect(overdue.length).toBe(0)
    })
  })
})

describe.sequential("Timestamp Handling", () => {
  test("should store and retrieve timestamps", async () => {
    await withTestEnv(async ({ db }) => {
      const before = Date.now()
      const task = createTask(db, "Timestamped task")
      const after = Date.now()

      const found = getNode(db, task.id)

      expect(found?.created_at).toBeGreaterThanOrEqual(before)
      expect(found?.created_at).toBeLessThanOrEqual(after)
      expect(found?.updated_at).toBeGreaterThanOrEqual(before)
      expect(found?.updated_at).toBeLessThanOrEqual(after)
    })
  })
})
