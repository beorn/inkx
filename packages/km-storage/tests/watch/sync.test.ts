/**
 * Sync Integration Tests
 *
 * Tests the full sync workflow from filesystem to database.
 * These tests catch issues like swapped arguments in emit functions.
 * Uses isolated test environments for parallel execution.
 */

import { describe, test, expect } from "vitest"
import { mkdirSync, existsSync, writeFileSync, readFileSync } from "fs"
import { join } from "path"

import { getNodeByPath, getAllNodes, getAncestors } from "@km/storage"

interface ParsedEvent {
  type: string
  actor: string
  data: Record<string, unknown>
}

import { SyncManager } from "../../src/watch/sync.ts"
import { withTestEnv } from "@km/storage"

describe("Sync Integration", () => {
  describe("syncFromFs", () => {
    test("should sync a simple markdown file to database", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const testFile = join(repoDir, "test.md")
        writeFileSync(
          testFile,
          `# Test Document

This is a paragraph.

- [ ] Open task
- [x] Completed task
`,
        )

        const manager = new SyncManager({
          db: db,
          repoPath: repoDir,
          debounceFs: 0,
          debounceApply: 0,
          conflictStrategy: "fs_wins",
        })

        const result = await manager.syncFromFs()
        expect(result.processed).toBeGreaterThan(0)

        const allNodes = getAllNodes(db)
        expect(allNodes.length).toBeGreaterThan(0)

        const fileNode = getNodeByPath(db, testFile)
        expect(fileNode).not.toBeNull()
        expect(fileNode!.type).toBe("file")
        expect(fileNode!.fs_path).toBe(testFile)

        const tasks = allNodes.filter((n) => n.type === "task")
        expect(tasks.length).toBe(2)

        const todoTask = tasks.find((t) => t.task_status === "todo")
        const doneTask = tasks.find((t) => t.task_status === "done")
        expect(todoTask).toBeDefined()
        expect(doneTask).toBeDefined()
      }))

    test("should sync files in subdirectories", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const subFolder = join(repoDir, "subfolder")
        mkdirSync(subFolder)

        const testFile = join(subFolder, "nested.md")
        writeFileSync(testFile, "# Nested File\n\nContent here.")

        const manager = new SyncManager({
          db: db,
          repoPath: repoDir,
          debounceFs: 0,
          debounceApply: 0,
          conflictStrategy: "fs_wins",
        })

        const result = await manager.syncFromFs()
        expect(result.processed).toBeGreaterThan(0)

        const allNodes = getAllNodes(db)
        const fileNodes = allNodes.filter((n) => n.type === "file")
        expect(fileNodes.length).toBeGreaterThan(0)

        const fileNode = fileNodes.find((n) => n.fs_path === testFile)
        expect(fileNode).toBeDefined()
      }))

    test("should sync file with frontmatter correctly", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const testFile = join(repoDir, "frontmatter.md")
        writeFileSync(
          testFile,
          `---
title: Test Document
type: daily
tags: [test, fixture]
---

# Content Section

Some content here.
`,
        )

        const manager = new SyncManager({
          db: db,
          repoPath: repoDir,
          debounceFs: 0,
          debounceApply: 0,
          conflictStrategy: "fs_wins",
        })

        await manager.syncFromFs()

        const fileNode = getNodeByPath(db, testFile)
        expect(fileNode).not.toBeNull()
        expect(fileNode!.type).toBe("file")
        expect(fileNode!.data).toBeDefined()
        expect(fileNode!.data.title).toBe("Test Document")
        expect(fileNode!.data.type).toBe("daily")
      }))

    test("should sync tasks with Obsidian metadata", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const testFile = join(repoDir, "tasks.md")
        writeFileSync(
          testFile,
          `# Task List

- [ ] Task with due date 📅 2025-03-15
- [ ] High priority task ⏫
- [ ] Task with scheduled date ⏳ 2025-03-10
- [x] Completed task
`,
        )

        const manager = new SyncManager({
          db: db,
          repoPath: repoDir,
          debounceFs: 0,
          debounceApply: 0,
          conflictStrategy: "fs_wins",
        })

        await manager.syncFromFs()

        const allNodes = getAllNodes(db)
        const tasks = allNodes.filter((n) => n.type === "task")

        expect(tasks.length).toBe(4)

        const dueTask = tasks.find((t) => t.due_date === "2025-03-15")
        expect(dueTask).toBeDefined()

        const highPriorityTask = tasks.find((t) => t.priority === 1)
        expect(highPriorityTask).toBeDefined()

        const scheduledTask = tasks.find(
          (t) => t.scheduled_date === "2025-03-10",
        )
        expect(scheduledTask).toBeDefined()
      }))

    test("should create nodes with valid IDs", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const testFile = join(repoDir, "ids.md")
        writeFileSync(testFile, "# Test\n\n- [ ] Task\n")

        const manager = new SyncManager({
          db: db,
          repoPath: repoDir,
          debounceFs: 0,
          debounceApply: 0,
          conflictStrategy: "fs_wins",
        })

        await manager.syncFromFs()

        const allNodes = getAllNodes(db)

        for (const node of allNodes) {
          expect(node.id).toBeDefined()
          expect(node.id.length).toBeGreaterThan(0)
          expect(node.id.length).toBe(26)
        }
      }))

    test("should create nodes with valid types", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const testFile = join(repoDir, "types.md")
        writeFileSync(
          testFile,
          `# Section

Paragraph text.

- [ ] Task
- List item

> Blockquote

\`\`\`javascript
code
\`\`\`
`,
        )

        const manager = new SyncManager({
          db: db,
          repoPath: repoDir,
          debounceFs: 0,
          debounceApply: 0,
          conflictStrategy: "fs_wins",
        })

        await manager.syncFromFs()

        const allNodes = getAllNodes(db)

        const validTypes = [
          "folder",
          "file",
          "section",
          "paragraph",
          "task",
          "ul",
          "ol",
          "quote",
          "code",
          "table",
          "hr",
          "html",
          "agent",
          "board",
        ]

        for (const node of allNodes) {
          expect(node.type).toBeDefined()
          expect(validTypes).toContain(node.type)
        }
      }))

    test("should handle nested task structure", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const testFile = join(repoDir, "nested-tasks.md")
        writeFileSync(
          testFile,
          `# Project

- [ ] Parent task
  - [ ] Child task 1
  - [x] Child task 2
`,
        )

        const manager = new SyncManager({
          db: db,
          repoPath: repoDir,
          debounceFs: 0,
          debounceApply: 0,
          conflictStrategy: "fs_wins",
        })

        await manager.syncFromFs()

        const allNodes = getAllNodes(db)
        const tasks = allNodes.filter((n) => n.type === "task")

        expect(tasks.length).toBe(3)
      }))
  })

  describe("Event format validation", () => {
    test("events should have actor as string, not object", () =>
      withTestEnv(async ({ repoDir, kmDir, db }) => {
        const testFile = join(repoDir, "event-test.md")
        writeFileSync(testFile, "# Test\n")

        const manager = new SyncManager({
          db,
          repoPath: repoDir,
          debounceFs: 0,
          debounceApply: 0,
          conflictStrategy: "fs_wins",
        })

        await manager.syncFromFs()

        const eventsPath = join(kmDir, "events.jsonl")

        if (existsSync(eventsPath)) {
          const content = readFileSync(eventsPath, "utf-8")
          const lines = content.trim().split("\n")

          for (const line of lines) {
            const event = JSON.parse(line) as ParsedEvent

            expect(typeof event.actor).toBe("string")
            expect(typeof event.data).toBe("object")

            if (event.type === "node_created") {
              expect(event.data.id).toBeDefined()
              expect(typeof event.data.id).toBe("string")
              expect(event.data.type).toBeDefined()
              expect(typeof event.data.type).toBe("string")
            }
          }
        }
      }))
  })

  describe("Folder hierarchy", () => {
    test("should create folder nodes for parent directories", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const subFolder = join(repoDir, "projects")
        const deepFolder = join(subFolder, "active")
        mkdirSync(deepFolder, { recursive: true })

        const testFile = join(deepFolder, "task.md")
        writeFileSync(testFile, "# Task\n\n- [ ] Do something\n")

        const manager = new SyncManager({
          db: db,
          repoPath: repoDir,
          debounceFs: 0,
          debounceApply: 0,
          conflictStrategy: "fs_wins",
        })

        await manager.syncFromFs()

        const allNodes = getAllNodes(db)

        const folderNodes = allNodes.filter((n) => n.type === "folder")
        expect(folderNodes.length).toBeGreaterThanOrEqual(2)

        const projectsFolder = getNodeByPath(db, subFolder)
        const activeFolder = getNodeByPath(db, deepFolder)

        expect(projectsFolder).not.toBeNull()
        expect(projectsFolder!.type).toBe("folder")

        expect(activeFolder).not.toBeNull()
        expect(activeFolder!.type).toBe("folder")
      }))

    test("should link files to their parent folder via parent_id", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const subFolder = join(repoDir, "docs")
        mkdirSync(subFolder)

        const testFile = join(subFolder, "readme.md")
        writeFileSync(testFile, "# Documentation\n\nSome content.\n")

        const manager = new SyncManager({
          db: db,
          repoPath: repoDir,
          debounceFs: 0,
          debounceApply: 0,
          conflictStrategy: "fs_wins",
        })

        await manager.syncFromFs()

        const fileNode = getNodeByPath(db, testFile)
        const folderNode = getNodeByPath(db, subFolder)

        expect(fileNode).not.toBeNull()
        expect(folderNode).not.toBeNull()

        expect(fileNode!.parent_id).toBe(folderNode!.id)
      }))

    test("should create parent chain from nested folders to repo root", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const level1 = join(repoDir, "level1")
        const level2 = join(level1, "level2")
        const level3 = join(level2, "level3")
        mkdirSync(level3, { recursive: true })

        const testFile = join(level3, "deep.md")
        writeFileSync(testFile, "# Deep File\n")

        const manager = new SyncManager({
          db: db,
          repoPath: repoDir,
          debounceFs: 0,
          debounceApply: 0,
          conflictStrategy: "fs_wins",
        })

        await manager.syncFromFs()

        const folder1 = getNodeByPath(db, level1)
        const folder2 = getNodeByPath(db, level2)
        const folder3 = getNodeByPath(db, level3)
        const file = getNodeByPath(db, testFile)

        expect(folder1).not.toBeNull()
        expect(folder2).not.toBeNull()
        expect(folder3).not.toBeNull()
        expect(file).not.toBeNull()

        expect(file!.parent_id).toBe(folder3!.id)
        expect(folder3!.parent_id).toBe(folder2!.id)
        expect(folder2!.parent_id).toBe(folder1!.id)
        expect(folder1!.parent_id).toBeNull()
      }))

    test("getAncestors should return full path from root to parent", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const subFolder = join(repoDir, "work")
        mkdirSync(subFolder)

        const testFile = join(subFolder, "tasks.md")
        writeFileSync(
          testFile,
          `# Project Tasks

## Sprint 1

- [ ] Complete the feature
`,
        )

        const manager = new SyncManager({
          db: db,
          repoPath: repoDir,
          debounceFs: 0,
          debounceApply: 0,
          conflictStrategy: "fs_wins",
        })

        await manager.syncFromFs()

        const allNodes = getAllNodes(db)
        const taskNode = allNodes.find((n) => n.type === "task")
        expect(taskNode).toBeDefined()

        const ancestors = getAncestors(db, taskNode!.id)

        expect(ancestors.length).toBeGreaterThanOrEqual(3)

        const folderAncestor = ancestors.find((a) => a.type === "folder")
        expect(folderAncestor).toBeDefined()
        expect(folderAncestor!.fs_path).toBe(subFolder)

        const fileAncestor = ancestors.find((a) => a.type === "file")
        expect(fileAncestor).toBeDefined()
        expect(fileAncestor!.fs_path).toBe(testFile)

        const sectionAncestors = ancestors.filter((a) => a.type === "section")
        expect(sectionAncestors.length).toBeGreaterThanOrEqual(1)
      }))

    test("should handle multiple files in same folder efficiently", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const subFolder = join(repoDir, "multi")
        mkdirSync(subFolder)

        writeFileSync(join(subFolder, "file1.md"), "# File 1\n")
        writeFileSync(join(subFolder, "file2.md"), "# File 2\n")
        writeFileSync(join(subFolder, "file3.md"), "# File 3\n")

        const manager = new SyncManager({
          db: db,
          repoPath: repoDir,
          debounceFs: 0,
          debounceApply: 0,
          conflictStrategy: "fs_wins",
        })

        await manager.syncFromFs()

        const allNodes = getAllNodes(db)

        const folderNodes = allNodes.filter(
          (n) => n.type === "folder" && n.fs_path === subFolder,
        )
        expect(folderNodes.length).toBe(1)

        const fileNodes = allNodes.filter(
          (n) => n.type === "file" && n.fs_path?.startsWith(subFolder),
        )
        expect(fileNodes.length).toBe(3)

        const folderId = folderNodes[0]!.id
        for (const file of fileNodes) {
          expect(file.parent_id).toBe(folderId)
        }
      }))
  })
})
