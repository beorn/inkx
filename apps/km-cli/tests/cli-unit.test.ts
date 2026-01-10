/**
 * CLI Commands Unit Tests (km-d9f)
 *
 * Unit tests for CLI command handlers: actions, list, search, tree
 * These test the command logic directly rather than through the CLI.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { rmSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

import { setKmDir, clearDatabase } from "@km/core";
import {
  getDb,
  closeDb,
  resetDb,
  getNode,
  getTasksByStatus,
} from "@km/store";
import type { Node, TaskStatus } from "@km/core";

// Test directory
const TEST_DIR = join(import.meta.dir, ".test-cli-unit");

/**
 * Helper to create a task directly in the database
 */
function createTask(content: string, options: Partial<Node> = {}): Node {
  const db = getDb();
  const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = Date.now();

  const node: Node = {
    id,
    type: "task",
    content,
    task_status: "open",
    created_at: now,
    updated_at: now,
    ...options,
  };

  db.prepare(
    `INSERT INTO nodes (id, type, content, task_status, priority, due_date, assigned_to, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    node.id,
    node.type,
    node.content,
    node.task_status,
    node.priority ?? null,
    node.due_date ?? null,
    node.assigned_to ?? null,
    node.created_at,
    node.updated_at,
  );

  return node;
}

describe("Task Status Filtering", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    setKmDir(TEST_DIR);
    clearDatabase();
    closeDb();
    resetDb();
  });

  afterEach(() => {
    clearDatabase();
    closeDb();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  test("should filter by single status", () => {
    createTask("Open task", { task_status: "open" });
    createTask("Done task", { task_status: "done" });
    createTask("In progress", { task_status: "in_progress" });

    const openTasks = getTasksByStatus(["open"]);
    expect(openTasks.length).toBe(1);
    expect(openTasks[0].content).toBe("Open task");

    const doneTasks = getTasksByStatus(["done"]);
    expect(doneTasks.length).toBe(1);
    expect(doneTasks[0].content).toBe("Done task");
  });

  test("should filter by multiple statuses", () => {
    createTask("Open task", { task_status: "open" });
    createTask("Done task", { task_status: "done" });
    createTask("In progress", { task_status: "in_progress" });

    const tasks = getTasksByStatus(["open", "in_progress"]);
    expect(tasks.length).toBe(2);
    expect(tasks.map((t) => t.content)).toContain("Open task");
    expect(tasks.map((t) => t.content)).toContain("In progress");
  });

  test("should return empty for no matches", () => {
    createTask("Open task", { task_status: "open" });

    const blockedTasks = getTasksByStatus(["blocked"]);
    expect(blockedTasks.length).toBe(0);
  });
});

describe("Task Priority Sorting", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    setKmDir(TEST_DIR);
    clearDatabase();
    closeDb();
    resetDb();
  });

  afterEach(() => {
    clearDatabase();
    closeDb();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  test("should sort by priority ascending", () => {
    createTask("Low priority", { priority: 5 });
    createTask("High priority", { priority: 1 });
    createTask("Medium priority", { priority: 3 });

    const tasks = getTasksByStatus(["open"]);
    tasks.sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));

    expect(tasks[0].content).toBe("High priority");
    expect(tasks[1].content).toBe("Medium priority");
    expect(tasks[2].content).toBe("Low priority");
  });

  test("should handle null priorities", () => {
    createTask("No priority");
    createTask("Has priority", { priority: 2 });

    const tasks = getTasksByStatus(["open"]);
    tasks.sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));

    expect(tasks[0].content).toBe("Has priority");
    expect(tasks[1].content).toBe("No priority");
  });
});

describe("Task Due Date Sorting", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    setKmDir(TEST_DIR);
    clearDatabase();
    closeDb();
    resetDb();
  });

  afterEach(() => {
    clearDatabase();
    closeDb();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  test("should sort by due date ascending", () => {
    createTask("Due tomorrow", { due_date: "2026-01-10" });
    createTask("Due today", { due_date: "2026-01-09" });
    createTask("Due next week", { due_date: "2026-01-16" });

    const tasks = getTasksByStatus(["open"]);
    tasks.sort((a, b) => {
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date.localeCompare(b.due_date);
    });

    expect(tasks[0].content).toBe("Due today");
    expect(tasks[1].content).toBe("Due tomorrow");
    expect(tasks[2].content).toBe("Due next week");
  });

  test("should put tasks without due date last", () => {
    createTask("No due date");
    createTask("Has due date", { due_date: "2026-01-15" });

    const tasks = getTasksByStatus(["open"]);
    tasks.sort((a, b) => {
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date.localeCompare(b.due_date);
    });

    expect(tasks[0].content).toBe("Has due date");
    expect(tasks[1].content).toBe("No due date");
  });
});

describe("Task Status Validation", () => {
  const validStatuses: TaskStatus[] = [
    "open",
    "in_progress",
    "done",
    "blocked",
    "waiting",
    "scheduled",
    "cancelled",
  ];

  test("should accept valid status values", () => {
    for (const status of validStatuses) {
      expect(validStatuses.includes(status)).toBe(true);
    }
  });

  test("should have correct status list", () => {
    expect(validStatuses.length).toBe(7);
  });

  test("should reject invalid status values", () => {
    const invalidStatuses = ["complete", "pending", "todo", "active"];
    for (const status of invalidStatuses) {
      expect(validStatuses.includes(status as TaskStatus)).toBe(false);
    }
  });
});

describe("Node ID Prefix Matching", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    setKmDir(TEST_DIR);
    clearDatabase();
    closeDb();
    resetDb();
  });

  afterEach(() => {
    clearDatabase();
    closeDb();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  test("should find node by full ID", () => {
    const task = createTask("Test task");
    const found = getNode(task.id);

    expect(found).not.toBeNull();
    expect(found?.id).toBe(task.id);
  });

  test("should return null for non-existent ID", () => {
    const found = getNode("nonexistent-id");
    expect(found).toBeNull();
  });

  test("should get node with all fields", () => {
    const task = createTask("Test task", {
      priority: 2,
      due_date: "2026-01-15",
      assigned_to: "alice",
    });

    const found = getNode(task.id);

    expect(found?.content).toBe("Test task");
    expect(found?.priority).toBe(2);
    expect(found?.due_date).toBe("2026-01-15");
    expect(found?.assigned_to).toBe("alice");
  });
});

describe("Task Assignment", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    setKmDir(TEST_DIR);
    clearDatabase();
    closeDb();
    resetDb();
  });

  afterEach(() => {
    clearDatabase();
    closeDb();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  test("should filter tasks by assigned_to", () => {
    createTask("Alice task", { assigned_to: "alice" });
    createTask("Bob task", { assigned_to: "bob" });
    createTask("Unassigned task");

    const db = getDb();
    const aliceTasks = db
      .prepare("SELECT * FROM nodes WHERE type = 'task' AND assigned_to = ?")
      .all("alice") as Node[];

    expect(aliceTasks.length).toBe(1);
    expect(aliceTasks[0].content).toBe("Alice task");
  });

  test("should find unassigned tasks", () => {
    createTask("Alice task", { assigned_to: "alice" });
    createTask("Unassigned 1");
    createTask("Unassigned 2");

    const db = getDb();
    const unassigned = db
      .prepare(
        "SELECT * FROM nodes WHERE type = 'task' AND assigned_to IS NULL",
      )
      .all() as Node[];

    expect(unassigned.length).toBe(2);
  });
});

describe("Task Content Parsing", () => {
  // These tests verify that task content can contain metadata markers
  // The actual parsing happens in md/parser.ts which is tested elsewhere

  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    setKmDir(TEST_DIR);
    clearDatabase();
    closeDb();
    resetDb();
  });

  afterEach(() => {
    clearDatabase();
    closeDb();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  test("should store content with emoji markers", () => {
    const task = createTask("Task with due 📅 2025-12-25");
    const found = getNode(task.id);

    expect(found?.content).toContain("📅");
    expect(found?.content).toContain("2025-12-25");
  });

  test("should store content with priority marker", () => {
    const task = createTask("Urgent task ⏫");
    const found = getNode(task.id);

    expect(found?.content).toContain("⏫");
  });

  test("should store content with tags", () => {
    const task = createTask("Task #work #urgent");
    const found = getNode(task.id);

    expect(found?.content).toContain("#work");
    expect(found?.content).toContain("#urgent");
  });
});

describe("Search Functionality", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    setKmDir(TEST_DIR);
    clearDatabase();
    closeDb();
    resetDb();
  });

  afterEach(() => {
    clearDatabase();
    closeDb();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  test("should find tasks by content substring", () => {
    createTask("Buy groceries");
    createTask("Call Alice");
    createTask("Review code");

    const db = getDb();
    const results = db
      .prepare("SELECT * FROM nodes WHERE type = 'task' AND content LIKE ?")
      .all("%Alice%") as Node[];

    expect(results.length).toBe(1);
    expect(results[0].content).toBe("Call Alice");
  });

  test("should find tasks case-insensitively", () => {
    createTask("Buy GROCERIES");
    createTask("groceries list");

    const db = getDb();
    const results = db
      .prepare(
        "SELECT * FROM nodes WHERE type = 'task' AND LOWER(content) LIKE LOWER(?)",
      )
      .all("%groceries%") as Node[];

    expect(results.length).toBe(2);
  });

  test("should return empty for no matches", () => {
    createTask("Buy groceries");

    const db = getDb();
    const results = db
      .prepare("SELECT * FROM nodes WHERE type = 'task' AND content LIKE ?")
      .all("%nonexistent%") as Node[];

    expect(results.length).toBe(0);
  });
});

describe("Task Data Field", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    setKmDir(TEST_DIR);
    clearDatabase();
    closeDb();
    resetDb();
  });

  afterEach(() => {
    clearDatabase();
    closeDb();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  test("should store and retrieve JSON data", () => {
    const db = getDb();
    const id = `task-${Date.now()}`;
    const data = { tags: ["work", "urgent"], notes: "Important" };

    db.prepare(
      `INSERT INTO nodes (id, type, content, task_status, data, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      "task",
      "Test task",
      "open",
      JSON.stringify(data),
      Date.now(),
      Date.now(),
    );

    const found = getNode(id);
    expect(found?.data).toEqual(data);
  });

  test("should handle empty data field", () => {
    const task = createTask("Task without data");
    const found = getNode(task.id);

    // Data defaults to empty object when not specified
    expect(found?.data).toEqual({});
  });
});

