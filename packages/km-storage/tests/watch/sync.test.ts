/**
 * Sync Integration Tests
 *
 * Tests the full sync workflow from filesystem to database.
 * These tests catch issues like swapped arguments in emit functions.
 * Uses isolated test environments for parallel execution.
 */

import { describe, test, expect } from "vitest"
import { mkdirSync, existsSync, writeFileSync, readFileSync } from "fs"
import { join, relative } from "path"

import { getNodeByPath, getAllNodes, getAncestors } from "@km/storage"

/** Convert absolute path to relative (matching DB storage format) */
function toRel(repoDir: string, absPath: string): string {
  return relative(repoDir, absPath)
}

interface ParsedEvent {
  type: string
  actor: string
  data: Record<string, unknown>
}

import { withTestEnv } from "@km/storage"
import { createTestSync } from "./sync-test-helpers.ts"

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

        const manager = createTestSync(db, repoDir, {
          debounceFs: 0,
          debounceApply: 0,
          conflictStrategy: "fs_wins",
        })

        const result = await manager.syncFromFs()
        expect(result.processed).toBeGreaterThan(0)

        const allNodes = getAllNodes(db)
        expect(allNodes.length).toBeGreaterThan(0)

        const fileNode = getNodeByPath(db, toRel(repoDir, testFile))
        expect(fileNode).not.toBeNull()
        expect(fileNode!.type).toBe("h")
        expect(fileNode!.fs_path).toBe(toRel(repoDir, testFile))

        const tasks = allNodes.filter((n) => n.item?.task?.status != null)
        expect(tasks.length).toBe(2)

        const todoTask = tasks.find((t) => t.item?.task?.status === "todo")
        const doneTask = tasks.find((t) => t.item?.task?.status === "done")
        expect(todoTask).toBeDefined()
        expect(doneTask).toBeDefined()
      }))

    test("should sync files in subdirectories", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const subFolder = join(repoDir, "subfolder")
        mkdirSync(subFolder)

        const testFile = join(subFolder, "nested.md")
        writeFileSync(testFile, "# Nested File\n\nContent here.")

        const manager = createTestSync(db, repoDir, {
          debounceFs: 0,
          debounceApply: 0,
          conflictStrategy: "fs_wins",
        })

        const result = await manager.syncFromFs()
        expect(result.processed).toBeGreaterThan(0)

        const allNodes = getAllNodes(db)
        const fileNodes = allNodes.filter((n) => n.type === "h" && (n.fstype === "file" || n.fstype === "mdfile"))
        expect(fileNodes.length).toBeGreaterThan(0)

        const fileNode = fileNodes.find((n) => n.fs_path === toRel(repoDir, testFile))
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

        const manager = createTestSync(db, repoDir, {
          debounceFs: 0,
          debounceApply: 0,
          conflictStrategy: "fs_wins",
        })

        await manager.syncFromFs()

        const fileNode = getNodeByPath(db, toRel(repoDir, testFile))
        expect(fileNode).not.toBeNull()
        expect(fileNode!.type).toBe("h")
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
- [ ] High priority task priority:: P1
- [ ] Task with scheduled date ⏳ 2025-03-10
- [x] Completed task
`,
        )

        const manager = createTestSync(db, repoDir, {
          debounceFs: 0,
          debounceApply: 0,
          conflictStrategy: "fs_wins",
        })

        await manager.syncFromFs()

        const allNodes = getAllNodes(db)
        const tasks = allNodes.filter((n) => n.item?.task?.status != null)

        expect(tasks.length).toBe(4)

        const dueTask = tasks.find((t) => t.due_at === "2025-03-15")
        expect(dueTask).toBeDefined()

        const highPriorityTask = tasks.find((t) => t.priority === "P1")
        expect(highPriorityTask).toBeDefined()

        const scheduledTask = tasks.find((t) => t.start_at === "2025-03-10")
        expect(scheduledTask).toBeDefined()
      }))

    test("should create nodes with valid IDs", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const testFile = join(repoDir, "ids.md")
        writeFileSync(testFile, "# Test\n\n- [ ] Task\n")

        const manager = createTestSync(db, repoDir, {
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

        const manager = createTestSync(db, repoDir, {
          debounceFs: 0,
          debounceApply: 0,
          conflictStrategy: "fs_wins",
        })

        await manager.syncFromFs()

        const allNodes = getAllNodes(db)

        const validTypes = ["p", "h", "code", "quote", "table", "hr", "html", "math"]

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

        const manager = createTestSync(db, repoDir, {
          debounceFs: 0,
          debounceApply: 0,
          conflictStrategy: "fs_wins",
        })

        await manager.syncFromFs()

        const allNodes = getAllNodes(db)
        const tasks = allNodes.filter((n) => n.item?.task?.status != null)

        expect(tasks.length).toBe(3)
      }))
  })

  describe("Event format validation", () => {
    test("events should have actor as string, not object", () =>
      withTestEnv(async ({ repoDir, kmDir, db }) => {
        const testFile = join(repoDir, "event-test.md")
        writeFileSync(testFile, "# Test\n")

        const manager = createTestSync(db, repoDir, {
          debounceFs: 0,
          debounceApply: 0,
          conflictStrategy: "fs_wins",
        })

        await manager.syncFromFs()

        const changesPath = join(kmDir, "changes.jsonl")

        if (existsSync(changesPath)) {
          const content = readFileSync(changesPath, "utf-8")
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

        const manager = createTestSync(db, repoDir, {
          debounceFs: 0,
          debounceApply: 0,
          conflictStrategy: "fs_wins",
        })

        await manager.syncFromFs()

        const allNodes = getAllNodes(db)

        const folderNodes = allNodes.filter((n) => n.type === "h" && n.fstype === "folder")
        expect(folderNodes.length).toBeGreaterThanOrEqual(2)

        const projectsFolder = getNodeByPath(db, toRel(repoDir, subFolder))
        const activeFolder = getNodeByPath(db, toRel(repoDir, deepFolder))

        expect(projectsFolder).not.toBeNull()
        expect(projectsFolder!.type).toBe("h")

        expect(activeFolder).not.toBeNull()
        expect(activeFolder!.type).toBe("h")
      }))

    test("should link files to their parent folder via parent_id", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const subFolder = join(repoDir, "docs")
        mkdirSync(subFolder)

        const testFile = join(subFolder, "readme.md")
        writeFileSync(testFile, "# Documentation\n\nSome content.\n")

        const manager = createTestSync(db, repoDir, {
          debounceFs: 0,
          debounceApply: 0,
          conflictStrategy: "fs_wins",
        })

        await manager.syncFromFs()

        const fileNode = getNodeByPath(db, toRel(repoDir, testFile))
        const folderNode = getNodeByPath(db, toRel(repoDir, subFolder))

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

        const manager = createTestSync(db, repoDir, {
          debounceFs: 0,
          debounceApply: 0,
          conflictStrategy: "fs_wins",
        })

        await manager.syncFromFs()

        const folder1 = getNodeByPath(db, toRel(repoDir, level1))
        const folder2 = getNodeByPath(db, toRel(repoDir, level2))
        const folder3 = getNodeByPath(db, toRel(repoDir, level3))
        const file = getNodeByPath(db, toRel(repoDir, testFile))

        expect(folder1).not.toBeNull()
        expect(folder2).not.toBeNull()
        expect(folder3).not.toBeNull()
        expect(file).not.toBeNull()

        expect(file!.parent_id).toBe(folder3!.id)
        expect(folder3!.parent_id).toBe(folder2!.id)
        expect(folder2!.parent_id).toBe(folder1!.id)
        expect(folder1!.parent_id).toBe(".")
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

        const manager = createTestSync(db, repoDir, {
          debounceFs: 0,
          debounceApply: 0,
          conflictStrategy: "fs_wins",
        })

        await manager.syncFromFs()

        const allNodes = getAllNodes(db)
        const taskNode = allNodes.find((n) => n.item?.task?.status != null)
        expect(taskNode).toBeDefined()

        const ancestors = getAncestors(db, taskNode!.id)

        expect(ancestors.length).toBeGreaterThanOrEqual(3)

        const folderAncestor = ancestors.find((a) => a.type === "h" && a.fstype === "folder")
        expect(folderAncestor).toBeDefined()
        expect(folderAncestor!.fs_path).toBe(toRel(repoDir, subFolder))

        const fileAncestor = ancestors.find((a) => a.type === "h" && (a.fstype === "file" || a.fstype === "mdfile"))
        expect(fileAncestor).toBeDefined()
        expect(fileAncestor!.fs_path).toBe(toRel(repoDir, testFile))

        const sectionAncestors = ancestors.filter((a) => a.type === "h" && a.fstype === "mdsection")
        expect(sectionAncestors.length).toBeGreaterThanOrEqual(1)
      }))

    test("should handle multiple files in same folder efficiently", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const subFolder = join(repoDir, "multi")
        mkdirSync(subFolder)

        writeFileSync(join(subFolder, "file1.md"), "# File 1\n")
        writeFileSync(join(subFolder, "file2.md"), "# File 2\n")
        writeFileSync(join(subFolder, "file3.md"), "# File 3\n")

        const manager = createTestSync(db, repoDir, {
          debounceFs: 0,
          debounceApply: 0,
          conflictStrategy: "fs_wins",
        })

        await manager.syncFromFs()

        const allNodes = getAllNodes(db)

        const relSubFolder = toRel(repoDir, subFolder)
        const folderNodes = allNodes.filter(
          (n) => n.type === "h" && n.fstype === "folder" && n.fs_path === relSubFolder,
        )
        expect(folderNodes.length).toBe(1)

        const fileNodes = allNodes.filter(
          (n) =>
            n.type === "h" && (n.fstype === "file" || n.fstype === "mdfile") && n.fs_path?.startsWith(relSubFolder),
        )
        expect(fileNodes.length).toBe(3)

        const folderId = folderNodes[0]!.id
        for (const file of fileNodes) {
          expect(file.parent_id).toBe(folderId)
        }
      }))
  })

  describe("stop() flushes pending writes", () => {
    test("stop() writes pending changes to disk instead of dropping them", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const testFile = join(repoDir, "tasks.md")
        writeFileSync(
          testFile,
          `# Tasks

- [ ] Alpha
- [ ] Beta
`,
        )

        // Use a long debounce so writes stay pending until stop()
        const manager = createTestSync(db, repoDir, {
          debounceFs: 0,
          debounceApply: 60_000,
          conflictStrategy: "last_write_wins",
        })

        await manager.syncFromFs()

        // Find Alpha task and mark it done in DB
        const allNodes = getAllNodes(db)
        const alpha = allNodes.find((n) => n.content === "Alpha")
        expect(alpha).toBeDefined()

        db.run("UPDATE nodes SET task_status = 'done', updated_at = ? WHERE id = ?", [Date.now(), alpha!.id])

        // Apply event to trigger a writeQueue entry
        manager.applyChangeToFs({
          id: "test-stop-flush",
          ts: Date.now(),
          type: "node_updated",
          actor: "user",
          target: alpha!.id,
          data: { task_status: "done" },
        })

        // Stop immediately — pending write should be flushed, not dropped
        await manager.stop()

        // Verify the file on disk has the updated task status
        const content = readFileSync(testFile, "utf-8")
        expect(content).toContain("[x] Alpha")
        expect(content).toContain("[ ] Beta")
      }))
  })

  describe("formatting-only external edits", () => {
    test("formatting-only edit updates baseline hash but does not rewrite file", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const testFile = join(repoDir, "format-test.md")
        const originalContent = `# Tasks

- [ ] Alpha
- [ ] Beta
`
        writeFileSync(testFile, originalContent)

        const manager = createTestSync(db, repoDir, {
          debounceFs: 0,
          debounceApply: 0,
          conflictStrategy: "fs_wins",
        })

        // Initial sync
        await manager.syncFromFs()

        // Verify initial state
        const allNodes = getAllNodes(db)
        const tasks = allNodes.filter((n) => n.item?.task?.status != null)
        expect(tasks.length).toBe(2)

        // Snapshot node state before the formatting edit
        const nodesBefore = getAllNodes(db).map((n) => ({
          id: n.id,
          content: n.content,
          type: n.type,
          item: JSON.stringify(n.item),
          data: JSON.stringify(n.data),
        }))

        // Make a formatting-only change: add extra blank lines
        const formattedContent = `# Tasks


- [ ] Alpha

- [ ] Beta

`
        writeFileSync(testFile, formattedContent)

        // Re-sync
        await manager.syncFromFs()

        // Verify: nodes unchanged (no semantic edits)
        const nodesAfter = getAllNodes(db).map((n) => ({
          id: n.id,
          content: n.content,
          type: n.type,
          item: JSON.stringify(n.item),
          data: JSON.stringify(n.data),
        }))
        expect(nodesAfter).toEqual(nodesBefore)

        // Verify: file on disk still has the formatting edit (not rewritten)
        const diskContent = readFileSync(testFile, "utf-8")
        expect(diskContent).toBe(formattedContent)
      }))

    test("semantic edit after formatting-only edit is still detected", () =>
      withTestEnv(async ({ repoDir, db }) => {
        const testFile = join(repoDir, "semantic-after-format.md")
        writeFileSync(
          testFile,
          `# Tasks

- [ ] Alpha
- [ ] Beta
`,
        )

        const manager = createTestSync(db, repoDir, {
          debounceFs: 0,
          debounceApply: 0,
          conflictStrategy: "fs_wins",
        })

        // Initial sync
        await manager.syncFromFs()

        // Formatting-only edit
        writeFileSync(
          testFile,
          `# Tasks


- [ ] Alpha

- [ ] Beta

`,
        )
        await manager.syncFromFs()

        // Now make a semantic edit: mark Alpha as done
        writeFileSync(
          testFile,
          `# Tasks


- [x] Alpha

- [ ] Beta

`,
        )
        await manager.syncFromFs()

        // Verify: Alpha is now done in DB
        const allNodes = getAllNodes(db)
        const alpha = allNodes.find((n) => n.content === "Alpha")
        expect(alpha).toBeDefined()
        expect(alpha!.item?.task?.status).toBe("done")
      }))
  })

  describe("applyChangeToFs — node_created for section nodes", () => {
    test("creating a section node regenerates parent file", () =>
      withTestEnv(async ({ repoDir, db }) => {
        // Create a file with two sections
        const testFile = join(repoDir, "board.md")
        writeFileSync(
          testFile,
          `# Board

## Column A

- [ ] Task 1

## Column B

- [ ] Task 2
`,
        )

        const manager = createTestSync(db, repoDir, {
          debounceFs: 0,
          debounceApply: 0,
          conflictStrategy: "last_write_wins",
        })

        await manager.syncFromFs()

        // Find the file node
        const fileNode = getNodeByPath(db, toRel(repoDir, testFile))
        expect(fileNode).not.toBeNull()

        // Find Column A section
        const allNodes = getAllNodes(db)
        const colA = allNodes.find((n) => n.type === "h" && n.fstype === "mdsection" && n.content === "Column A")
        expect(colA).toBeDefined()

        // Simulate TUI creating a new section (like handleAddNodeAfter)
        const newSectionEvent = {
          id: "test-event-1",
          ts: Date.now(),
          type: "node_created" as const,
          actor: "user",
          data: {
            id: "new-section-1",
            type: "h",
            item: {},
            parent_id: fileNode!.id,
            parent_idx: (colA!.parent_idx ?? 0) + 0.5,
            content: "",
            data: {},
          },
        }

        // Insert the node into DB first (emitter normally does this)
        db.run(
          `INSERT INTO nodes (id, type, item, fstype, parent_id, parent_idx, content, data, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            "new-section-1",
            "h",
            1,
            "mdsection",
            fileNode!.id,
            (colA!.parent_idx ?? 0) + 0.5,
            "",
            JSON.stringify({ depth: 2 }),
            Date.now(),
            Date.now(),
          ],
        )

        // Apply the event to filesystem
        manager.applyChangeToFs(newSectionEvent)

        // Wait for debounced write queue to flush (debounceMs=0 still uses setTimeout)
        await new Promise((r) => setTimeout(r, 50))

        // Read the file — it should contain the new empty section
        const content = readFileSync(testFile, "utf-8")
        expect(content).toContain("## Column A")
        expect(content).toContain("## Column B")
        // The new section should be serialized at H2 level (not H1!)
        // Count H2 headings — should be 3 (Column A, new empty, Column B)
        const h2Matches = content.match(/^## /gm) ?? []
        expect(h2Matches.length).toBe(3)
        // No extra H1 headings (only "# Board")
        const h1Matches = content.match(/^# /gm) ?? []
        expect(h1Matches.length).toBe(1)
      }))
  })
})
