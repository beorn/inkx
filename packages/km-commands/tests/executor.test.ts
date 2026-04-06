/**
 * Executor Tests
 *
 * Tests for command execution and context building.
 */

import { describe, it, expect, beforeEach } from "vitest"
import { executeCommand, buildContext } from "../src/executor.ts"
import { registerCommand, registerCommands, clearRegistry } from "../src/registry.ts"
import type { CommandDef, CommandContext, TNode, ViewMode } from "../src/types.ts"

// Helper to create minimal TNode
function createNode(id: string, children: TNode[] = [], opts?: Partial<TNode>): TNode {
  return {
    id,
    type: "h",
    item: {},
    parent_id: null,
    parent_idx: 0,
    symlink_to: null,
    name: id,
    title: id,
    children,
    childCount: children.length,
    childrenLoaded: true,
    isTask: false,
    depth: 0,
    data: {},
    created_at: 0,
    updated_at: 0,
    version: "",
    ...opts,
  }
}

// Helper to create minimal CommandContext
function createContext(overrides: Partial<CommandContext> = {}): CommandContext {
  return {
    currentNode: null,
    currentNodeId: null,
    selectedNodes: [],
    viewMode: "cards",
    siblingCount: 0,
    siblingIndex: 0,
    columnIndex: 0,
    columnCount: 0,
    moveMode: false,
    foldDepths: new Map(),
    ...overrides,
  }
}

describe("executeCommand", () => {
  beforeEach(() => {
    clearRegistry()
  })

  it("returns null for unknown command id", () => {
    const ctx = createContext()
    const result = executeCommand("nonexistent_cmd", ctx)

    expect(result).toBeNull()
  })

  it("executes registered command and returns action", () => {
    const testAction = { type: "CURSOR_MOVE" as const, dir: "next" as const }
    registerCommand({
      id: "test_cmd",
      name: "Test",
      description: "Test command",
      category: "Navigation",
      execute: () => testAction,
    })

    const ctx = createContext()
    const result = executeCommand("test_cmd", ctx)

    expect(result).toEqual(testAction)
  })

  it("passes context to command execute function", () => {
    let receivedCtx: CommandContext | null = null

    registerCommand({
      id: "capture_ctx",
      name: "Capture Context",
      description: "Captures context for testing",
      category: "Navigation",
      execute: (ctx) => {
        receivedCtx = ctx
        return null
      },
    })

    const testNode = createNode("test-node")
    const ctx = createContext({
      currentNode: testNode,
      currentNodeId: testNode.id,
      viewMode: "list",
    })

    executeCommand("capture_ctx", ctx)

    expect(receivedCtx).not.toBeNull()
    expect(receivedCtx!.viewMode).toBe("list")
    expect(receivedCtx!.currentNode).toEqual(testNode)
  })

  it("returns array of actions when command returns array", () => {
    const actions = [
      { type: "CURSOR_MOVE" as const, dir: "next" as const },
      { type: "SELECT_NODE_ADD" as const, nodeId: "node-1" },
    ]

    registerCommand({
      id: "multi_action",
      name: "Multi Action",
      description: "Returns multiple actions",
      category: "Selection",
      execute: () => actions,
    })

    const ctx = createContext()
    const result = executeCommand("multi_action", ctx)

    expect(result).toEqual(actions)
  })

  it("returns null when command execute returns null", () => {
    registerCommand({
      id: "null_cmd",
      name: "Null Command",
      description: "Returns null",
      category: "Navigation",
      execute: () => null,
    })

    const ctx = createContext()
    const result = executeCommand("null_cmd", ctx)

    expect(result).toBeNull()
  })
})

describe("buildContext", () => {
  it("creates context with provided fields", () => {
    const testNode = createNode("test-node")
    const ctx = buildContext("cards", {
      currentNode: testNode,
      currentNodeId: testNode.id,
      selectedNodes: ["a", "b"],
      siblingCount: 5,
      siblingIndex: 2,
      columnIndex: 1,
      columnCount: 3,
      moveMode: false,
      foldDepths: new Map([["folded-1", 0]]),
    })

    expect(ctx.viewMode).toBe("cards")
    expect(ctx.currentNode).toEqual(testNode)
    expect(ctx.currentNodeId).toBe("test-node")
    expect(ctx.selectedNodes).toEqual(["a", "b"])
    expect(ctx.siblingCount).toBe(5)
    expect(ctx.siblingIndex).toBe(2)
    expect(ctx.columnIndex).toBe(1)
    expect(ctx.columnCount).toBe(3)
    expect(ctx.moveMode).toBe(false)
    expect(ctx.foldDepths.has("folded-1")).toBe(true)
  })

  it("includes viewMode", () => {
    const viewModes: ViewMode[] = ["cards", "list", "columns", "tabs"]

    for (const mode of viewModes) {
      const ctx = buildContext(mode, {
        currentNode: null,
        currentNodeId: null,
        selectedNodes: [],
        siblingCount: 0,
        siblingIndex: 0,
        columnIndex: 0,
        columnCount: 0,
        moveMode: false,
        foldDepths: new Map(),
      })
      expect(ctx.viewMode).toBe(mode)
    }
  })

  it("handles null currentNode", () => {
    const ctx = buildContext("cards", {
      currentNode: null,
      currentNodeId: null,
      selectedNodes: [],
      siblingCount: 0,
      siblingIndex: 0,
      columnIndex: 0,
      columnCount: 0,
      moveMode: false,
      foldDepths: new Map(),
    })

    expect(ctx.currentNode).toBeNull()
    expect(ctx.currentNodeId).toBeNull()
  })

  it("handles empty selectedNodes", () => {
    const ctx = buildContext("cards", {
      currentNode: null,
      currentNodeId: null,
      selectedNodes: [],
      siblingCount: 0,
      siblingIndex: 0,
      columnIndex: 0,
      columnCount: 0,
      moveMode: false,
      foldDepths: new Map(),
    })

    expect(ctx.selectedNodes).toEqual([])
  })
})
