/**
 * Store Abstraction Tests
 *
 * Tests for DiskStore and MemoryStore implementations.
 * Uses isolated temp directories for parallelization.
 */

import { describe, test, expect, afterEach } from "vitest"
import { mkdirSync, rmSync, writeFileSync, readFileSync } from "fs"
import { join } from "path"
import { ulid } from "ulid"
import { MemoryStore } from "../src/store.ts"
import type { KNode } from "@km/core"

// Track created directories for cleanup
const createdDirs: string[] = []

afterEach(() => {
  for (const dir of createdDirs) {
    try {
      rmSync(dir, { recursive: true })
    } catch {
      // Ignore cleanup errors
    }
  }
  createdDirs.length = 0
})

/** Create an isolated test directory */
function createTestDir(): string {
  const dir = join("/tmp", `kmtest-store-${ulid()}`)
  mkdirSync(dir, { recursive: true })
  createdDirs.push(dir)
  return dir
}

/** Create a test repo with standard test files */
function createMemoryStoreTestRepo(): string {
  const rootDir = createTestDir()

  // Create test files
  writeFileSync(
    join(rootDir, "tasks.md"),
    `# Tasks

- [ ] Open task
- [x] Done task
- [/] In progress task
`,
  )

  writeFileSync(
    join(rootDir, "notes.md"),
    `# Notes

## Section One

Some content here.

## Section Two

- [ ] Nested task
`,
  )

  // Create a subfolder with content
  mkdirSync(join(rootDir, "projects"))
  writeFileSync(
    join(rootDir, "projects", "project-a.md"),
    `# Project A

- [ ] Project task
`,
  )

  // Create non-markdown files (inbox scenario)
  mkdirSync(join(rootDir, "inbox"))
  writeFileSync(join(rootDir, "inbox", "document.pdf"), "fake pdf content")
  writeFileSync(join(rootDir, "inbox", "image.png"), "fake image content")
  writeFileSync(join(rootDir, "inbox", "readme.txt"), "some text")

  return rootDir
}

