/**
 * Position — a slot in the tree among a parent's children.
 *
 * SlateJS namespace pattern: interface Position + const Position with static helpers.
 * Pure data type — no repo dependencies. Repo-dependent helpers (resolve, nodeAt,
 * moveTo, toSortOrder) stay in km-tui/position-resolver.ts.
 */

/** A slot in the tree: a position among a parent's children. */
export interface Position {
  parentId: string
  childIdx: number // -1 = last, 0 = first
}

/** A node-like shape with the fields Position helpers need. */
type NodeLike = { id: string; parent_id: string | null; parent_idx: number }

// eslint-disable-next-line @typescript-eslint/no-redeclare -- SlateJS namespace pattern: interface + const
export const Position = {
  /** Position of a node — its current slot in its parent. Returns null for root nodes. */
  of(node: NodeLike): Position | null {
    if (!node.parent_id) return null
    return { parentId: node.parent_id, childIdx: node.parent_idx }
  },

  /** First child slot of a parent. */
  first(parentId: string): Position {
    return { parentId, childIdx: 0 }
  },

  /** Last child slot of a parent. */
  last(parentId: string): Position {
    return { parentId, childIdx: -1 }
  },

  /** Check if two positions are equal. */
  equals(a: Position, b: Position): boolean {
    return a.parentId === b.parentId && a.childIdx === b.childIdx
  },
} as const
