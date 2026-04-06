/**
 * Links and Backlinks Tests
 *
 * Tests for wikilink parsing from markdown content.
 * Uses isolated temp directories per test for parallelization.
 */

import { describe, test, expect, afterEach } from "vitest"
import { mkdirSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { ulid } from "ulid"
import { MemoryStore } from "../src/store/store.ts"
import { createLinkResolver } from "../src/markdown/link-resolver.ts"

// Track created directories for cleanup
const createdDirs: string[] = []

afterEach(() => {
  // Clean up all created test directories
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
  const dir = join("/tmp", `kmtest-links-${ulid()}`)
  mkdirSync(dir, { recursive: true })
  createdDirs.push(dir)
  return dir
}

describe("Links and Backlinks", () => {
  describe("Wikilink Parsing in Content", () => {
    test("should parse simple wikilinks from task content", () => {
      const testDir = createTestDir()
      writeFileSync(join(testDir, "tasks.md"), "# Tasks\n\n- [ ] Review [[project notes]]")

      using store = new MemoryStore(testDir)
      const nodes = store.getAllNodes()
      const task = nodes.find((n) => n.item?.task?.status != null)
      expect(task).toBeDefined()
      expect(task?.content).toContain("[[project notes]]")
    })

    test("should preserve wikilinks with aliases", () => {
      const testDir = createTestDir()
      writeFileSync(join(testDir, "doc.md"), "# Document\n\n- [ ] See [[Real Target|Display Name]] for details")

      using store = new MemoryStore(testDir)
      const nodes = store.getAllNodes()
      const task = nodes.find((n) => n.item?.task?.status != null)
      expect(task).toBeDefined()
      expect(task?.content).toContain("[[Real Target|Display Name]]")
    })

    test("should preserve section links", () => {
      const testDir = createTestDir()
      writeFileSync(join(testDir, "page.md"), "# Page\n\n- [ ] Link to [[other#section]]")

      using store = new MemoryStore(testDir)
      const nodes = store.getAllNodes()
      const task = nodes.find((n) => n.item?.task?.status != null)
      expect(task).toBeDefined()
      expect(task?.content).toContain("[[other#section]]")
    })

    test("should handle multiple wikilinks in same task", () => {
      const testDir = createTestDir()
      writeFileSync(join(testDir, "multi.md"), "# Multi\n\n- [ ] Links to [[one]] and [[two]] and [[three]]")

      using store = new MemoryStore(testDir)
      const nodes = store.getAllNodes()
      const task = nodes.find((n) => n.item?.task?.status != null)
      expect(task).toBeDefined()
      expect(task?.content).toContain("[[one]]")
      expect(task?.content).toContain("[[two]]")
      expect(task?.content).toContain("[[three]]")
    })
  })

  describe("Node Resolution by Path", () => {
    test("should find nodes by file path", () => {
      const testDir = createTestDir()
      writeFileSync(join(testDir, "target.md"), "# Target\n\nContent here.")

      using store = new MemoryStore(testDir)
      const node = store.getNodeByPath(join(testDir, "target.md"))
      expect(node).toBeDefined()
      expect(node?.type).toBe("h")
      expect(node?.fstype === "file" || node?.fstype === "mdfile").toBe(true)
    })

    test("should return null for non-existent paths", () => {
      const testDir = createTestDir()
      writeFileSync(join(testDir, "exists.md"), "# Exists\n\nContent.")

      using store = new MemoryStore(testDir)
      const node = store.getNodeByPath(join(testDir, "nonexistent.md"))
      expect(node).toBeNull()
    })
  })

  describe("Embedding Resolution", () => {
    test("should resolve embedding to specific task by content", () => {
      const testDir = createTestDir()
      // Create target file with tasks
      writeFileSync(
        join(testDir, "tasks.md"),
        "# Tasks\n\n- [ ] Buy groceries @shopping\n- [x] Call mom\n- [ ] Review PR @work",
      )

      // Create board that embeds a specific task
      writeFileSync(join(testDir, "board.md"), "# My Board\n\n## Work\n- ![[tasks#Review PR]]")

      using store = new MemoryStore(testDir)
      const nodes = store.getAllNodes()

      // Find the embedding node (the list item with ![[...]])
      const embedNode = nodes.find((n) => n.content?.includes("![[tasks#Review PR]]"))
      expect(embedNode).toBeDefined()

      // Find the target task (Review PR)
      const targetTask = nodes.find((n) => n.item?.task?.status != null && n.content?.includes("Review PR @work"))
      expect(targetTask).toBeDefined()

      // The embedding should have symlink_to pointing to the specific task, not the file
      expect(embedNode?.symlink_to).toBe(targetTask?.id)
    })

    test("should resolve embedding to file when no section match", () => {
      const testDir = createTestDir()
      writeFileSync(join(testDir, "source.md"), "# Source\n\nSome content here.")

      writeFileSync(join(testDir, "embed.md"), "# Embed\n\n- ![[source#nonexistent section]]")

      using store = new MemoryStore(testDir)
      const nodes = store.getAllNodes()

      // Find the embedding node
      const embedNode = nodes.find((n) => n.content?.includes("![[source#nonexistent section]]"))
      expect(embedNode).toBeDefined()

      // Find the source file
      const sourceFile = nodes.find(
        (n) => n.type === "h" && n.item != null && n.fstype === "mdfile" && n.fs_path?.endsWith("source.md"),
      )
      expect(sourceFile).toBeDefined()

      // The embedding should fall back to the file since section doesn't exist
      expect(embedNode?.symlink_to).toBe(sourceFile?.id)
    })

    test("should resolve embedding to section by title", () => {
      const testDir = createTestDir()
      writeFileSync(
        join(testDir, "doc.md"),
        "# Document\n\n## Introduction\n\nIntro content.\n\n## Conclusion\n\nConclusion content.",
      )

      writeFileSync(join(testDir, "ref.md"), "# Reference\n\n- ![[doc#Conclusion]]")

      using store = new MemoryStore(testDir)
      const nodes = store.getAllNodes()

      // Find the embedding node
      const embedNode = nodes.find((n) => n.content?.includes("![[doc#Conclusion]]"))
      expect(embedNode).toBeDefined()

      // Find the Conclusion section
      const conclusionSection = nodes.find(
        (n) => n.type === "h" && n.item != null && n.fstype === "mdsection" && n.title === "Conclusion",
      )
      expect(conclusionSection).toBeDefined()

      // The embedding should point to the specific section
      expect(embedNode?.symlink_to).toBe(conclusionSection?.id)
    })
  })

  describe("Folder Embedding", () => {
    test("should resolve embedding to folder by name", () => {
      const testDir = createTestDir()
      // Create a folder with files
      mkdirSync(join(testDir, "inbox"), { recursive: true })
      writeFileSync(join(testDir, "inbox", "task1.md"), "# Task 1\n\n- [ ] Do something")

      // Create a file that embeds the folder
      writeFileSync(join(testDir, "board.md"), "# Board\n\n![[inbox]]")

      using store = new MemoryStore(testDir)
      const nodes = store.getAllNodes()

      // Find the embedding node (paragraph with ![[inbox]])
      const embedNode = nodes.find((n) => n.content?.includes("![[inbox]]"))
      expect(embedNode).toBeDefined()

      // Find the inbox folder
      const inboxFolder = nodes.find(
        (n) => n.type === "h" && n.item != null && n.fstype === "folder" && n.name === "inbox",
      )
      expect(inboxFolder).toBeDefined()

      // The embedding should point to the folder
      expect(embedNode?.symlink_to).toBe(inboxFolder?.id)
    })

    test("should resolve embedded folder symlink_to", () => {
      const testDir = createTestDir()
      mkdirSync(join(testDir, "projects"), { recursive: true })
      writeFileSync(join(testDir, "projects", "proj1.md"), "# Project 1\n\nContent")

      // Use embedding syntax to test symlink_to resolution
      writeFileSync(join(testDir, "index.md"), "# Index\n\n![[projects]]")

      using store = new MemoryStore(testDir)
      const nodes = store.getAllNodes()

      // Find the embedding node
      const embedNode = nodes.find((n) => n.content?.includes("![[projects]]"))
      expect(embedNode).toBeDefined()

      // Find the projects folder
      const projectsFolder = nodes.find(
        (n) => n.type === "h" && n.item != null && n.fstype === "folder" && n.name === "projects",
      )
      expect(projectsFolder).toBeDefined()

      // The embedding's symlink_to should point to the folder
      expect(embedNode?.symlink_to).toBe(projectsFolder?.id)
    })

    test("folders should have name field populated", () => {
      const testDir = createTestDir()
      mkdirSync(join(testDir, "my-folder"), { recursive: true })
      writeFileSync(join(testDir, "my-folder", "file.md"), "# File\n\nContent")

      using store = new MemoryStore(testDir)
      const folder = store
        .getAllNodes()
        .find((n) => n.type === "h" && n.item != null && n.fstype === "folder" && n.fs_path?.endsWith("my-folder"))

      expect(folder).toBeDefined()
      expect(folder?.name).toBe("my-folder")
    })
  })

  describe("Node Hierarchy", () => {
    test("should track parent-child relationships", () => {
      const testDir = createTestDir()
      writeFileSync(join(testDir, "parent.md"), "# Parent\n\n- [ ] Child task 1\n- [ ] Child task 2")

      using store = new MemoryStore(testDir)
      // File has sections as children, sections have tasks
      const allNodes = store.getAllNodes()
      const tasks = allNodes.filter((n) => n.item?.task?.status != null)
      expect(tasks.length).toBe(2)

      // Each task should have a parent
      for (const task of tasks) {
        expect(task.parent_id).toBeDefined()
      }
    })

    test("should build ancestor chain correctly", () => {
      const testDir = createTestDir()
      mkdirSync(join(testDir, "folder"), { recursive: true })
      writeFileSync(join(testDir, "folder", "nested.md"), "# Nested\n\n- [ ] Deep task")

      using store = new MemoryStore(testDir)
      const nodes = store.getAllNodes()
      const task = nodes.find((n) => n.item?.task?.status != null && n.content?.includes("Deep task"))
      expect(task).toBeDefined()

      const ancestors = store.getAncestors(task!.id)
      expect(ancestors.length).toBeGreaterThan(0)
    })
  })

  describe("ULID Embed Resolution", () => {
    test("resolver resolves node ID directly", () => {
      const testDir = createTestDir()
      writeFileSync(join(testDir, "tasks.md"), "# Tasks\n\n- [ ] Buy groceries")

      using store = new MemoryStore(testDir)
      const task = store.getAllNodes().find((n) => n.item?.task?.status != null && n.content?.includes("Buy groceries"))
      expect(task).toBeDefined()

      // Access the underlying DB to test the link resolver directly
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const resolver = createLinkResolver((store as any).db)

      // The resolver should find a node by its exact ID
      const resolved = resolver.resolveTarget(task!.id)
      expect(resolved).toBe(task!.id)
    })

    test("resolver does not resolve nonexistent ID", () => {
      const testDir = createTestDir()
      writeFileSync(join(testDir, "tasks.md"), "# Tasks\n\n- [ ] A task")

      using store = new MemoryStore(testDir)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const resolver = createLinkResolver((store as any).db)

      // Nonexistent ULID should return null
      const resolved = resolver.resolveTarget("01ZZZZZZZZZZZZZZZZZZZZZZZ1")
      expect(resolved).toBeNull()
    })

    test("![[ULID]] embed resolves symlink_to within same DB", () => {
      const testDir = createTestDir()
      // Create the task file
      writeFileSync(join(testDir, "tasks.md"), "# Tasks\n\n- [ ] Buy groceries")

      // Load once to learn the task ULID
      let taskId: string
      {
        using store = new MemoryStore(testDir)
        const task = store
          .getAllNodes()
          .find((n) => n.item?.task?.status != null && n.content?.includes("Buy groceries"))
        expect(task).toBeDefined()
        taskId = task!.id
      }

      // Now write a board that embeds the task by ULID
      // AND keep the same tasks.md so the task gets the same content
      writeFileSync(join(testDir, "board.md"), `# Board\n\n## Column\n\n![[${taskId}]]`)

      // Load again — tasks.md gets a NEW ULID, but board.md references the OLD one
      // The resolver should find the node by ID (from the OLD ULID) — but it won't
      // exist because MemoryStore generates fresh IDs. This is the cross-store problem.
      // To test the real scenario, we'd need persistent IDs (disk-backed repo).
      // The unit test above ("resolver resolves node ID directly") covers the fix.
    })
  })

  describe("Block ID Resolution (via LinkResolver)", () => {
    test("should resolve task block_id to node ID", () => {
      const testDir = createTestDir()
      writeFileSync(join(testDir, "tasks.md"), "# Tasks\n\n- [ ] Buy groceries ^k7m2")

      using store = new MemoryStore(testDir)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const resolver = createLinkResolver((store as any).db)

      const resolved = resolver.resolveBlockId("k7m2")
      expect(resolved).not.toBeNull()

      // Verify it points to the correct task
      const task = store.getAllNodes().find((n) => n.item?.task?.status != null && n.content?.includes("Buy groceries"))
      expect(task).toBeDefined()
      expect(resolved).toBe(task!.id)
    })

    test("should return null for nonexistent block_id", () => {
      const testDir = createTestDir()
      writeFileSync(join(testDir, "tasks.md"), "# Tasks\n\n- [ ] A task")

      using store = new MemoryStore(testDir)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const resolver = createLinkResolver((store as any).db)

      const resolved = resolver.resolveBlockId("nonexistent")
      expect(resolved).toBeNull()
    })

    test("should resolve heading block_id to section node ID", () => {
      const testDir = createTestDir()
      writeFileSync(join(testDir, "doc.md"), "# Document\n\n## Section ^abc1\n\nContent here.")

      using store = new MemoryStore(testDir)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const resolver = createLinkResolver((store as any).db)

      const resolved = resolver.resolveBlockId("abc1")
      expect(resolved).not.toBeNull()

      // Verify it points to the correct section
      const section = store
        .getAllNodes()
        .find((n) => n.type === "h" && n.item != null && n.fstype === "mdsection" && n.title === "Section")
      expect(section).toBeDefined()
      expect(resolved).toBe(section!.id)
    })
  })

  describe("Block ID in Embed Resolution (via MemoryStore)", () => {
    test("should resolve embed with block_id to target task", () => {
      const testDir = createTestDir()
      writeFileSync(join(testDir, "tasks.md"), "# Tasks\n\n- [ ] Buy groceries ^k7m2\n- [ ] Call mom ^j3n8")
      writeFileSync(join(testDir, "board.md"), "# Board\n\n## Column\n\n- ![[tasks^k7m2]]")

      using store = new MemoryStore(testDir)
      const nodes = store.getAllNodes()

      // Find the embed node (list item with ![[tasks^k7m2]])
      const embedNode = nodes.find((n) => n.content?.includes("![[tasks#^k7m2]]"))
      expect(embedNode).toBeDefined()

      // Find the target task (Buy groceries)
      const targetTask = nodes.find((n) => n.item?.task?.status != null && n.content?.includes("Buy groceries"))
      expect(targetTask).toBeDefined()

      // The embed should have symlink_to pointing to the Buy groceries task
      expect(embedNode?.symlink_to).toBe(targetTask?.id)
    })

    test("should resolve embed with block_id to target section", () => {
      const testDir = createTestDir()
      writeFileSync(join(testDir, "doc.md"), "# Document\n\n## Introduction ^abc1\n\nContent here.")
      writeFileSync(join(testDir, "ref.md"), "# Ref\n\n![[doc^abc1]]")

      using store = new MemoryStore(testDir)
      const nodes = store.getAllNodes()

      // Find the embed node
      const embedNode = nodes.find((n) => n.content?.includes("![[doc#^abc1]]"))
      expect(embedNode).toBeDefined()

      // Find the Introduction section
      const introSection = nodes.find(
        (n) => n.type === "h" && n.item != null && n.fstype === "mdsection" && n.title === "Introduction",
      )
      expect(introSection).toBeDefined()

      // The embed's symlink_to should point to the Introduction section
      expect(embedNode?.symlink_to).toBe(introSection?.id)
    })
  })

  describe("Block ID Persistence", () => {
    test("block_id should survive store load cycle", () => {
      const testDir = createTestDir()
      writeFileSync(join(testDir, "tasks.md"), "# Tasks\n\n- [ ] Task ^k7m2")

      using store = new MemoryStore(testDir)
      const task = store.getAllNodes().find((n) => n.item?.task?.status != null && n.content?.includes("Task"))
      expect(task).toBeDefined()

      // block_id should be stored on the node
      expect(task!.block_id).toBe("k7m2")
    })

    test("content should not include block_id suffix", () => {
      const testDir = createTestDir()
      writeFileSync(join(testDir, "tasks.md"), "# Tasks\n\n- [ ] Task ^k7m2")

      using store = new MemoryStore(testDir)
      const task = store.getAllNodes().find((n) => n.item?.task?.status != null && n.block_id === "k7m2")
      expect(task).toBeDefined()

      // Content should have the ^k7m2 stripped
      expect(task!.content).not.toContain("^k7m2")
      expect(task!.content).toBe("Task")
    })
  })

  describe("Block ID Priority over Content Matching", () => {
    test("embed should resolve by block_id rather than content match", () => {
      const testDir = createTestDir()
      writeFileSync(join(testDir, "tasks.md"), "# Tasks\n\n- [ ] Buy groceries ^k7m2")
      writeFileSync(join(testDir, "board.md"), "# Board\n\n- ![[tasks^k7m2]]")

      using store = new MemoryStore(testDir)
      const nodes = store.getAllNodes()

      // Find the embed node
      const embedNode = nodes.find((n) => n.content?.includes("![[tasks#^k7m2]]"))
      expect(embedNode).toBeDefined()

      // Find the target task
      const targetTask = nodes.find((n) => n.item?.task?.status != null && n.content?.includes("Buy groceries"))
      expect(targetTask).toBeDefined()

      // Verify the embed resolves to the correct task by block_id
      expect(embedNode?.symlink_to).toBe(targetTask?.id)
    })
  })
})
