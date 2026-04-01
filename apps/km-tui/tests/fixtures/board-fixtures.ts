/**
 * Board Test Fixtures
 *
 * Pure data factories for creating test state without database access.
 * These enable fast tests that don't need SQLite setup/teardown.
 */

import { ulid } from "ulid"
import type { KNode } from "@km/core"
import type { InitialBoardData, ColumnView } from "../../src/types.ts"
import { createEmptyState } from "../../src/state.ts"

/**
 * Create a test KNode with defaults
 */
function createTestKNode(overrides: Partial<KNode> & { id?: string } = {}): KNode {
  const id = overrides.id ?? ulid()
  const type = overrides.type ?? "p"
  const isItemNode = overrides.item ?? (type === "p" || type === "h")
  return {
    id,
    type,
    ...(isItemNode ? { item: {} } : {}),
    ...(type === "p" && isItemNode ? { list_marker: "-" } : {}),
    parent_id: overrides.parent_id ?? null,
    parent_idx: overrides.parent_idx ?? 0,
    content: overrides.content ?? `Test Node ${id.slice(0, 4)}`,
    data: overrides.data ?? {},
    embed_source: overrides.embed_source ?? null,
    created_at: overrides.created_at ?? Date.now(),
    updated_at: overrides.updated_at ?? Date.now(),
    version: overrides.version ?? "v1",
    ...overrides,
  }
}

/**
 * Create a card KNode for testing (callers wrap with CardView fields as needed)
 */
export function createCardNode(nodeOverrides: Partial<KNode> = {}, _children: KNode[] = []): KNode {
  return createTestKNode(nodeOverrides)
}

/**
 * Create a ColumnView with card nodes
 */
export function createColumnView(nodeOverrides: Partial<KNode> = {}, cardNodes: KNode[] = []): ColumnView {
  const node = createTestKNode({
    type: "h",
    item: {},
    fstype: "folder",
    ...nodeOverrides,
  })
  return {
    node,
    cardNodes: cardNodes.map((c) => ({
      ...c,
      __cardView: true as const,
      isBody: false,
      isBrokenEmbed: false,
      hasBodyChildren: false,
    })),
  }
}

/**
 * Create a InitialBoardData with columns
 */
export function createBoardState(
  columns: ColumnView[] = [],
  overrides: Partial<InitialBoardData> = {},
): InitialBoardData {
  const base = createEmptyState()
  return {
    ...base,
    columns,
    rootId: overrides.rootId ?? (columns.length > 0 ? "test-root" : null),
    ...overrides,
  }
}

/**
 * Create a simple test board with columns and cards
 * Useful for testing navigation, rendering, etc.
 */
function createSimpleTestBoard(): {
  state: InitialBoardData
  nodeIds: {
    root: string
    col1: string
    col2: string
    card1: string
    card2: string
    card3: string
  }
} {
  const rootId = ulid()
  const col1Id = ulid()
  const col2Id = ulid()
  const card1Id = ulid()
  const card2Id = ulid()
  const card3Id = ulid()

  const card1 = createCardNode({
    id: card1Id,
    parent_id: col1Id,
    content: "Task 1",
    type: "p",
    item: {},
  })

  const card2 = createCardNode({
    id: card2Id,
    parent_id: col1Id,
    parent_idx: 1,
    content: "Task 2",
    type: "p",
    item: {},
  })

  const card3 = createCardNode({
    id: card3Id,
    parent_id: col2Id,
    content: "Task 3",
    type: "p",
    item: {},
  })

  const col1 = createColumnView({ id: col1Id, parent_id: rootId, content: "Todo" }, [card1, card2])

  const col2 = createColumnView({ id: col2Id, parent_id: rootId, parent_idx: 1, content: "Done" }, [card3])

  // Note: createCardNode returns KNode; createColumnView wraps with CardView fields

  return {
    state: createBoardState([col1, col2], { rootId }),
    nodeIds: {
      root: rootId,
      col1: col1Id,
      col2: col2Id,
      card1: card1Id,
      card2: card2Id,
      card3: card3Id,
    },
  }
}

/**
 * Create a nested board for zoom testing
 */
function createNestedTestBoard(): {
  state: InitialBoardData
  nodeIds: {
    root: string
    col: string
    card: string
    subCol: string
    subCard1: string
    subCard2: string
  }
} {
  const rootId = ulid()
  const colId = ulid()
  const cardId = ulid()
  const subColId = ulid()
  const subCard1Id = ulid()
  const subCard2Id = ulid()

  // The card has children that form a nested board when zoomed
  const _subCard1 = createCardNode({
    id: subCard1Id,
    parent_id: subColId,
    content: "Sub-task 1",
    type: "p",
    item: {},
  })

  const _subCard2 = createCardNode({
    id: subCard2Id,
    parent_id: subColId,
    parent_idx: 1,
    content: "Sub-task 2",
    type: "p",
    item: {},
  })

  const card = createCardNode({
    id: cardId,
    parent_id: colId,
    content: "Card with children",
    type: "p",
    item: {},
  })

  const col = createColumnView({ id: colId, parent_id: rootId, content: "Column" }, [card])

  return {
    state: createBoardState([col], { rootId }),
    nodeIds: {
      root: rootId,
      col: colId,
      card: cardId,
      subCol: subColId,
      subCard1: subCard1Id,
      subCard2: subCard2Id,
    },
  }
}

/**
 * Create a board state with task statuses for status icon testing
 */
function createStatusTestBoard(): InitialBoardData {
  const col = createColumnView({ content: "Tasks" }, [
    createCardNode({
      content: "Todo task",
      type: "p",
      item: { task: { status: "todo", marker: "[ ]" } },
    }),
    createCardNode({
      content: "In progress task",
      type: "p",
      item: { task: { status: "wip", marker: "[/]" } },
    }),
    createCardNode({
      content: "Blocked task",
      type: "p",
      item: { task: { status: "blocked", marker: "[!]" } },
    }),
    createCardNode({
      content: "Done task",
      type: "p",
      item: { task: { status: "done", marker: "[x]" } },
    }),
    createCardNode({
      content: "Dropped task",
      type: "p",
      item: { task: { status: "dropped", marker: "[-]" } },
    }),
  ])

  return createBoardState([col])
}