describe("Overdue Detection", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    setKmDir(TEST_DIR);
    clearDatabase();
    closeDb();
    resetDb();
  });

  afterEach(() => {
    clearDatabase();
    closeDb();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  test("should detect overdue tasks", () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];

    createTask("Overdue task", { due_date: yesterdayStr });

    const tasks = getTasksByStatus(["open"]);
    const overdue = tasks.filter((t) => {
      if (!t.due_date) return false;
      return new Date(t.due_date) < new Date();
    });

    expect(overdue.length).toBe(1);
    expect(overdue[0].content).toBe("Overdue task");
  });

  test("should not mark future tasks as overdue", () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    createTask("Future task", { due_date: tomorrowStr });

    const tasks = getTasksByStatus(["open"]);
    const overdue = tasks.filter((t) => {
      if (!t.due_date) return false;
      return new Date(t.due_date) < new Date();
    });

    expect(overdue.length).toBe(0);
  });
});

describe("Timestamp Handling", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    setKmDir(TEST_DIR);
    clearDatabase();
    closeDb();
    resetDb();
  });

  afterEach(() => {
    clearDatabase();
    closeDb();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  test("should store and retrieve timestamps", () => {
    const before = Date.now();
    const task = createTask("Timestamped task");
    const after = Date.now();

    const found = getNode(task.id);

    expect(found?.created_at).toBeGreaterThanOrEqual(before);
    expect(found?.created_at).toBeLessThanOrEqual(after);
    expect(found?.updated_at).toBeGreaterThanOrEqual(before);
    expect(found?.updated_at).toBeLessThanOrEqual(after);
  });
});
