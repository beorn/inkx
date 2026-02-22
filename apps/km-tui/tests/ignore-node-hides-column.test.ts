/**
 * Bug: ignore_node at card level doesn't hide the column
 *
 * Bead: km-tui.hide-broken
 *
 * Root cause: handleIgnoreNode used `card?.node ?? col?.node`, so when cursor
 * was at card level it ignored the card node. But Board.tsx only filters at
 * column level (`isIgnored(ignoredPaths, col.node, repo)`), so the column
 * stayed visible. The cursor then moved to an adjacent column via SELECT,
 * creating a visual artifact the user reported as "big area selected."
 *
 * Fix: Always ignore at column level (`col?.node`), not card level.
 *
 * Note: ignore_node is unbound in v2 keybindings. Integration tests call
 * addIgnored directly to simulate the command behavior.
 */
import { describe, test, expect, afterEach } from "vitest"
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { KNode } from "@km/core"
import { createFakeRepo } from "@km/storage"
import { testEnvWithRepo } from "./helpers/board-test.ts"
import { addIgnored, computeIgnorePath, readBoardIgnored, isIgnored } from "../src/ignored.ts"

/**
 * Create production-like nodes with a file parent and mdsection columns.
 * This matches what km-markdown produces from a real .md file.
 */
function createRealisticNodes(repoPath: string): KNode[] {
  const now = Date.now()
  const base = {
    parent_idx: 0,
    embed_source: null,
    created_at: now,
    updated_at: now,
    version: "v1",
  } satisfies Partial<KNode>

  const fileNode: KNode = {
    ...base,
    id: "file-1",
    type: "h", item: true,
    fstype: "mdfile",
    fs_path: "tasks.md",
    name: "tasks",
    content: "Tasks",
    data: {},
    parent_id: null,
  }

  const col1: KNode = {
    ...base,
    id: "col1",
    type: "h", item: true,
    fstype: "mdsection",
    name: "todo",
    content: "Todo",
    data: { depth: 2 },
    parent_id: "file-1",
    parent_idx: 0,
  }

  const col2: KNode = {
    ...base,
    id: "col2",
    type: "h", item: true,
    fstype: "mdsection",
    name: "done",
    content: "Done",
    data: { depth: 2 },
    parent_id: "file-1",
    parent_idx: 1,
  }

  const taskA: KNode = {
    ...base,
    id: "task-a",
    type: "p", item: true,
    list_marker: "-",
    task_marker: "[ ]",
    task_status: "todo",
    content: "Task A",
    data: {},
    parent_id: "col1",
    parent_idx: 0,
  }

  const taskB: KNode = {
    ...base,
    id: "task-b",
    type: "p", item: true,
    list_marker: "-",
    task_marker: "[ ]",
    task_status: "todo",
    content: "Task B",
    data: {},
    parent_id: "col1",
    parent_idx: 1,
  }

  const taskC: KNode = {
    ...base,
    id: "task-c",
    type: "p", item: true,
    list_marker: "-",
    task_marker: "[x]",
    task_status: "done",
    content: "Task C",
    data: {},
    parent_id: "col2",
    parent_idx: 0,
  }

  return [fileNode, col1, col2, taskA, taskB, taskC]
}

