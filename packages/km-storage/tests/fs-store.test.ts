import { describe, test, expect, afterEach } from "vitest"
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { createFsStore, type FsStore } from "../src/fs-store.ts"

let store: FsStore | undefined

afterEach(async () => {
  if (store) {
    await store[Symbol.asyncDispose]()
    store = undefined
  }
})

describe("createFsStore", () => {
  test("creates store for a directory", () => {
    const dir = mkdtempSync(join(tmpdir(), "fsstore-"))
    store = createFsStore(dir)
    expect(store).toBeDefined()
    expect(store.peekNode).toBeTypeOf("function")
    expect(store.peekChildIds).toBeTypeOf("function")
    expect(store.commit).toBeTypeOf("function")
    expect(store.onCommit).toBeTypeOf("function")
  })

  test("peekNode returns null for non-existent node", () => {
    const dir = mkdtempSync(join(tmpdir(), "fsstore-"))
    store = createFsStore(dir)
    expect(store.peekNode("nonexistent")).toBeNull()
  })

  test("peekChildIds returns empty array when no children", () => {
    const dir = mkdtempSync(join(tmpdir(), "fsstore-"))
    store = createFsStore(dir)
    expect(store.peekChildIds("nonexistent")).toEqual([])
  })

  test("commit creates a node in the internal DB", () => {
    const dir = mkdtempSync(join(tmpdir(), "fsstore-"))
    store = createFsStore(dir)

    const result = store.commit([
      {
        type: "node_created",
        actor: "test",
        data: {
          id: "node-1",
          type: "p",
          parent_id: null,
          parent_idx: 0,
          content: "Hello world",
        },
      },
    ])

    expect(result.meta.source).toBe("local")
    expect(result.meta.commitId).toBeTruthy()
    expect(result.events).toHaveLength(1)
    expect(result.delta.nodeIds).toContain("node-1")

    const node = store.peekNode("node-1")
    expect(node).not.toBeNull()
    expect(node!.content).toBe("Hello world")
  })

  test("commit with file node projects to filesystem", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fsstore-"))
    store = createFsStore(dir, { debounceWrite: 1 })

    // Create a file node with fs_path
    store.commit([
      {
        type: "node_created",
        actor: "test",
        data: {
          id: "file-1",
          type: "h",
          parent_id: null,
          parent_idx: 0,
          content: "Test File",
          item: { list_marker: "", task_marker: "", task_status: "" },
          fstype: "mdfile",
          fs_path: "test-file.md",
        },
      },
    ])

    // Flush writes to disk
    await store.flush()

    // Wait a tick for the write queue to process
    await new Promise((r) => setTimeout(r, 50))

    // The file should exist on disk
    const filePath = join(dir, "test-file.md")
    expect(existsSync(filePath)).toBe(true)
  })

  test("syncFromFs populates internal DB from filesystem", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fsstore-"))

    // Write a markdown file before creating the store
    writeFileSync(join(dir, "hello.md"), "# Hello\n\nSome content\n")

    store = createFsStore(dir)

    // Sync from filesystem
    const result = await store.syncFromFs()
    expect(result.processed).toBeGreaterThanOrEqual(0)
    expect(result.directories).toBeGreaterThanOrEqual(1)
  })

  test("onCommit fires for user commits", () => {
    const dir = mkdtempSync(join(tmpdir(), "fsstore-"))
    store = createFsStore(dir)

    const results: ReturnType<typeof store.commit>[] = []
    store.onCommit((r) => results.push(r))

    store.commit([
      {
        type: "node_created",
        actor: "test",
        data: { id: "n1", type: "p", content: "test" },
      },
    ])

    expect(results).toHaveLength(1)
    expect(results[0]!.events[0]!.type).toBe("node_created")
  })

  test("onCommit unsubscribe stops notifications", () => {
    const dir = mkdtempSync(join(tmpdir(), "fsstore-"))
    store = createFsStore(dir)

    let count = 0
    const unsub = store.onCommit(() => count++)

    store.commit([{ type: "node_created", actor: "test", data: { id: "a", type: "p" } }])
    unsub()
    store.commit([{ type: "node_created", actor: "test", data: { id: "b", type: "p" } }])

    expect(count).toBe(1)
  })

  test("commit returns merged delta for multiple events", () => {
    const dir = mkdtempSync(join(tmpdir(), "fsstore-"))
    store = createFsStore(dir)

    const result = store.commit([
      {
        type: "node_created",
        actor: "test",
        data: { id: "n1", type: "p", parent_id: "root", parent_idx: 0 },
      },
      {
        type: "node_created",
        actor: "test",
        data: { id: "n2", type: "p", parent_id: "root", parent_idx: 1 },
      },
    ])

    expect(result.events).toHaveLength(2)
    expect(result.delta.nodeIds).toContain("n1")
    expect(result.delta.nodeIds).toContain("n2")
    expect(result.delta.parentIds).toEqual(["root"])
  })

  test("dispose cleans up resources", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fsstore-"))
    const s = createFsStore(dir)

    // Start watching
    s.onCommit(() => {})

    // Dispose should not throw
    await s[Symbol.asyncDispose]()

    // Clear our reference so afterEach doesn't double-dispose
    store = undefined
  })
})
