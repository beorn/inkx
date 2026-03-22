/**
 * E2E Round-Trip Feature Tests
 *
 * Verifies that ALL markdown features survive the full cycle:
 *   write file → parse → DB → serialize → write file → parse → verify
 *
 * This catches regressions where re-parsing a file loses data that was
 * originally set programmatically (e.g., embed_source from `km add`).
 */

import { describe, test, expect } from "vitest"
import { ulid } from "ulid"
import { writeFileSync, readFileSync } from "fs"
import { join } from "path"
import { SyncManager } from "../../src/watch/sync.ts"
import { getAllNodes, getSubtree, nodesToMarkdown, applyEventWithDb, withTestEnv } from "@km/storage"
import type { KNode } from "@km/core"

/** Create a SyncManager with test defaults */
function createSyncManager(db: import("bun:sqlite").Database, repoDir: string) {
  return new SyncManager({
    repoPath: repoDir,
    debounceFs: 0,
    debounceApply: 0,
    conflictStrategy: "fs_wins",
    useWorker: false,
    db,
  })
}

/** Write a .md file, sync to DB, serialize back, re-sync, return final nodes */
async function roundTrip(
  db: import("bun:sqlite").Database,
  repoDir: string,
  filename: string,
  content: string,
): Promise<{ nodes: KNode[]; fileContent: string }> {
  const filePath = join(repoDir, filename)
  const manager = createSyncManager(db, repoDir)

  // Step 1: Write → parse → DB
  writeFileSync(filePath, content)
  await manager.syncFromFs()

  // Step 2: DB → serialize → write
  await manager.syncToFs()

  // Step 3: Read what was written, re-parse → DB
  const written = readFileSync(filePath, "utf-8")
  await manager.syncFromFs()

  const nodes = getAllNodes(db)
  return { nodes, fileContent: written }
}