describe("Bug: ignore_node should hide column (km-tui.hide-broken)", () => {
  let tmpDir: string | null = null

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true })
      tmpDir = null
    }
  })

  test("computeIgnorePath produces correct path for mdsection column node", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "km-ignore-test-"))
    const nodes = createRealisticNodes(tmpDir)
    const repo = createFakeRepo({ path: tmpDir, nodes })

    const col1 = repo.getNode("col1")!
    expect(col1).toBeTruthy()

    const ignorePath = computeIgnorePath(col1, repo)
    // mdsection node should produce "parentFile#slug" format
    expect(ignorePath).toBe("tasks.md#todo")
  })

  test("computeIgnorePath for card node differs from column node", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "km-ignore-test-"))
    const nodes = createRealisticNodes(tmpDir)
    const repo = createFakeRepo({ path: tmpDir, nodes })

    const taskA = repo.getNode("task-a")!
    const col1 = repo.getNode("col1")!

    const cardPath = computeIgnorePath(taskA, repo)
    const colPath = computeIgnorePath(col1, repo)

    // Card and column should produce different ignore paths
    expect(cardPath).not.toBe(colPath)
    // Card is nested: "tasks.md#todo/task-a"
    expect(cardPath).toBe("tasks.md#todo/task-a")
    // Column: "tasks.md#todo"
    expect(colPath).toBe("tasks.md#todo")
  })

  test("isIgnored matches column node after ignoring column (not card)", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "km-ignore-test-"))
    const nodes = createRealisticNodes(tmpDir)
    const repo = createFakeRepo({ path: tmpDir, nodes })

    const col1 = repo.getNode("col1")!
    const colPath = computeIgnorePath(col1, repo)!

    // Simulate writing the column's ignore path
    const ignoredPaths = new Set([colPath])
    expect(isIgnored(ignoredPaths, col1, repo)).toBe(true)
  })

  test("isIgnored does NOT match column node when card was ignored instead", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "km-ignore-test-"))
    const nodes = createRealisticNodes(tmpDir)
    const repo = createFakeRepo({ path: tmpDir, nodes })

    const taskA = repo.getNode("task-a")!
    const col1 = repo.getNode("col1")!
    const cardPath = computeIgnorePath(taskA, repo)!

    // If we wrote the card's path, the column should NOT match
    const ignoredPaths = new Set([cardPath])
    expect(isIgnored(ignoredPaths, col1, repo)).toBe(false)
  })

  test("ignoring column at card level writes column ignore path and hides column", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "km-ignore-test-"))
    const nodes = createRealisticNodes(tmpDir)
    const repo = createFakeRepo({ path: tmpDir, nodes })

    const { board, store } = testEnvWithRepo(repo, "file-1", {
      columns: 80,
      rows: 24,
    })

    // Verify initial state: both columns visible, cursor on first card
    const before = board.screenshot()
    expect(before).toContain("Todo")
    expect(before).toContain("Done")
    expect(before).toContain("Task A")

    // ignore_node is unbound in v2 keybindings — invoke addIgnored directly
    // to simulate what handleIgnoreNode does (always ignores at column level)
    const col1 = repo.getNode("col1")!
    const ignorePath = computeIgnorePath(col1, repo)!
    addIgnored(tmpDir, ignorePath)

    // Verify the .km/ignored file was written with the COLUMN path
    const ignoredFilePath = join(tmpDir, ".km", "ignored")
    expect(existsSync(ignoredFilePath)).toBe(true)
    const ignoredContent = readFileSync(ignoredFilePath, "utf-8")
    // Should contain column path (tasks.md#todo), NOT card path (tasks.md#todo/task-a)
    expect(ignoredContent).toContain("tasks.md#todo")
    expect(ignoredContent).not.toContain("tasks.md#todo/task-a")

    // Bump ignoreVersion to invalidate the readBoardIgnored memo cache,
    // then press a key to flush the React render tree
    store.getState().setUI((prev) => ({ ignoreVersion: prev.ignoreVersion + 1 }))
    board.press("l") // navigate right to trigger re-render

    // The "Todo" column header (§ Todo) should be hidden after ignoring.
    const after = board.screenshot()
    expect(after).not.toContain("§ Todo")
    // The "Done" column should still be visible
    expect(after).toContain("§ Done")
    expect(after).toContain("Task C")
  })

  test("ignoring column at header level also hides column", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "km-ignore-test-"))
    const nodes = createRealisticNodes(tmpDir)
    const repo = createFakeRepo({ path: tmpDir, nodes })

    const { board, store } = testEnvWithRepo(repo, "file-1", {
      columns: 80,
      rows: 24,
    })

    const headerView = board.screenshot()
    expect(headerView).toContain("Todo")

    // ignore_node is unbound in v2 keybindings — invoke addIgnored directly
    const col1 = repo.getNode("col1")!
    const ignorePath = computeIgnorePath(col1, repo)!
    addIgnored(tmpDir, ignorePath)

    // The .km/ignored file should exist with the column path
    const ignoredFilePath = join(tmpDir, ".km", "ignored")
    expect(existsSync(ignoredFilePath)).toBe(true)
    const ignoredContent = readFileSync(ignoredFilePath, "utf-8")
    expect(ignoredContent).toContain("tasks.md#todo")

    // Bump ignoreVersion to invalidate the readBoardIgnored memo cache,
    // then press a key to flush the React render tree
    store.getState().setUI((prev) => ({ ignoreVersion: prev.ignoreVersion + 1 }))
    board.press("l") // navigate to trigger re-render

    // The "Todo" column header (§ Todo) should be hidden
    const after = board.screenshot()
    expect(after).not.toContain("§ Todo")
    // The "Done" column should still be visible
    expect(after).toContain("§ Done")
  })
})
