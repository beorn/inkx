/**
 * Fixture DSL - Readable test data builders
 *
 * Build board fixtures with a declarative DSL:
 *
 * @example
 * const fixture = board("My Board", [
 *   column("To Do", [
 *     task("Task 1"),
 *     task("Task 2", { done: true }),
 *   ]),
 *   column("In Progress", [
 *     task("Task 3"),
 *   ]),
 *   column("Done", []),
 * ]);
 *
 * // Use with createFakeRepo for testing
 * const repo = createFakeRepo({ nodes: fixture.nodes });
 */

import type { KNode, NodeType, ItemData } from "@km/core"
import { ulid } from "ulid"

// =============================================================================
// Builder Types
// =============================================================================

interface NodeBuilder {
  _type: NodeType
  _item?: ItemData
  _title?: string
  _content?: string
  _done?: boolean
  _children?: NodeBuilder[]
}

/** Fixture data that can be passed to createFakeRepo */
export interface BoardFixture {
  nodes: KNode[]
}

// =============================================================================
// DSL Functions
// =============================================================================

/**
 * Create a board fixture with columns.
 */
export function board(title: string, columns: NodeBuilder[]): BoardFixture {
  const nodes: KNode[] = []
  const now = Date.now()

  // Create root file node
  const rootId = ulid()
  nodes.push(
    makeNode({
      id: rootId,
      type: "h",
      item: {},
      fstype: "mdfile",
      title,
      parent_id: null,
      parent_idx: 0,
      created_at: now,
      updated_at: now,
    }),
  )

  // Build columns and their children
  let colIdx = 0
  for (const col of columns) {
    buildNode(col, rootId, colIdx++, nodes, now)
  }

  return { nodes }
}

/**
 * Create a column (section).
 */
export function column(title: string, children: NodeBuilder[] = []): NodeBuilder {
  return {
    _type: "h",
    _item: {},
    _title: title,
    _children: children,
  }
}

/**
 * Create a task.
 */
export function task(content: string, opts?: { done?: boolean }): NodeBuilder {
  return {
    _type: "p",
    _item: {},
    _content: content,
    _done: opts?.done,
  }
}

/**
 * Create a section (for nested structure).
 */
export function section(title: string, children: NodeBuilder[] = []): NodeBuilder {
  return {
    _type: "h",
    _item: {},
    _title: title,
    _children: children,
  }
}

/**
 * Create a paragraph (body content).
 */
export function paragraph(content: string): NodeBuilder {
  return {
    _type: "p",
    _content: content,
  }
}

// =============================================================================
// Internal Helpers
// =============================================================================

function buildNode(builder: NodeBuilder, parentId: string, idx: number, nodes: KNode[], now: number): string {
  const id = ulid()

  const node = makeNode({
    id,
    type: builder._type,
    parent_id: parentId,
    parent_idx: idx,
    title: builder._title,
    content: builder._content,
    item: builder._item
      ? builder._type === "p"
        ? { list: "-", task: { marker: builder._done ? "[x]" : "[ ]", status: builder._done ? "done" : "todo" } }
        : {}
      : undefined,
    created_at: now,
    updated_at: now,
  })

  nodes.push(node)

  // Build children
  if (builder._children) {
    let childIdx = 0
    for (const child of builder._children) {
      buildNode(child, id, childIdx++, nodes, now)
    }
  }

  return id
}

function makeNode(partial: Partial<KNode> & { id: string; type: NodeType }): KNode {
  return {
    id: partial.id,
    type: partial.type,
    item: partial.item,
    fstype: partial.fstype,
    parent_id: partial.parent_id ?? null,
    parent_idx: partial.parent_idx ?? 0,
    symlink_to: null,
    title: partial.title,
    content: partial.content,
    data: {},
    created_at: partial.created_at ?? Date.now(),
    updated_at: partial.updated_at ?? Date.now(),
    version: "mock",
  }
}

// =============================================================================
// Pre-built Fixtures
// =============================================================================

/**
 * Simple board with 3 columns and a few tasks.
 */
export const SIMPLE_BOARD = board("Test Board", [
  column("To Do", [task("Task 1"), task("Task 2")]),
  column("In Progress", [task("Task 3")]),
  column("Done", [task("Task 4", { done: true })]),
])

/**
 * Board with nested sections.
 */
export const NESTED_BOARD = board("Nested Board", [
  column("Project A", [
    section("Phase 1", [task("Design"), task("Build")]),
    section("Phase 2", [task("Test"), task("Deploy")]),
  ]),
  column("Project B", [task("Simple task")]),
])

/**
 * Board with body content.
 */
export const BODY_CONTENT_BOARD = board("Body Content", [
  column("Column A", [paragraph("This is body content before tasks."), task("Task after body")]),
  column("Column B", [task("Regular task")]),
])