describe("E2E Round-Trip Features", () => {
  describe("task metadata", () => {
    test("task status and marks survive round-trip", () =>
      withTestEnv(async ({ repoDir, data }) => {
        const { nodes } = await roundTrip(
          data.database,
          repoDir,
          "tasks.md",
          "# Tasks\n\n- [ ] Todo item\n- [x] Done item\n- [/] WIP item\n",
        )

        const tasks = nodes.filter((n) => n.task_status != null)
        expect(tasks).toHaveLength(3)

        const todo = tasks.find((t) => t.content?.includes("Todo"))
        expect(todo?.task_status).toBe("todo")
        expect(todo?.task_marker).toBe("[ ]")

        const done = tasks.find((t) => t.content?.includes("Done"))
        expect(done?.task_status).toBe("done")
        expect(done?.task_marker).toBe("[x]")

        const wip = tasks.find((t) => t.content?.includes("WIP"))
        expect(wip?.task_status).toBe("wip")
        expect(wip?.task_marker).toBe("[/]")
      }))

    test("due date survives round-trip", () =>
      withTestEnv(async ({ repoDir, data }) => {
        const { nodes } = await roundTrip(data.database, repoDir, "due.md", "# Due\n\n- [ ] Pay bills 📅 2025-03-15\n")

        const task = nodes.find((n) => n.task_status != null)
        expect(task?.due_at).toBe("2025-03-15")
      }))

    test("scheduled date survives round-trip", () =>
      withTestEnv(async ({ repoDir, data }) => {
        const { nodes } = await roundTrip(
          data.database,
          repoDir,
          "scheduled.md",
          "# Scheduled\n\n- [ ] Meeting prep ⏳ 2025-03-10\n",
        )

        const task = nodes.find((n) => n.task_status != null)
        expect(task?.start_at).toBe("2025-03-10")
      }))

    test("priority survives round-trip", () =>
      withTestEnv(async ({ repoDir, data }) => {
        const { nodes } = await roundTrip(
          data.database,
          repoDir,
          "priority.md",
          "# Priority\n\n- [ ] Urgent priority:: P1\n- [ ] High priority:: P2\n- [ ] Low priority:: P3\n",
        )

        const tasks = nodes.filter((n) => n.task_status != null)
        const urgent = tasks.find((t) => t.content?.includes("Urgent"))
        expect(urgent?.priority).toBe("P1")

        const high = tasks.find((t) => t.content?.includes("High"))
        expect(high?.priority).toBe("P2")

        const low = tasks.find((t) => t.content?.includes("Low"))
        expect(low?.priority).toBe("P3")
      }))
  })

  describe("section rules", () => {
    test("heading rules survive round-trip", () =>
      withTestEnv(async ({ repoDir, data }) => {
        const { nodes, fileContent } = await roundTrip(
          data.database,
          repoDir,
          "rules.md",
          "# Board\n\n## Todo km.add:: status:todo km.limit:: 5\n\n- [ ] First task\n",
        )

        // Rules should be in file content
        expect(fileContent).toContain("km.add:: status:todo")
        expect(fileContent).toContain("km.limit:: 5")

        // Section node should have rules in data
        const section = nodes.find((n) => n.type === "h" && n.item === true && n.fstype === "mdsection")
        expect(section?.title).toBe("Todo")
        expect(section?.data?.rules).toBeDefined()
      }))
  })

  describe("frontmatter", () => {
    test("YAML frontmatter survives round-trip", () =>
      withTestEnv(async ({ repoDir, data }) => {
        const { nodes, fileContent } = await roundTrip(
          data.database,
          repoDir,
          "frontmatter.md",
          "---\ntags:\n  - project\n  - active\nauthor: test\n---\n# Doc\n\nContent here.\n",
        )

        // File should still have frontmatter
        expect(fileContent).toContain("---")
        expect(fileContent).toContain("tags:")

        // File node should have frontmatter data
        const fileNode = nodes.find(
          (n) => n.type === "h" && n.item === true && (n.fstype === "file" || n.fstype === "mdfile"),
        )
        expect(fileNode?.data?.tags).toContain("project")
        expect(fileNode?.data?.author).toBe("test")
      }))
  })

  describe("content types", () => {
    test("heading levels preserved", () =>
      withTestEnv(async ({ repoDir, data }) => {
        const { nodes, fileContent } = await roundTrip(
          data.database,
          repoDir,
          "headings.md",
          "# Title\n\n## Section A\n\n### Subsection\n\n## Section B\n\nParagraph.\n",
        )

        expect(fileContent).toContain("## Section A")
        expect(fileContent).toContain("### Subsection")
        expect(fileContent).toContain("## Section B")

        const sections = nodes.filter((n) => n.type === "h" && n.item === true && n.fstype === "mdsection")
        expect(sections).toHaveLength(3) // H2, H3, H2

        const h3 = sections.find((n) => n.content?.includes("Subsection"))
        expect(h3).toBeDefined()
        // H3 should be a child of an H2 section (tree structure encodes depth)
        const h2Parent = sections.find((s) => s.id === h3!.parent_id)
        expect(h2Parent).toBeDefined()
      }))

    test("code blocks with language tags preserved", () =>
      withTestEnv(async ({ repoDir, data }) => {
        const { fileContent, nodes } = await roundTrip(
          data.database,
          repoDir,
          "code.md",
          '# Code\n\n```typescript\nconst x = 42\n```\n\n```python\nprint("hello")\n```\n',
        )

        expect(fileContent).toContain("```typescript")
        expect(fileContent).toContain("const x = 42")
        expect(fileContent).toContain("```python")

        const codeNodes = nodes.filter((n) => n.type === "code")
        expect(codeNodes).toHaveLength(2)
        expect(codeNodes.some((n) => n.data?.lang === "typescript")).toBe(true)
        expect(codeNodes.some((n) => n.data?.lang === "python")).toBe(true)
      }))

    test("paragraphs preserved", () =>
      withTestEnv(async ({ repoDir, data }) => {
        const { fileContent } = await roundTrip(
          data.database,
          repoDir,
          "paragraphs.md",
          "# Notes\n\nFirst paragraph with some text.\n\nSecond paragraph here.\n",
        )

        expect(fileContent).toContain("First paragraph with some text.")
        expect(fileContent).toContain("Second paragraph here.")
      }))

    test("wikilinks in content preserved", () =>
      withTestEnv(async ({ repoDir, data }) => {
        const { fileContent } = await roundTrip(
          data.database,
          repoDir,
          "wikilinks.md",
          "# Links\n\n- [ ] See [[Target]] for details\n- [ ] Also [[Other|aliased link]]\n",
        )

        expect(fileContent).toContain("[[Target]]")
        expect(fileContent).toContain("[[Other|aliased link]]")
      }))

    test("node ordering preserved", () =>
      withTestEnv(async ({ repoDir, data }) => {
        const { nodes } = await roundTrip(
          data.database,
          repoDir,
          "order.md",
          "# Order\n\n- [ ] First\n- [ ] Second\n- [ ] Third\n",
        )

        const tasks = nodes.filter((n) => n.task_status != null).sort((a, b) => a.parent_idx - b.parent_idx)

        expect(tasks[0]?.content).toContain("First")
        expect(tasks[1]?.content).toContain("Second")
        expect(tasks[2]?.content).toContain("Third")
      }))
  })

  describe("embeddings (embed_source)", () => {
    test("embedding nodes survive re-parse after serialize", () =>
      withTestEnv(async ({ repoDir, data }) => {
        const manager = createSyncManager(data.database, repoDir)

        // Step 1: Create source file with tasks
        writeFileSync(join(repoDir, "source.md"), "# Source\n\n- [ ] Task Alpha\n- [ ] Task Beta\n")
        await manager.syncFromFs()

        // Find source tasks
        const allNodes = getAllNodes(data.database)
        const sourceFile = allNodes.find(
          (n) =>
            n.type === "h" &&
            n.item === true &&
            (n.fstype === "file" || n.fstype === "mdfile") &&
            n.fs_path?.includes("source"),
        )!
        const sourceTasks = allNodes.filter((n) => n.task_status != null && n.parent_id === sourceFile.id)
        expect(sourceTasks).toHaveLength(2)

        // Step 2: Create target file, sync it
        writeFileSync(join(repoDir, "target.md"), "# Target\n")
        await manager.syncFromFs()

        const targetFile = getAllNodes(data.database).find(
          (n) =>
            n.type === "h" &&
            n.item === true &&
            (n.fstype === "file" || n.fstype === "mdfile") &&
            n.fs_path?.includes("target"),
        )!

        // Step 3: Create embedding nodes programmatically (simulating `km add`)
        const taskAlpha = sourceTasks.find((t) => t.content?.includes("Alpha"))!
        applyEventWithDb(data.database, {
          type: "node_created",
          id: ulid(),
          actor: "test",
          ts: Date.now(),
          data: {
            id: "embed-alpha",
            type: "embed",
            parent_id: targetFile.id,
            parent_idx: 0,
            embed_source: taskAlpha.id,
            content: null,
            created_at: Date.now(),
            updated_at: Date.now(),
            version: "",
          },
        })

        // Verify embedding exists in DB
        const embedBefore = getAllNodes(data.database).find((n) => n.id === "embed-alpha")
        expect(embedBefore?.embed_source).toBe(taskAlpha.id)

        // Step 4: Serialize to filesystem (writes ![[source]] in target.md)
        await manager.syncToFs()

        // Verify file has embedding syntax
        const targetContent = readFileSync(join(repoDir, "target.md"), "utf-8")
        expect(targetContent).toContain("![[")

        // Step 5: Re-sync from filesystem (simulates reconcile after external edit)
        await manager.syncFromFs()

        // Step 6: ASSERT: embed_source is preserved
        const embedAfter = getAllNodes(data.database).find((n) => n.id === "embed-alpha")
        expect(embedAfter).toBeDefined()
        expect(embedAfter?.embed_source).toBe(taskAlpha.id)
      }))

    test("embedding with alias survives re-parse", () =>
      withTestEnv(async ({ repoDir, data }) => {
        const manager = createSyncManager(data.database, repoDir)

        // Create source
        writeFileSync(join(repoDir, "src.md"), "# Source\n\n- [ ] Original task\n")
        await manager.syncFromFs()

        const nodes = getAllNodes(data.database)
        const srcFile = nodes.find(
          (n) =>
            n.type === "h" &&
            n.item === true &&
            (n.fstype === "file" || n.fstype === "mdfile") &&
            n.fs_path?.includes("src"),
        )!
        const srcTask = nodes.find((n) => n.task_status != null && n.parent_id === srcFile.id)!

        // Create target with embedding
        writeFileSync(join(repoDir, "tgt.md"), "# Target\n")
        await manager.syncFromFs()

        const tgtFile = getAllNodes(data.database).find(
          (n) =>
            n.type === "h" &&
            n.item === true &&
            (n.fstype === "file" || n.fstype === "mdfile") &&
            n.fs_path?.includes("tgt"),
        )!

        // Create embedding with alias
        applyEventWithDb(data.database, {
          type: "node_created",
          id: ulid(),
          actor: "test",
          ts: Date.now(),
          data: {
            id: "embed-alias",
            type: "embed",
            parent_id: tgtFile.id,
            parent_idx: 0,
            embed_source: srcTask.id,
            name: "My Custom Name",
            content: null,
            created_at: Date.now(),
            updated_at: Date.now(),
            version: "",
          },
        })

        // Serialize → re-parse
        await manager.syncToFs()

        const content = readFileSync(join(repoDir, "tgt.md"), "utf-8")
        expect(content).toContain("![[")
        expect(content).toContain("My Custom Name")

        await manager.syncFromFs()

        // Both embed_source and name must survive
        const embed = getAllNodes(data.database).find((n) => n.id === "embed-alias")
        expect(embed?.embed_source).toBe(srcTask.id)
        expect(embed?.name).toBe("My Custom Name")
      }))
  })
})