describe("MemoryStore", () => {
  test("should scan filesystem and create nodes", () => {
    const rootDir = createMemoryStoreTestRepo()
    using store = new MemoryStore(rootDir)

    const allNodes = store.getAllNodes()
    expect(allNodes.length).toBeGreaterThan(0)

    // Should have files (3 .md + 3 non-md)
    const files = allNodes.filter(
      (n) => n.type === "h" && n.item != null && (n.fstype === "file" || n.fstype === "mdfile"),
    )
    expect(files.length).toBe(6) // tasks.md, notes.md, project-a.md, document.pdf, image.png, readme.txt

    // Should have folders (includes repo root node ".")
    const folders = allNodes.filter((n) => n.type === "h" && n.item != null && n.fstype === "folder")
    expect(folders.length).toBe(3) // "." (root), projects/, inbox/
  })

  test("should include non-markdown files as nodes", () => {
    const rootDir = createMemoryStoreTestRepo()
    using store = new MemoryStore(rootDir)

    const allNodes = store.getAllNodes()
    const fileNames = allNodes
      .filter((n) => n.type === "h" && n.item != null && (n.fstype === "file" || n.fstype === "mdfile"))
      .map((n) => n.content)

    // Non-markdown files should be included with full filename
    expect(fileNames).toContain("document.pdf")
    expect(fileNames).toContain("image.png")
    expect(fileNames).toContain("readme.txt")

    // Markdown files with H1 should have content = H1 title
    expect(fileNames).toContain("Tasks") // From # Tasks
    expect(fileNames).toContain("Notes") // From # Notes
  })

  test("should find all tasks", () => {
    const rootDir = createMemoryStoreTestRepo()
    using store = new MemoryStore(rootDir)

    const tasks = store.getAllTasks()
    expect(tasks.length).toBe(5) // 3 in tasks.md, 1 in notes.md, 1 in project-a.md
  })

  test("should correctly parse task status", () => {
    const rootDir = createMemoryStoreTestRepo()
    using store = new MemoryStore(rootDir)

    const tasks = store.getAllTasks()

    const openTask = tasks.find((t) => t.content === "Open task")
    expect(openTask).toBeDefined()
    expect(openTask!.item?.task?.status).toBe("todo")

    const doneTask = tasks.find((t) => t.content === "Done task")
    expect(doneTask).toBeDefined()
    expect(doneTask!.item?.task?.status).toBe("done")

    const wipTask = tasks.find((t) => t.content === "In progress task")
    expect(wipTask).toBeDefined()
    expect(wipTask!.item?.task?.status).toBe("wip")
  })

  test("should create ULID IDs for parsed nodes", () => {
    const rootDir = createMemoryStoreTestRepo()
    using store = new MemoryStore(rootDir)

    const tasks = store.getAllTasks()
    const task = tasks.find((t) => t.content === "Open task")

    expect(task).toBeDefined()
    // ULIDs are 26 character alphanumeric strings
    expect(task!.id).toMatch(/^[0-9A-Z]{26}$/)
  })

  test("should build section hierarchy from headings", () => {
    const rootDir = createMemoryStoreTestRepo()
    using store = new MemoryStore(rootDir)

    const sections = store.getAllNodes().filter((n) => n.type === "h" && n.item != null && n.fstype === "mdsection")
    expect(sections.length).toBeGreaterThan(0)

    // notes.md has "Notes" (H1 merged into file), "Section One", "Section Two" (H2s)
    // H1 is merged into file node, so only H2 sections exist as separate nodes
    // Sections are children of the file node, not marked with fs_path
    const notesFile = store.getNodeByPath(join(rootDir, "notes.md"))
    expect(notesFile).not.toBeNull()
    const noteSections = sections.filter((s) => s.parent_id === notesFile!.id)
    expect(noteSections.length).toBe(2) // Section One, Section Two
  })

  test("should get node by path", () => {
    const rootDir = createMemoryStoreTestRepo()
    using store = new MemoryStore(rootDir)

    const tasksFile = store.getNodeByPath(join(rootDir, "tasks.md"))
    expect(tasksFile).not.toBeNull()
    expect(tasksFile!.type).toBe("h")
    expect(tasksFile!.item).toBeTruthy()
    expect(tasksFile!.fstype === "file" || tasksFile!.fstype === "mdfile").toBe(true)
    // File content is the H1 title (merged into file node)
    expect(tasksFile!.content).toBe("Tasks")
  })

  test("should get children of a node", () => {
    const rootDir = createMemoryStoreTestRepo()
    using store = new MemoryStore(rootDir)

    // Get root children
    const rootChildren = store.getChildren(null)
    expect(rootChildren.length).toBe(4) // tasks.md, notes.md, projects/, inbox/

    // Get children of projects folder
    const projectsFolder = rootChildren.find((n) => n.content === "projects")
    expect(projectsFolder).toBeDefined()

    const projectChildren = store.getChildren(projectsFolder!.id)
    expect(projectChildren.length).toBe(1) // project-a.md
  })

  test("should get ancestors of a node", () => {
    const rootDir = createMemoryStoreTestRepo()
    using store = new MemoryStore(rootDir)

    // Find a nested task
    const tasks = store.getAllTasks()
    const nestedTask = tasks.find((t) => t.content === "Nested task")
    expect(nestedTask).toBeDefined()

    const ancestors = store.getAncestors(nestedTask!.id)
    expect(ancestors.length).toBeGreaterThan(0)

    // Should have section and file as ancestors
    // Should have outline item ancestors (sections and file)
    const ancestorFsTypes = ancestors.filter((a) => a.type === "h" && a.item != null).map((a) => a.fstype)
    expect(ancestorFsTypes).toContain("mdsection")
    expect(ancestorFsTypes.some((t) => t === "file" || t === "mdfile")).toBe(true)
  })

  test("should get tasks by status", () => {
    const rootDir = createMemoryStoreTestRepo()
    using store = new MemoryStore(rootDir)

    const todoTasks = store.getTasksByStatus("todo")
    expect(todoTasks.length).toBe(3) // Open task, Nested task, Project task

    const doneTasks = store.getTasksByStatus("done")
    expect(doneTasks.length).toBe(1)

    const multiStatus = store.getTasksByStatus(["todo", "wip"])
    expect(multiStatus.length).toBe(4) // 3 todo + 1 wip
  })

  test("should update node and write through to file", () => {
    const rootDir = createMemoryStoreTestRepo()
    using store = new MemoryStore(rootDir)

    // Find an open task
    const tasks = store.getAllTasks()
    const openTask = tasks.find((t) => t.content === "Open task")
    expect(openTask).toBeDefined()

    // Update to done
    store.updateNode(openTask!.id, {
      item: { task: { status: "done", marker: "[x]" } },
    })

    // Verify in-memory update
    const updatedTask = store.getNode(openTask!.id)
    expect(updatedTask!.item?.task?.status).toBe("done")

    // Verify write-through to file
    const fileContent = readFileSync(join(rootDir, "tasks.md"), "utf-8")
    expect(fileContent).toContain("- [x] Open task")
  })

  test("should update due_at and write through to file", () => {
    const rootDir = createMemoryStoreTestRepo()
    using store = new MemoryStore(rootDir)

    const tasks = store.getAllTasks()
    const openTask = tasks.find((t) => t.content === "Open task")
    expect(openTask).toBeDefined()

    // Set due_at
    store.updateNode(openTask!.id, { due_at: "2026-03-15" })

    // Verify in-memory update
    const updated = store.getNode(openTask!.id)
    expect(updated!.due_at).toBe("2026-03-15")

    // Verify write-through to file
    const fileContent = readFileSync(join(rootDir, "tasks.md"), "utf-8")
    expect(fileContent).toContain("due:2026-03-15")
  })

  test("should handle due_at with time component", () => {
    const rootDir = createMemoryStoreTestRepo()
    using store = new MemoryStore(rootDir)

    const tasks = store.getAllTasks()
    const openTask = tasks.find((t) => t.content === "Open task")
    expect(openTask).toBeDefined()

    // Set due_at with time
    store.updateNode(openTask!.id, { due_at: "2026-03-15T14:30" })

    // Should be readable with time included
    const updated = store.getNode(openTask!.id)
    expect(updated!.due_at).toBe("2026-03-15T14:30")
  })

  test("should clear due_at and remove from file", () => {
    const rootDir = createTestDir()
    writeFileSync(join(rootDir, "tasks.md"), `# Tasks\n\n- [ ] Task with date due:2026-03-15\n`)
    using store = new MemoryStore(rootDir)

    const tasks = store.getAllTasks()
    const task = tasks.find((t) => t.content?.includes("Task with date"))
    expect(task).toBeDefined()
    expect(task!.due_at).toBe("2026-03-15")

    // Clear the date
    store.updateNode(task!.id, { due_at: null } as unknown as Partial<KNode>)

    const updated = store.getNode(task!.id)
    expect(updated!.due_at).toBeUndefined()

    // File should no longer contain the date
    const fileContent = readFileSync(join(rootDir, "tasks.md"), "utf-8")
    expect(fileContent).not.toContain("due:2026-03-15")
  })

  test("should update existing emoji date in file", () => {
    const rootDir = createTestDir()
    writeFileSync(join(rootDir, "tasks.md"), `# Tasks\n\n- [ ] Task with emoji 📅 2026-01-01\n`)
    using store = new MemoryStore(rootDir)

    const tasks = store.getAllTasks()
    const task = tasks.find((t) => t.content?.includes("Task with emoji"))
    expect(task).toBeDefined()

    // Update to new date
    store.updateNode(task!.id, { due_at: "2026-06-15" })

    const fileContent = readFileSync(join(rootDir, "tasks.md"), "utf-8")
    expect(fileContent).toContain("📅 2026-06-15")
    expect(fileContent).not.toContain("2026-01-01")
  })

  test("should refresh and rescan filesystem", () => {
    const rootDir = createMemoryStoreTestRepo()
    using store = new MemoryStore(rootDir)

    const initialTasks = store.getAllTasks()
    expect(initialTasks.length).toBe(5)

    // Add a new task to the file
    const tasksPath = join(rootDir, "tasks.md")
    const content = readFileSync(tasksPath, "utf-8")
    writeFileSync(tasksPath, content + "\n- [ ] New task\n")

    // Refresh
    store.refresh()

    const refreshedTasks = store.getAllTasks()
    expect(refreshedTasks.length).toBe(6)
  })
})

// NOTE: DiskStore tests removed - use createRepo() for disk mode
// NOTE: Mode detection tests removed - use createRepo() for automatic mode detection
