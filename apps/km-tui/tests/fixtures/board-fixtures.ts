/**
 * Board Test Fixtures
 *
 * Pure data factories for creating test state without database access.
 * These enable fast tests that don't need SQLite setup/teardown.
 */

import { ulid } from "ulid"
import type { KNode } from "@km/core"
import type { TUIBoardState, CardState, ColumnState } from "../../src/types.ts"
import { createEmptyState } from "../../src/state.ts"

/**
 * Create a test KNode with defaults
 */
export function createTestKNode(
  overrides: Partial<KNode> & { id?: string } = {},
): KNode {
  const id = overrides.id ?? ulid()
  return {
    id,
    type: overrides.type ?? "task",
    parent_id: overrides.parent_id ?? null,
    parent_idx: overrides.parent_idx ?? 0,
    content: overrides.content ?? `Test Node ${id.slice(0, 4)}`,
    data: overrides.data ?? {},
    link_to: overrides.link_to ?? null,
    created_at: overrides.created_at ?? Date.now(),
    updated_at: overrides.updated_at ?? Date.now(),
    version: overrides.version ?? "v1",
  }
}

/**
 * Create a CardState with children
 */
export function createCardState(
  nodeOverrides: Partial<KNode> = {},
  children: KNode[] = [],
): CardState {
  const node = createTestKNode(nodeOverrides)
  return { node, children }
}

/**
 * Create a ColumnState with cards
 */
export function createColumnState(
  nodeOverrides: Partial<KNode> = {},
  cards: CardState[] = [],
): ColumnState {
  const node = createTestKNode({
    type: "folder",
    ...nodeOverrides,
  })
  return { node, cards }
}

/**
 * Create a TUIBoardState with columns
 */
export function createBoardState(
  columns: ColumnState[] = [],
  overrides: Partial<TUIBoardState> = {},
): TUIBoardState {
  const base = createEmptyState()
  return {
    ...base,
    columns,
    rootId: overrides.rootId ?? (columns.length > 0 ? "root" : null),
    ...overrides,
  }
}

/**
 * Create a simple test board with columns and cards
 * Useful for testing navigation, rendering, etc.
 */
export function createSimpleTestBoard(): {
  state: TUIBoardState
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

  const card1 = createCardState({
    id: card1Id,
    parent_id: col1Id,
    content: "Task 1",
    type: "task",
  })

  const card2 = createCardState({
    id: card2Id,
    parent_id: col1Id,
    parent_idx: 1,
    content: "Task 2",
    type: "task",
  })

  const card3 = createCardState({
    id: card3Id,
    parent_id: col2Id,
    content: "Task 3",
    type: "task",
  })

  const col1 = createColumnState(
    { id: col1Id, parent_id: rootId, content: "Todo" },
    [card1, card2],
  )

  const col2 = createColumnState(
    { id: col2Id, parent_id: rootId, parent_idx: 1, content: "Done" },
    [card3],
  )

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
export function createNestedTestBoard(): {
  state: TUIBoardState
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
  const subCard1 = createCardState({
    id: subCard1Id,
    parent_id: subColId,
    content: "Sub-task 1",
    type: "task",
  })

  const subCard2 = createCardState({
    id: subCard2Id,
    parent_id: subColId,
    parent_idx: 1,
    content: "Sub-task 2",
    type: "task",
  })

  const card = createCardState(
    {
      id: cardId,
      parent_id: colId,
      content: "Card with children",
      type: "task",
    },
    // Children shown in card view (not as columns yet)
    [
      createTestKNode({
        id: subCard1Id,
        parent_id: cardId,
        content: "Sub-task 1",
      }),
      createTestKNode({
        id: subCard2Id,
        parent_id: cardId,
        parent_idx: 1,
        content: "Sub-task 2",
      }),
    ],
  )

  const col = createColumnState(
    { id: colId, parent_id: rootId, content: "Column" },
    [card],
  )

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
export function createStatusTestBoard(): TUIBoardState {
  const col = createColumnState({ content: "Tasks" }, [
    createCardState({
      content: "Todo task",
      type: "task",
      data: { task_status: "todo" },
    }),
    createCardState({
      content: "In progress task",
      type: "task",
      data: { task_status: "wip" },
    }),
    createCardState({
      content: "Blocked task",
      type: "task",
      data: { task_status: "blocked" },
    }),
    createCardState({
      content: "Done task",
      type: "task",
      data: { task_status: "done" },
    }),
    createCardState({
      content: "Dropped task",
      type: "task",
      data: { task_status: "dropped" },
    }),
  ])

  return createBoardState([col])
}
