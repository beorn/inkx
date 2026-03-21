import { describe, expect, it, beforeEach, afterEach } from "vitest"
import { mkdirSync, existsSync, writeFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

import type { WorkspaceState, PaneState, LayoutNode, BoardPaneState } from "../src/board-types.ts"
import type { Repo } from "../src/repo-context.tsx"
import { createEmptyFilterProperties } from "../src/ui-reducer.ts"
import {
  serializeWorkspace,
  parsePersistedWorkspace,
  saveWorkspace,
  loadWorkspace,
  listWorkspaces,
  deleteWorkspace,
  deserializeFilterProperties,
  type PersistedWorkspace,
  type PersistedFilterProperties,
} from "../src/workspace-persist.ts"

// =============================================================================
// Helpers
// =============================================================================

/**
 * Create a minimal mock repo for testing.
 * Maps rootId → fs_path via getNode().
 */
function makeMockRepo(nodeMap?: Map<string, { fs_path?: string }>): Repo {
  const nodes = nodeMap ?? new Map()
  return {
    getNode(id: string) {
      const data = nodes.get(id)
      if (!data) return null
      return { id, fs_path: data.fs_path } as ReturnType<Repo["getNode"]>
    },
  } as Repo
}

/** Create a minimal PaneState for testing (only fields needed for serialization). */
function makePaneState(
  id: string,
  opts?: {
    viewType?: "board" | "detail" | "empty"
    rootId?: string | null
    rootPath?: string | null
    viewMode?: "cards" | "list" | "columns" | "tabs"
    filterProperties?: import("../src/ui-reducer.ts").FilterProperties
  },
): BoardPaneState {
  return {
    id,
    viewType: (opts?.viewType ?? "board") as "board",
    rootId: opts?.rootId ?? null,
    rootPath: opts?.rootPath ?? null,
    cursorNodeId: null,
    selectedNodes: new Set(),
    foldDepths: new Map(),
    collapsedNodes: new Set(),
    navHistory: [],
    navHistoryIndex: 0,
    moveMode: false,
    moveSourceNodes: [],
    moveSourceCursorNodeId: null,
    curswantX: null,
    curswantY: null,
    viewMode: opts?.viewMode ?? "cards",
    filterProperties: opts?.filterProperties ?? createEmptyFilterProperties(),
    cursorStore: {
      getState: () => ({
        cursorNodeId: null,
        cursorCardNodeId: null,
        cursorColumnNodeId: null,
        selectionLevel: "board" as const,
      }),
      setState: () => {},
      subscribe: () => () => {},
    },
  } as unknown as BoardPaneState
}

const leaf = (id: string): LayoutNode => ({ type: "leaf", paneId: id })
const hsplit = (left: LayoutNode, right: LayoutNode, ratio = 0.5): LayoutNode => ({
  type: "split",
  direction: "h",
  ratio,
  left,
  right,
})
const vsplit = (left: LayoutNode, right: LayoutNode, ratio = 0.5): LayoutNode => ({
  type: "split",
  direction: "v",
  ratio,
  left,
  right,
})

function makeWorkspace(opts?: { panes?: PaneState[]; layout?: LayoutNode; focusedPaneId?: string }): WorkspaceState {
  const panes = opts?.panes ?? [makePaneState("main", { rootId: "node-tasks", rootPath: "/vault" })]
  const paneMap = new Map<string, PaneState>()
  for (const p of panes) paneMap.set(p.id, p)

  return {
    panes: paneMap,
    focusedPaneId: opts?.focusedPaneId ?? panes[0]!.id,
    previousFocusedPaneId: null,
    layout: opts?.layout ?? leaf(panes[0]!.id),
    preZoomLayout: null,
    preZoomPanes: null,
  }
}

/** Default mock repo that maps known node IDs to their fs_paths. */
const defaultNodeMap = new Map<string, { fs_path?: string }>([
  ["node-tasks", { fs_path: "tasks.md" }],
  ["node-notes", { fs_path: "notes.md" }],
  ["node-nopath", {}],
])
const defaultRepo = makeMockRepo(defaultNodeMap)

// Temp directory for file I/O tests
let tmpDir: string

beforeEach(() => {
  tmpDir = join(tmpdir(), `km-ws-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(tmpDir, { recursive: true })
})

afterEach(() => {
  try {
    rmSync(tmpDir, { recursive: true, force: true })
  } catch {
    // best-effort cleanup
  }
})

// =============================================================================
// serializeWorkspace
// =============================================================================

describe("serializeWorkspace", () => {
  it("serializes a single-pane workspace", () => {
    const ws = makeWorkspace()
    const result = serializeWorkspace(ws, "default", defaultRepo)

    expect(result.version).toBe(1)
    expect(result.name).toBe("default")
    expect(result.savedAt).toBeTruthy()
    expect(result.focusedPaneId).toBe("main")
    expect(result.layout).toEqual({ type: "leaf", paneId: "main" })
    expect(result.panes).toHaveLength(1)
    expect(result.panes[0]).toEqual({
      id: "main",
      viewType: "board",
      rootNodePath: "tasks.md",
      viewMode: "cards",
    })
  })

  it("serializes a multi-pane workspace with split layout", () => {
    const panes = [
      makePaneState("main", { rootId: "node-tasks", viewMode: "cards" }),
      makePaneState("pane-2", { rootId: "node-notes", viewMode: "list" }),
    ]
    const ws = makeWorkspace({
      panes,
      layout: hsplit(leaf("main"), leaf("pane-2"), 0.6),
      focusedPaneId: "pane-2",
    })

    const result = serializeWorkspace(ws, "deepwork", defaultRepo)

    expect(result.name).toBe("deepwork")
    expect(result.focusedPaneId).toBe("pane-2")
    expect(result.panes).toHaveLength(2)
    expect(result.panes.find((p) => p.id === "main")!.rootNodePath).toBe("tasks.md")
    expect(result.panes.find((p) => p.id === "pane-2")!.rootNodePath).toBe("notes.md")
    expect(result.layout).toEqual({
      type: "split",
      direction: "h",
      ratio: 0.6,
      left: { type: "leaf", paneId: "main" },
      right: { type: "leaf", paneId: "pane-2" },
    })
  })

  it("does not include session-specific state", () => {
    const pane = makePaneState("main", { rootId: "node-tasks" })
    pane.cursorNodeId = "cursor-123"
    pane.foldDepths = new Map([
      ["fold-1", 0],
      ["fold-2", 0],
    ])
    pane.selectedNodes = new Set(["sel-1"])
    pane.navHistory = [{ rootId: "old", rootPath: "old.md", cursorNodeId: "old-cursor" }]

    const ws = makeWorkspace({ panes: [pane] })
    const result = serializeWorkspace(ws, "test", defaultRepo)

    // PersistedPane should only have id, viewType, rootNodePath, viewMode
    const serializedPane = result.panes[0]!
    expect(Object.keys(serializedPane).sort()).toEqual(["id", "rootNodePath", "viewMode", "viewType"])
  })

  it("serializes empty pane (no rootId)", () => {
    const ws = makeWorkspace({
      panes: [makePaneState("main", { viewType: "empty", rootId: null })],
    })
    const result = serializeWorkspace(ws, "test", defaultRepo)

    expect(result.panes[0]!.rootNodePath).toBeNull()
    expect(result.panes[0]!.viewType).toBe("empty")
  })

  it("serializes pane with unknown rootId as null rootNodePath", () => {
    const ws = makeWorkspace({
      panes: [makePaneState("main", { rootId: "nonexistent-node" })],
    })
    const result = serializeWorkspace(ws, "test", defaultRepo)

    expect(result.panes[0]!.rootNodePath).toBeNull()
  })

  it("serializes pane where node has no fs_path as null rootNodePath", () => {
    const ws = makeWorkspace({
      panes: [makePaneState("main", { rootId: "node-nopath" })],
    })
    const result = serializeWorkspace(ws, "test", defaultRepo)

    expect(result.panes[0]!.rootNodePath).toBeNull()
  })

  it("serializes deeply nested layout", () => {
    const panes = [makePaneState("a"), makePaneState("b"), makePaneState("c"), makePaneState("d")]
    const layout = hsplit(vsplit(leaf("a"), leaf("b"), 0.3), vsplit(leaf("c"), leaf("d"), 0.7), 0.4)
    const ws = makeWorkspace({ panes, layout, focusedPaneId: "c" })
    const result = serializeWorkspace(ws, "complex", defaultRepo)

    expect(result.layout).toEqual({
      type: "split",
      direction: "h",
      ratio: 0.4,
      left: {
        type: "split",
        direction: "v",
        ratio: 0.3,
        left: { type: "leaf", paneId: "a" },
        right: { type: "leaf", paneId: "b" },
      },
      right: {
        type: "split",
        direction: "v",
        ratio: 0.7,
        left: { type: "leaf", paneId: "c" },
        right: { type: "leaf", paneId: "d" },
      },
    })
  })
})

// =============================================================================
// parsePersistedWorkspace
// =============================================================================

describe("parsePersistedWorkspace", () => {
  it("parses a valid workspace", () => {
    const data: PersistedWorkspace = {
      version: 1,
      name: "default",
      savedAt: "2026-02-22T12:00:00.000Z",
      layout: { type: "leaf", paneId: "main" },
      panes: [{ id: "main", viewType: "board", rootNodePath: "tasks.md", viewMode: "cards" }],
      focusedPaneId: "main",
    }

    const result = parsePersistedWorkspace(data)
    expect(result).toEqual(data)
  })

  it("returns null for null input", () => {
    expect(parsePersistedWorkspace(null)).toBeNull()
  })

  it("returns null for non-object input", () => {
    expect(parsePersistedWorkspace("string")).toBeNull()
    expect(parsePersistedWorkspace(42)).toBeNull()
  })

  it("returns null for wrong version", () => {
    expect(
      parsePersistedWorkspace({
        version: 2,
        name: "test",
        savedAt: "2026-01-01",
        layout: { type: "leaf", paneId: "main" },
        panes: [{ id: "main", viewType: "board", rootNodePath: null, viewMode: "cards" }],
        focusedPaneId: "main",
      }),
    ).toBeNull()
  })

  it("returns null when pane referenced in layout is missing from panes array", () => {
    expect(
      parsePersistedWorkspace({
        version: 1,
        name: "test",
        savedAt: "2026-01-01",
        layout: { type: "leaf", paneId: "missing" },
        panes: [{ id: "main", viewType: "board", rootNodePath: null, viewMode: "cards" }],
        focusedPaneId: "missing",
      }),
    ).toBeNull()
  })

  it("returns null when focusedPaneId is not in layout", () => {
    expect(
      parsePersistedWorkspace({
        version: 1,
        name: "test",
        savedAt: "2026-01-01",
        layout: { type: "leaf", paneId: "main" },
        panes: [
          { id: "main", viewType: "board", rootNodePath: null, viewMode: "cards" },
          { id: "other", viewType: "board", rootNodePath: null, viewMode: "cards" },
        ],
        focusedPaneId: "other",
      }),
    ).toBeNull()
  })

  it("returns null for invalid viewType", () => {
    expect(
      parsePersistedWorkspace({
        version: 1,
        name: "test",
        savedAt: "2026-01-01",
        layout: { type: "leaf", paneId: "main" },
        panes: [{ id: "main", viewType: "invalid", rootNodePath: null, viewMode: "cards" }],
        focusedPaneId: "main",
      }),
    ).toBeNull()
  })

  it("returns null for invalid viewMode", () => {
    expect(
      parsePersistedWorkspace({
        version: 1,
        name: "test",
        savedAt: "2026-01-01",
        layout: { type: "leaf", paneId: "main" },
        panes: [{ id: "main", viewType: "board", rootNodePath: null, viewMode: "invalid" }],
        focusedPaneId: "main",
      }),
    ).toBeNull()
  })

  it("returns null for invalid layout direction", () => {
    expect(
      parsePersistedWorkspace({
        version: 1,
        name: "test",
        savedAt: "2026-01-01",
        layout: {
          type: "split",
          direction: "z",
          ratio: 0.5,
          left: { type: "leaf", paneId: "a" },
          right: { type: "leaf", paneId: "b" },
        },
        panes: [
          { id: "a", viewType: "board", rootNodePath: null, viewMode: "cards" },
          { id: "b", viewType: "board", rootNodePath: null, viewMode: "cards" },
        ],
        focusedPaneId: "a",
      }),
    ).toBeNull()
  })

  it("returns null for out-of-range ratio", () => {
    expect(
      parsePersistedWorkspace({
        version: 1,
        name: "test",
        savedAt: "2026-01-01",
        layout: {
          type: "split",
          direction: "h",
          ratio: 0.0,
          left: { type: "leaf", paneId: "a" },
          right: { type: "leaf", paneId: "b" },
        },
        panes: [
          { id: "a", viewType: "board", rootNodePath: null, viewMode: "cards" },
          { id: "b", viewType: "board", rootNodePath: null, viewMode: "cards" },
        ],
        focusedPaneId: "a",
      }),
    ).toBeNull()
  })

  it("parses complex nested layout", () => {
    const data: PersistedWorkspace = {
      version: 1,
      name: "complex",
      savedAt: "2026-02-22T12:00:00.000Z",
      layout: {
        type: "split",
        direction: "h",
        ratio: 0.6,
        left: {
          type: "split",
          direction: "v",
          ratio: 0.5,
          left: { type: "leaf", paneId: "a" },
          right: { type: "leaf", paneId: "b" },
        },
        right: { type: "leaf", paneId: "c" },
      },
      panes: [
        { id: "a", viewType: "board", rootNodePath: "tasks.md", viewMode: "cards" },
        { id: "b", viewType: "detail", rootNodePath: null, viewMode: "list" },
        { id: "c", viewType: "empty", rootNodePath: null, viewMode: "columns" },
      ],
      focusedPaneId: "a",
    }

    const result = parsePersistedWorkspace(data)
    expect(result).toEqual(data)
  })

  it("returns null for missing panes array", () => {
    expect(
      parsePersistedWorkspace({
        version: 1,
        name: "test",
        savedAt: "2026-01-01",
        layout: { type: "leaf", paneId: "main" },
        focusedPaneId: "main",
      }),
    ).toBeNull()
  })
})

// =============================================================================
// Round-trip: serialize → parse
// =============================================================================

describe("round-trip", () => {
  it("single pane round-trips correctly", () => {
    const ws = makeWorkspace()
    const serialized = serializeWorkspace(ws, "default", defaultRepo)
    const parsed = parsePersistedWorkspace(serialized)
    expect(parsed).toEqual(serialized)
  })

  it("multi-pane with nested layout round-trips correctly", () => {
    const panes = [
      makePaneState("a", { rootId: "node-tasks", viewMode: "cards" }),
      makePaneState("b", { rootId: "node-notes", viewMode: "list" }),
      makePaneState("c", { viewType: "empty", viewMode: "columns" }),
    ]
    const layout = hsplit(vsplit(leaf("a"), leaf("b"), 0.3), leaf("c"), 0.7)
    const ws = makeWorkspace({ panes, layout, focusedPaneId: "b" })
    const serialized = serializeWorkspace(ws, "test", defaultRepo)
    const parsed = parsePersistedWorkspace(serialized)
    expect(parsed).toEqual(serialized)
  })
})

// =============================================================================
// File I/O: saveWorkspace / loadWorkspace
// =============================================================================

describe("saveWorkspace / loadWorkspace", () => {
  it("saves and loads a workspace", () => {
    const ws = makeWorkspace()
    saveWorkspace(ws, "default", tmpDir, defaultRepo)

    const loaded = loadWorkspace("default", tmpDir)
    expect(loaded).not.toBeNull()
    expect(loaded!.name).toBe("default")
    expect(loaded!.version).toBe(1)
    expect(loaded!.panes).toHaveLength(1)
    expect(loaded!.panes[0]!.rootNodePath).toBe("tasks.md")
  })

  it("creates .km/workspaces/ directory if missing", () => {
    const ws = makeWorkspace()
    saveWorkspace(ws, "test", tmpDir, defaultRepo)

    expect(existsSync(join(tmpDir, ".km", "workspaces", "test.json"))).toBe(true)
  })

  it("returns null for non-existent workspace", () => {
    expect(loadWorkspace("nope", tmpDir)).toBeNull()
  })

  it("returns null for corrupted JSON", () => {
    const dir = join(tmpDir, ".km", "workspaces")
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, "corrupt.json"), "not valid json{{{", "utf-8")

    expect(loadWorkspace("corrupt", tmpDir)).toBeNull()
  })

  it("returns null for valid JSON but invalid workspace structure", () => {
    const dir = join(tmpDir, ".km", "workspaces")
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, "bad.json"), JSON.stringify({ version: 99, stuff: true }), "utf-8")

    expect(loadWorkspace("bad", tmpDir)).toBeNull()
  })

  it("overwrites existing workspace on save", () => {
    const ws1 = makeWorkspace({
      panes: [makePaneState("main", { rootId: "node-tasks" })],
    })
    saveWorkspace(ws1, "default", tmpDir, defaultRepo)

    const ws2 = makeWorkspace({
      panes: [makePaneState("main", { rootId: "node-notes" })],
    })
    saveWorkspace(ws2, "default", tmpDir, defaultRepo)

    const loaded = loadWorkspace("default", tmpDir)
    expect(loaded!.panes[0]!.rootNodePath).toBe("notes.md")
  })

  it("sanitizes name to prevent path traversal", () => {
    const ws = makeWorkspace()
    saveWorkspace(ws, "../../../etc/passwd", tmpDir, defaultRepo)

    // Should create a safe filename, not traverse
    expect(existsSync(join(tmpDir, ".km", "workspaces", "_________etc_passwd.json"))).toBe(true)
    expect(existsSync("/etc/passwd.json")).toBe(false)
  })
})

// =============================================================================
// listWorkspaces
// =============================================================================

describe("listWorkspaces", () => {
  it("returns empty array when no workspaces directory", () => {
    expect(listWorkspaces(tmpDir)).toEqual([])
  })

  it("returns empty array when directory is empty", () => {
    mkdirSync(join(tmpDir, ".km", "workspaces"), { recursive: true })
    expect(listWorkspaces(tmpDir)).toEqual([])
  })

  it("lists saved workspaces sorted alphabetically", () => {
    const ws = makeWorkspace()
    saveWorkspace(ws, "deepwork", tmpDir, defaultRepo)
    saveWorkspace(ws, "morning", tmpDir, defaultRepo)
    saveWorkspace(ws, "default", tmpDir, defaultRepo)

    expect(listWorkspaces(tmpDir)).toEqual(["deepwork", "default", "morning"])
  })

  it("ignores non-JSON files", () => {
    const dir = join(tmpDir, ".km", "workspaces")
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, "notes.txt"), "not a workspace", "utf-8")
    writeFileSync(join(dir, "test.json"), "{}", "utf-8")

    expect(listWorkspaces(tmpDir)).toEqual(["test"])
  })
})

// =============================================================================
// deleteWorkspace
// =============================================================================

describe("deleteWorkspace", () => {
  it("deletes an existing workspace", () => {
    const ws = makeWorkspace()
    saveWorkspace(ws, "test", tmpDir, defaultRepo)
    expect(loadWorkspace("test", tmpDir)).not.toBeNull()

    const result = deleteWorkspace("test", tmpDir)
    expect(result).toBe(true)
    expect(loadWorkspace("test", tmpDir)).toBeNull()
  })

  it("returns false for non-existent workspace", () => {
    expect(deleteWorkspace("nope", tmpDir)).toBe(false)
  })

  it("does not affect other workspaces", () => {
    const ws = makeWorkspace()
    saveWorkspace(ws, "keep", tmpDir, defaultRepo)
    saveWorkspace(ws, "remove", tmpDir, defaultRepo)

    deleteWorkspace("remove", tmpDir)
    expect(loadWorkspace("keep", tmpDir)).not.toBeNull()
    expect(listWorkspaces(tmpDir)).toEqual(["keep"])
  })
})

// =============================================================================
// Filter Properties Persistence
// =============================================================================

describe("filterProperties persistence", () => {
  it("serializes filterProperties with active filters", () => {
    const fp = createEmptyFilterProperties()
    fp.taskStatus = new Set(["done", "dropped"])
    const pane = makePaneState("main", { rootId: "node-tasks", filterProperties: fp })
    const ws = makeWorkspace({ panes: [pane] })
    const result = serializeWorkspace(ws, "test", defaultRepo)

    expect(result.panes[0]!.filterProperties).toEqual({
      taskStatus: ["done", "dropped"],
    })
  })

  it("omits filterProperties when all filters are empty", () => {
    const ws = makeWorkspace()
    const result = serializeWorkspace(ws, "test", defaultRepo)

    expect(result.panes[0]!.filterProperties).toBeUndefined()
  })

  it("serializes multiple filter categories", () => {
    const fp = createEmptyFilterProperties()
    fp.taskStatus = new Set(["done"])
    fp.priority = new Set(["1", "2"])
    fp.dueDate = new Set(["overdue"])
    const pane = makePaneState("main", { rootId: "node-tasks", filterProperties: fp })
    const ws = makeWorkspace({ panes: [pane] })
    const result = serializeWorkspace(ws, "test", defaultRepo)

    expect(result.panes[0]!.filterProperties).toEqual({
      taskStatus: ["done"],
      priority: ["1", "2"],
      dueDate: ["overdue"],
    })
  })

  it("round-trips filterProperties through save/load", () => {
    const fp = createEmptyFilterProperties()
    fp.taskStatus = new Set(["done", "dropped"])
    fp.priority = new Set(["1"])
    const pane = makePaneState("main", { rootId: "node-tasks", filterProperties: fp })
    const ws = makeWorkspace({ panes: [pane] })

    saveWorkspace(ws, "filter-test", tmpDir, defaultRepo)
    const loaded = loadWorkspace("filter-test", tmpDir)

    expect(loaded).not.toBeNull()
    expect(loaded!.panes[0]!.filterProperties).toEqual({
      taskStatus: expect.arrayContaining(["done", "dropped"]),
      priority: ["1"],
    })
  })

  it("parses workspace without filterProperties (backwards compatible)", () => {
    const data: PersistedWorkspace = {
      version: 1,
      name: "old",
      savedAt: "2026-01-01T00:00:00.000Z",
      layout: { type: "leaf", paneId: "main" },
      panes: [{ id: "main", viewType: "board", rootNodePath: "tasks.md", viewMode: "cards" }],
      focusedPaneId: "main",
    }

    const result = parsePersistedWorkspace(data)
    expect(result).not.toBeNull()
    expect(result!.panes[0]!.filterProperties).toBeUndefined()
  })

  it("parses workspace with filterProperties", () => {
    const data = {
      version: 1,
      name: "filtered",
      savedAt: "2026-03-16T00:00:00.000Z",
      layout: { type: "leaf", paneId: "main" },
      panes: [
        {
          id: "main",
          viewType: "board",
          rootNodePath: "tasks.md",
          viewMode: "cards",
          filterProperties: { taskStatus: ["done"] },
        },
      ],
      focusedPaneId: "main",
    }

    const result = parsePersistedWorkspace(data)
    expect(result).not.toBeNull()
    expect(result!.panes[0]!.filterProperties).toEqual({ taskStatus: ["done"] })
  })

  it("ignores invalid filterProperties gracefully", () => {
    const data = {
      version: 1,
      name: "bad-filter",
      savedAt: "2026-03-16T00:00:00.000Z",
      layout: { type: "leaf", paneId: "main" },
      panes: [
        {
          id: "main",
          viewType: "board",
          rootNodePath: "tasks.md",
          viewMode: "cards",
          filterProperties: { taskStatus: [123, true], unknownField: "ignored" },
        },
      ],
      focusedPaneId: "main",
    }

    const result = parsePersistedWorkspace(data)
    expect(result).not.toBeNull()
    // taskStatus has non-string values, so it's dropped; unknownField is ignored
    expect(result!.panes[0]!.filterProperties).toBeUndefined()
  })
})

// =============================================================================
// deserializeFilterProperties
// =============================================================================

describe("deserializeFilterProperties", () => {
  it("returns empty FilterProperties for undefined input", () => {
    const fp = deserializeFilterProperties(undefined)
    expect(fp.taskStatus.size).toBe(0)
    expect(fp.priority.size).toBe(0)
    expect(fp.dueDate.size).toBe(0)
    expect(fp.assignedTo.size).toBe(0)
    expect(fp.nodeType.size).toBe(0)
  })

  it("converts arrays to Sets", () => {
    const persisted: PersistedFilterProperties = {
      taskStatus: ["done", "dropped"],
      priority: ["1"],
    }
    const fp = deserializeFilterProperties(persisted)

    expect(fp.taskStatus).toEqual(new Set(["done", "dropped"]))
    expect(fp.priority).toEqual(new Set(["1"]))
    expect(fp.dueDate).toEqual(new Set())
    expect(fp.assignedTo).toEqual(new Set())
    expect(fp.nodeType).toEqual(new Set())
  })

  it("handles all filter categories", () => {
    const persisted: PersistedFilterProperties = {
      taskStatus: ["todo"],
      priority: ["2", "3"],
      dueDate: ["overdue", "today"],
      assignedTo: ["alice"],
      nodeType: ["h", "p"],
    }
    const fp = deserializeFilterProperties(persisted)

    expect(fp.taskStatus).toEqual(new Set(["todo"]))
    expect(fp.priority).toEqual(new Set(["2", "3"]))
    expect(fp.dueDate).toEqual(new Set(["overdue", "today"]))
    expect(fp.assignedTo).toEqual(new Set(["alice"]))
    expect(fp.nodeType).toEqual(new Set(["h", "p"]))
  })
})
