/**
 * Detail Pane Tests
 *
 * Tests for the detail pane component that shows full task details
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { rmSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import React from "react";
import { createTestRenderer } from "inkx/testing";

const render = createTestRenderer();

const TEST_DIR = join("/tmp", "kmtest-detail-pane");

import {
  resetDb,
  closeDb,
  getNode,
  applyEvent,
  addLink,
  getChildren,
  emitNodeCreated,
  setKmDir,
  setDatabase,
} from "@km/storage";
import type { NodeType, KNode } from "@km/core";
import { ulid } from "ulid";

import {
  DetailPane,
  extractReferences,
  formatDate,
  getStatusDisplay,
  getProjectPath,
} from "../src/views/DetailPane.tsx";

// Test helper to create nodes
function createTestNode(
  type: NodeType,
  content?: string,
  parentId?: string | null,
  extra?: Record<string, unknown>,
): string {
  const id = ulid();
  emitNodeCreated("test-user", {
    id,
    type,
    parent_id: parentId ?? null,
    content,
    ...extra,
  });
  return id;
}

describe.serial("extractReferences", () => {
  test("extracts @mentions", () => {
    const refs = extractReferences("Contact @john and @jane about this");
    expect(refs.mentions).toEqual(["john", "jane"]);
  });

  test("extracts #tags", () => {
    const refs = extractReferences("This is #important and #urgent");
    expect(refs.tags).toEqual(["important", "urgent"]);
  });

  test("extracts +projects", () => {
    const refs = extractReferences("Part of +work and +finance projects");
    expect(refs.projects).toEqual(["work", "finance"]);
  });

  test("extracts [[wikilinks]]", () => {
    const refs = extractReferences(
      "See [[Meeting Notes]] and [[Q4 Actuals]] for details",
    );
    expect(refs.wikilinks).toEqual(["Meeting Notes", "Q4 Actuals"]);
  });

  test("extracts all reference types together", () => {
    const refs = extractReferences(
      "@bjorn #finance +work [[Q4 Budget]] review",
    );
    expect(refs.mentions).toEqual(["bjorn"]);
    expect(refs.tags).toEqual(["finance"]);
    expect(refs.projects).toEqual(["work"]);
    expect(refs.wikilinks).toEqual(["Q4 Budget"]);
  });

  test("deduplicates references", () => {
    const refs = extractReferences("@john said @john should do it @john");
    expect(refs.mentions).toEqual(["john"]);
  });

  test("handles undefined content", () => {
    const refs = extractReferences(undefined);
    expect(refs.mentions).toEqual([]);
    expect(refs.tags).toEqual([]);
    expect(refs.projects).toEqual([]);
    expect(refs.wikilinks).toEqual([]);
  });

  test("handles empty content", () => {
    const refs = extractReferences("");
    expect(refs.mentions).toEqual([]);
    expect(refs.tags).toEqual([]);
    expect(refs.projects).toEqual([]);
    expect(refs.wikilinks).toEqual([]);
  });
});

describe.serial("formatDate", () => {
  test("returns empty string for undefined", () => {
    expect(formatDate(undefined).text).toBe("");
  });

  test("returns raw date for invalid date", () => {
    expect(formatDate("not-a-date").text).toBe("not-a-date");
  });

  test("formats date in current year as short form", () => {
    const now = new Date();
    const dateStr = `${now.getFullYear()}-01-15`;
    const formatted = formatDate(dateStr);
    expect(formatted.text).toContain("Jan");
    expect(formatted.text).toContain("15");
  });

  test("returns full date for different year", () => {
    const formatted = formatDate("2020-06-15");
    // Should return the original date string for different years
    expect(formatted.text).toBe("2020-06-15");
    // Past date should be overdue
    expect(formatted.urgency).toBe("overdue");
  });

  test("returns overdue urgency for past dates", () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 5);
    const formatted = formatDate(pastDate.toISOString().slice(0, 10));
    expect(formatted.urgency).toBe("overdue");
  });

  test("returns urgent urgency for dates due tomorrow", () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const formatted = formatDate(tomorrow.toISOString().slice(0, 10));
    expect(formatted.urgency).toBe("urgent");
  });

  test("returns soon urgency for dates due within 3 days", () => {
    const soonDate = new Date();
    soonDate.setDate(soonDate.getDate() + 3);
    const formatted = formatDate(soonDate.toISOString().slice(0, 10));
    expect(formatted.urgency).toBe("soon");
  });

  test("returns normal urgency for future dates", () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 10);
    const formatted = formatDate(futureDate.toISOString().slice(0, 10));
    expect(formatted.urgency).toBe("normal");
  });
});

describe.serial("getStatusDisplay", () => {
  test("returns todo for undefined status", () => {
    const result = getStatusDisplay(undefined);
    expect(result.text).toBe("todo");
    expect(result.color).toBe("blue");
  });

  test("returns done with green color", () => {
    const result = getStatusDisplay("done");
    expect(result.text).toBe("done");
    expect(result.color).toBe("green");
  });

  test("returns wip with yellow color", () => {
    const result = getStatusDisplay("wip");
    expect(result.text).toBe("wip");
    expect(result.color).toBe("yellow");
  });

  test("returns blocked with red color", () => {
    const result = getStatusDisplay("blocked");
    expect(result.text).toBe("blocked");
    expect(result.color).toBe("red");
  });

  test("returns dropped with gray color", () => {
    const result = getStatusDisplay("dropped");
    expect(result.text).toBe("dropped");
    expect(result.color).toBe("gray");
  });
});

describe.serial("getProjectPath", () => {
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

  test("returns empty array for node with no parent", () => {
    const nodeId = createTestNode("task", "Standalone task");
    const node = getNode(nodeId)!;
    expect(getProjectPath(node)).toEqual([]);
  });

  test("returns folder names in path", () => {
    const folderId = createTestNode("folder", "Work", null);
    const subfolderId = createTestNode("folder", "Finance", folderId);
    const taskId = createTestNode("task", "Review budget", subfolderId);
    const task = getNode(taskId)!;

    const path = getProjectPath(task);
    expect(path).toEqual(["Work", "Finance"]);
  });

  test("includes files in path", () => {
    const folderId = createTestNode("folder", "Projects", null);
    const fileId = createTestNode("file", "todo.md", folderId);
    const taskId = createTestNode("task", "Do something", fileId);
    const task = getNode(taskId)!;

    const path = getProjectPath(task);
    expect(path).toEqual(["Projects", "todo.md"]);
  });
});

describe.serial("DetailPane Component", () => {
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

  test("renders with all task fields", async () => {
    const taskId = createTestNode("task", "Review Q1 budget", null, {
      task_status: "todo",
      due_date: "2026-01-10",
      assigned_to: "bjorn",
    });
    const task = getNode(taskId)!;

    const { lastFrame } = render(
      React.createElement(DetailPane, {
        node: task,
        width: 40,
        height: 24,
      }),
    );

    const output = lastFrame() ?? "";

    // Check title
    expect(output).toContain("Review Q1 budget");

    // Check status
    expect(output).toContain("Status:");
    expect(output).toContain("todo");

    // Check due date
    expect(output).toContain("Due:");
    expect(output).toContain("Jan");

    // Check assigned
    expect(output).toContain("Assigned:");
    expect(output).toContain("@bjorn");
  });

  test("shows subtasks", async () => {
    const parentId = createTestNode("task", "Parent task");
    createTestNode("task", "Subtask 1", parentId, { task_status: "done" });
    createTestNode("task", "Subtask 2", parentId, { task_status: "todo" });

    const parent = getNode(parentId)!;

    const { lastFrame } = render(
      React.createElement(DetailPane, {
        node: parent,
        width: 40,
        height: 24,
      }),
    );

    const output = lastFrame() ?? "";

    expect(output).toContain("Subtasks");
    expect(output).toContain("Subtask 1");
    expect(output).toContain("Subtask 2");
  });

  test("shows references from content", async () => {
    const taskId = createTestNode(
      "task",
      "Talk to @john about #budget for +work project [[Meeting Notes]]",
    );
    const task = getNode(taskId)!;

    const { lastFrame } = render(
      React.createElement(DetailPane, {
        node: task,
        width: 50,
        height: 24,
      }),
    );

    const output = lastFrame() ?? "";

    // Check references are shown
    expect(output).toContain("#budget");
    expect(output).toContain("@john");
    expect(output).toContain("+work");
    expect(output).toContain("[[Meeting Notes]]");
  });

  test("shows project path", async () => {
    const folderId = createTestNode("folder", "Work");
    const subfolderId = createTestNode("folder", "Finance", folderId);
    const taskId = createTestNode("task", "Review budget", subfolderId);
    const task = getNode(taskId)!;

    const { lastFrame } = render(
      React.createElement(DetailPane, {
        node: task,
        width: 50,
        height: 24,
      }),
    );

    const output = lastFrame() ?? "";

    expect(output).toContain("Project:");
    expect(output).toContain("Work");
    expect(output).toContain("Finance");
  });

  test("shows keybindings hint", async () => {
    const taskId = createTestNode("task", "Simple task");
    const task = getNode(taskId)!;

    const { lastFrame } = render(
      React.createElement(DetailPane, {
        node: task,
        width: 50,
        height: 24,
      }),
    );

    const output = lastFrame() ?? "";

    // Should show keybindings at bottom
    expect(output).toContain("h/Esc:close");
  });

  test("handles task with done status", async () => {
    const taskId = createTestNode("task", "Completed task", null, {
      task_status: "done",
    });
    const task = getNode(taskId)!;

    const { lastFrame } = render(
      React.createElement(DetailPane, {
        node: task,
        width: 40,
        height: 24,
      }),
    );

    const output = lastFrame() ?? "";

    expect(output).toContain("done");
  });
});

describe.serial("DetailPane with Backlinks", () => {
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

  test("shows backlinks when present", async () => {
    // Create target node
    const targetId = createTestNode("task", "Target task");
    const target = getNode(targetId)!;

    // Create source node that links to target
    const sourceId = createTestNode("file", "Meeting Notes");

    // Add a link from source to target
    addLink({
      source_id: sourceId,
      target_name: "Target task",
      target_id: targetId,
      section: null,
      block_id: null,
      alias: null,
      embedded: false,
      relationship: null,
    });

    const { lastFrame } = render(
      React.createElement(DetailPane, {
        node: target,
        width: 50,
        height: 24,
      }),
    );

    const output = lastFrame() ?? "";

    expect(output).toContain("Backlinks");
    expect(output).toContain("Meeting Notes");
  });
});
