/**
 * Store Abstraction Tests
 *
 * Tests for DiskStore and MemoryStore implementations.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { initStore, closeStore, MemoryStore, DiskStore } from "../src/store.ts";

const TEST_DIR = join("/tmp", "kmtest-store");

describe("MemoryStore", () => {
  const ROOT_DIR = join(TEST_DIR, "memory-root");

  beforeEach(() => {
    // Clean up and create test directory structure
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(ROOT_DIR, { recursive: true });

    // Create test files
    writeFileSync(
      join(ROOT_DIR, "tasks.md"),
      `# Tasks

- [ ] Open task
- [x] Done task
- [/] In progress task
`,
    );

    writeFileSync(
      join(ROOT_DIR, "notes.md"),
      `# Notes

## Section One

Some content here.

## Section Two

- [ ] Nested task
`,
    );

    // Create a subfolder with content
    mkdirSync(join(ROOT_DIR, "projects"));
    writeFileSync(
      join(ROOT_DIR, "projects", "project-a.md"),
      `# Project A

- [ ] Project task
`,
    );

    // Create non-markdown files (inbox scenario)
    mkdirSync(join(ROOT_DIR, "inbox"));
    writeFileSync(join(ROOT_DIR, "inbox", "document.pdf"), "fake pdf content");
    writeFileSync(join(ROOT_DIR, "inbox", "image.png"), "fake image content");
    writeFileSync(join(ROOT_DIR, "inbox", "readme.txt"), "some text");
  });

  afterEach(() => {
    closeStore();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  test("should scan filesystem and create nodes", () => {
    const store = new MemoryStore(ROOT_DIR);

    const allNodes = store.getAllNodes();
    expect(allNodes.length).toBeGreaterThan(0);

    // Should have files (3 .md + 3 non-md)
    const files = allNodes.filter((n) => n.type === "file");
    expect(files.length).toBe(6); // tasks.md, notes.md, project-a.md, document.pdf, image.png, readme.txt

    // Should have folders
    const folders = allNodes.filter((n) => n.type === "folder");
    expect(folders.length).toBe(2); // projects/, inbox/

    store.close();
  });

  test("should include non-markdown files as nodes", () => {
    const store = new MemoryStore(ROOT_DIR);

    const allNodes = store.getAllNodes();
    const fileNames = allNodes
      .filter((n) => n.type === "file")
      .map((n) => n.content);

    // Non-markdown files should be included with full filename
    expect(fileNames).toContain("document.pdf");
    expect(fileNames).toContain("image.png");
    expect(fileNames).toContain("readme.txt");

    // Markdown files with H1 should have content = H1 title
    expect(fileNames).toContain("Tasks"); // From # Tasks
    expect(fileNames).toContain("Notes"); // From # Notes

    store.close();
  });

  test("should find all tasks", () => {
    const store = new MemoryStore(ROOT_DIR);

    const tasks = store.getAllTasks();
    expect(tasks.length).toBe(5); // 3 in tasks.md, 1 in notes.md, 1 in project-a.md

    store.close();
  });

  test("should correctly parse task status", () => {
    const store = new MemoryStore(ROOT_DIR);

    const tasks = store.getAllTasks();

    const openTask = tasks.find((t) => t.content === "Open task");
    expect(openTask).toBeDefined();
    expect(openTask!.task_status).toBe("todo");

    const doneTask = tasks.find((t) => t.content === "Done task");
    expect(doneTask).toBeDefined();
    expect(doneTask!.task_status).toBe("done");

    const wipTask = tasks.find((t) => t.content === "In progress task");
    expect(wipTask).toBeDefined();
    expect(wipTask!.task_status).toBe("wip");

    store.close();
  });

  test("should create ULID IDs for parsed nodes", () => {
    const store = new MemoryStore(ROOT_DIR);

    const tasks = store.getAllTasks();
    const task = tasks.find((t) => t.content === "Open task");

    expect(task).toBeDefined();
    // ULIDs are 26 character alphanumeric strings
    expect(task!.id).toMatch(/^[0-9A-Z]{26}$/);

    store.close();
  });

  test("should build section hierarchy from headings", () => {
    const store = new MemoryStore(ROOT_DIR);

    const sections = store.getAllNodes().filter((n) => n.type === "section");
    expect(sections.length).toBeGreaterThan(0);

    // notes.md has "Notes" (H1 merged into file), "Section One", "Section Two" (H2s)
    // H1 is merged into file node, so only H2 sections exist as separate nodes
    // Sections are children of the file node, not marked with fs_path
    const notesFile = store.getNodeByPath(join(ROOT_DIR, "notes.md"));
    expect(notesFile).not.toBeNull();
    const noteSections = sections.filter((s) => s.parent_id === notesFile!.id);
    expect(noteSections.length).toBe(2); // Section One, Section Two

    store.close();
  });

  test("should get node by path", () => {
    const store = new MemoryStore(ROOT_DIR);

    const tasksFile = store.getNodeByPath(join(ROOT_DIR, "tasks.md"));
    expect(tasksFile).not.toBeNull();
    expect(tasksFile!.type).toBe("file");
    // File content is the H1 title (merged into file node)
    expect(tasksFile!.content).toBe("Tasks");

    store.close();
  });

  test("should get children of a node", () => {
    const store = new MemoryStore(ROOT_DIR);

    // Get root children
    const rootChildren = store.getChildren(null);
    expect(rootChildren.length).toBe(4); // tasks.md, notes.md, projects/, inbox/

    // Get children of projects folder
    const projectsFolder = rootChildren.find((n) => n.content === "projects");
    expect(projectsFolder).toBeDefined();

    const projectChildren = store.getChildren(projectsFolder!.id);
    expect(projectChildren.length).toBe(1); // project-a.md

    store.close();
  });

  test("should get ancestors of a node", () => {
    const store = new MemoryStore(ROOT_DIR);

    // Find a nested task
    const tasks = store.getAllTasks();
    const nestedTask = tasks.find((t) => t.content === "Nested task");
    expect(nestedTask).toBeDefined();

    const ancestors = store.getAncestors(nestedTask!.id);
    expect(ancestors.length).toBeGreaterThan(0);

    // Should have section and file as ancestors
    const ancestorTypes = ancestors.map((a) => a.type);
    expect(ancestorTypes).toContain("section");
    expect(ancestorTypes).toContain("file");

    store.close();
  });

  test("should get tasks by status", () => {
    const store = new MemoryStore(ROOT_DIR);

    const todoTasks = store.getTasksByStatus("todo");
    expect(todoTasks.length).toBe(3); // Open task, Nested task, Project task

    const doneTasks = store.getTasksByStatus("done");
    expect(doneTasks.length).toBe(1);

    const multiStatus = store.getTasksByStatus(["todo", "wip"]);
    expect(multiStatus.length).toBe(4); // 3 todo + 1 wip

    store.close();
  });

  test("should update node and write through to file", () => {
    const store = new MemoryStore(ROOT_DIR);

    // Find an open task
    const tasks = store.getAllTasks();
    const openTask = tasks.find((t) => t.content === "Open task");
    expect(openTask).toBeDefined();

    // Update to done
    store.updateNode(openTask!.id, {
      task_status: "done",
      task_mark: "x",
    });

    // Verify in-memory update
    const updatedTask = store.getNode(openTask!.id);
    expect(updatedTask!.task_status).toBe("done");

    // Verify write-through to file
    const fileContent = readFileSync(join(ROOT_DIR, "tasks.md"), "utf-8");
    expect(fileContent).toContain("- [x] Open task");

    store.close();
  });

  test("should refresh and rescan filesystem", () => {
    const store = new MemoryStore(ROOT_DIR);

    const initialTasks = store.getAllTasks();
    expect(initialTasks.length).toBe(5);

    // Add a new task to the file
    const tasksPath = join(ROOT_DIR, "tasks.md");
    const content = readFileSync(tasksPath, "utf-8");
    writeFileSync(tasksPath, content + "\n- [ ] New task\n");

    // Refresh
    store.refresh();

    const refreshedTasks = store.getAllTasks();
    expect(refreshedTasks.length).toBe(6);

    store.close();
  });
});

describe("DiskStore", () => {
  const ROOT_DIR = join(TEST_DIR, "disk-root");
  const KM_DIR = join(ROOT_DIR, ".km");

  beforeEach(() => {
    // Clean up and create test directory structure
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(KM_DIR, { recursive: true });
  });

  afterEach(() => {
    closeStore();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  test("should detect disk mode when .km exists", () => {
    const store = initStore(ROOT_DIR);
    expect(store.mode).toBe("disk");
    expect(store.rootPath).toBe(ROOT_DIR);
  });

  test("should use state.db in .km directory", () => {
    const store = new DiskStore(KM_DIR);
    expect(existsSync(join(KM_DIR, "state.db"))).toBe(true);
    store.close();
  });
});

describe("initStore mode detection", () => {
  // Use /tmp to avoid ancestor .km detection from project directory
  const TEST_ROOT = "/tmp/km-store-mode-test";
  const MEMORY_DIR = join(TEST_ROOT, "memory");
  const DISK_DIR = join(TEST_ROOT, "disk");

  beforeEach(() => {
    if (existsSync(TEST_ROOT)) {
      rmSync(TEST_ROOT, { recursive: true });
    }
    mkdirSync(MEMORY_DIR, { recursive: true });
    mkdirSync(join(DISK_DIR, ".km"), { recursive: true });
  });

  afterEach(() => {
    closeStore();
    if (existsSync(TEST_ROOT)) {
      rmSync(TEST_ROOT, { recursive: true });
    }
  });

  test("should return MemoryStore when no .km directory exists", () => {
    // Pass false to disable ancestor search (avoid /tmp/.km pollution)
    const store = initStore(MEMORY_DIR, false);
    expect(store.mode).toBe("memory");
    expect(store).toBeInstanceOf(MemoryStore);
  });

  test("should return DiskStore when .km directory exists", () => {
    // Pass false to disable ancestor search (test specific directory)
    const store = initStore(DISK_DIR, false);
    expect(store.mode).toBe("disk");
    expect(store).toBeInstanceOf(DiskStore);
  });

  test("should find .km in parent directory", () => {
    const subDir = join(DISK_DIR, "subdir");
    mkdirSync(subDir, { recursive: true });

    const store = initStore(subDir);
    expect(store.mode).toBe("disk");
    expect(store.rootPath).toBe(DISK_DIR);
  });
});
