/**
 * Detail Pane Tests
 *
 * Tests for the detail pane component that shows full task details
 */

import { describe, test, expect } from "bun:test";
import React from "react";
import { createTestRenderer } from "inkx/testing";

const render = createTestRenderer();

import { createFakeVault } from "@km/storage";
import type { KNode } from "@km/core";

import {
  DetailPane,
  extractReferences,
  formatDate,
  getStatusDisplay,
  getProjectPath,
} from "../src/views/DetailPane.tsx";
import { VaultProvider } from "../src/vault-context.tsx";

// Helper to render DetailPane with VaultProvider
function renderDetailPane(
  vault: ReturnType<typeof createFakeVault>,
  node: KNode,
  width: number,
  height: number,
) {
  const detailPane = React.createElement(DetailPane, { node, width, height });
  return render(
    React.createElement(VaultProvider, { vault, children: detailPane }),
  );
}

describe("extractReferences", () => {
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

describe("formatDate", () => {
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

describe("getStatusDisplay", () => {
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

describe("getProjectPath", () => {
  test("returns empty array for node with no parent", () => {
    const vault = createFakeVault({
      nodes: [
        {
          id: "task1",
          type: "task",
          content: "Standalone task",
          parent_id: null,
          parent_idx: 0,
          link_to: null,
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "test",
        },
      ],
    });
    const node = vault.getNode("task1")!;
    expect(getProjectPath(vault, node)).toEqual([]);
  });

  test("returns folder names in path", () => {
    const vault = createFakeVault({
      nodes: [
        {
          id: "folder1",
          type: "folder",
          content: "Work",
          parent_id: null,
          parent_idx: 0,
          link_to: null,
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "test",
        },
        {
          id: "folder2",
          type: "folder",
          content: "Finance",
          parent_id: "folder1",
          parent_idx: 0,
          link_to: null,
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "test",
        },
        {
          id: "task1",
          type: "task",
          content: "Review budget",
          parent_id: "folder2",
          parent_idx: 0,
          link_to: null,
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "test",
        },
      ],
    });
    const task = vault.getNode("task1")!;
    const path = getProjectPath(vault, task);
    expect(path).toEqual(["Work", "Finance"]);
  });

  test("includes files in path", () => {
    const vault = createFakeVault({
      nodes: [
        {
          id: "folder1",
          type: "folder",
          content: "Projects",
          parent_id: null,
          parent_idx: 0,
          link_to: null,
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "test",
        },
        {
          id: "file1",
          type: "file",
          content: "todo.md",
          parent_id: "folder1",
          parent_idx: 0,
          link_to: null,
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "test",
        },
        {
          id: "task1",
          type: "task",
          content: "Do something",
          parent_id: "file1",
          parent_idx: 0,
          link_to: null,
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "test",
        },
      ],
    });
    const task = vault.getNode("task1")!;
    const path = getProjectPath(vault, task);
    expect(path).toEqual(["Projects", "todo.md"]);
  });
});

describe("DetailPane Component", () => {
  test("renders with all task fields", () => {
    const vault = createFakeVault({
      nodes: [
        {
          id: "task1",
          type: "task",
          content: "Review Q1 budget",
          parent_id: null,
          parent_idx: 0,
          link_to: null,
          task_status: "todo",
          due_date: "2026-01-10",
          assigned_to: "bjorn",
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "test",
        },
      ],
    });
    const task = vault.getNode("task1")!;

    const { lastFrame } = renderDetailPane(vault, task, 40, 24);

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

  test("shows subtasks", () => {
    const vault = createFakeVault({
      nodes: [
        {
          id: "parent1",
          type: "task",
          content: "Parent task",
          parent_id: null,
          parent_idx: 0,
          link_to: null,
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "test",
        },
        {
          id: "sub1",
          type: "task",
          content: "Subtask 1",
          parent_id: "parent1",
          parent_idx: 0,
          link_to: null,
          task_status: "done",
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "test",
        },
        {
          id: "sub2",
          type: "task",
          content: "Subtask 2",
          parent_id: "parent1",
          parent_idx: 1,
          link_to: null,
          task_status: "todo",
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "test",
        },
      ],
    });
    const parent = vault.getNode("parent1")!;

    const { lastFrame } = renderDetailPane(vault, parent, 40, 24);

    const output = lastFrame() ?? "";

    expect(output).toContain("Subtasks");
    expect(output).toContain("Subtask 1");
    expect(output).toContain("Subtask 2");
  });

  test("shows references from content", () => {
    const vault = createFakeVault({
      nodes: [
        {
          id: "task1",
          type: "task",
          content:
            "Talk to @john about #budget for +work project [[Meeting Notes]]",
          parent_id: null,
          parent_idx: 0,
          link_to: null,
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "test",
        },
      ],
    });
    const task = vault.getNode("task1")!;

    const { lastFrame } = renderDetailPane(vault, task, 50, 24);

    const output = lastFrame() ?? "";

    // Check references are shown
    expect(output).toContain("#budget");
    expect(output).toContain("@john");
    expect(output).toContain("+work");
    expect(output).toContain("[[Meeting Notes]]");
  });

  test("shows project path", () => {
    const vault = createFakeVault({
      nodes: [
        {
          id: "folder1",
          type: "folder",
          content: "Work",
          parent_id: null,
          parent_idx: 0,
          link_to: null,
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "test",
        },
        {
          id: "folder2",
          type: "folder",
          content: "Finance",
          parent_id: "folder1",
          parent_idx: 0,
          link_to: null,
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "test",
        },
        {
          id: "task1",
          type: "task",
          content: "Review budget",
          parent_id: "folder2",
          parent_idx: 0,
          link_to: null,
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "test",
        },
      ],
    });
    const task = vault.getNode("task1")!;

    const { lastFrame } = renderDetailPane(vault, task, 50, 24);

    const output = lastFrame() ?? "";

    expect(output).toContain("Project:");
    expect(output).toContain("Work");
    expect(output).toContain("Finance");
  });

  test("shows keybindings hint", () => {
    const vault = createFakeVault({
      nodes: [
        {
          id: "task1",
          type: "task",
          content: "Simple task",
          parent_id: null,
          parent_idx: 0,
          link_to: null,
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "test",
        },
      ],
    });
    const task = vault.getNode("task1")!;

    const { lastFrame } = renderDetailPane(vault, task, 50, 24);

    const output = lastFrame() ?? "";

    // Should show keybindings at bottom
    expect(output).toContain("h/Esc:close");
  });

  test("handles task with done status", () => {
    const vault = createFakeVault({
      nodes: [
        {
          id: "task1",
          type: "task",
          content: "Completed task",
          parent_id: null,
          parent_idx: 0,
          link_to: null,
          task_status: "done",
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "test",
        },
      ],
    });
    const task = vault.getNode("task1")!;

    const { lastFrame } = renderDetailPane(vault, task, 40, 24);

    const output = lastFrame() ?? "";

    expect(output).toContain("done");
  });
});

describe("DetailPane with Backlinks", () => {
  test("shows backlinks when present", () => {
    const vault = createFakeVault({
      nodes: [
        {
          id: "target1",
          type: "task",
          content: "Target task",
          parent_id: null,
          parent_idx: 0,
          link_to: null,
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "test",
        },
        {
          id: "source1",
          type: "file",
          content: "Meeting Notes",
          parent_id: null,
          parent_idx: 1,
          link_to: null,
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "test",
        },
      ],
      links: [
        {
          source_id: "source1",
          target_name: "Target task",
          target_id: "target1",
          section: null,
          block_id: null,
          alias: null,
          embedded: false,
          relationship: null,
          created_at: Date.now(),
        },
      ],
    });
    const target = vault.getNode("target1")!;

    const { lastFrame } = renderDetailPane(vault, target, 50, 24);

    const output = lastFrame() ?? "";

    expect(output).toContain("Backlinks");
    expect(output).toContain("Meeting Notes");
  });
});
