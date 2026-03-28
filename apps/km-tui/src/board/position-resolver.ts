/**
 * Position Resolver
 *
 * Resolves a locationKey string (from VerbAction) into a concrete Position
 * in the tree. Pure function — no side effects, no dispatching.
 *
 * The Position type represents a slot among a parent's children:
 *   { parentId, childIdx }
 * where childIdx -1 means "last" and 0 means "first".
 *
 * Picker locations (pick:#, pick:@, etc.) resolve to { pick: prefix }
 * which the verb handler interprets as "open picker filtered by prefix."
 */

import { getFavorite } from "@km/commands"

/** A slot in the tree: a position among a parent's children. */
export interface Position {
  parentId: string
  childIdx: number // -1 = last, 0 = first
}

/** Deferred resolution — open a picker filtered by prefix. */
export interface PickTarget {
  pick: string // sigil prefix: "#", "@", "+", "[", ""
}

/** Result of resolving a locationKey. */
export type ResolvedLocation = Position | PickTarget | null

/** Minimal repo interface needed for position resolution. */
export interface ResolverRepo {
  getNode(id: string): { id: string; parent_id: string | null; parent_idx: number } | null
  getChildren(parentId: string | null): { id: string; parent_idx: number }[]
  resolveNode(query: string): { id: string } | null
}

/** Cursor context needed for position resolution. */
export interface CursorContext {
  cursorNodeId: string | null
}

/**
 * Resolve a locationKey to a Position, PickTarget, or null.
 *
 * This is the central resolution table: key → where in the tree.
 * The result is verb-independent — the same Position means the same
 * place regardless of whether the verb is goto, move, add, or create.
 */
export function resolveLocationKey(locationKey: string, cursor: CursorContext, repo: ResolverRepo): ResolvedLocation {
  // --- Picker targets ---
  if (locationKey.startsWith("pick:")) {
    return { pick: locationKey.slice(5) }
  }

  // --- Favorites ---
  if (locationKey.startsWith("fav:")) {
    const favId = getFavorite(locationKey.slice(4))
    if (!favId) return null
    const favNode = repo.getNode(favId)
    if (!favNode) return null
    return { parentId: favNode.id, childIdx: -1 }
  }

  // --- Positional targets (relative to cursor) ---
  if (locationKey === "parent") {
    return resolveParent(cursor, repo)
  }
  if (locationKey === "first") {
    return resolveFirstLast(cursor, repo, "first")
  }
  if (locationKey === "last") {
    return resolveFirstLast(cursor, repo, "last")
  }

  // --- Special locations ---
  if (locationKey === "@home") {
    return { parentId: "", childIdx: 0 } // root sentinel
  }

  // --- Board/node ID (e.g., @next, @inbox, or a concrete node ID) ---
  const targetNode = repo.getNode(locationKey) ?? repo.resolveNode(locationKey)
  if (!targetNode) return null
  return { parentId: targetNode.id, childIdx: -1 }
}

/** Resolve "parent" — the parent's slot in its grandparent. */
function resolveParent(cursor: CursorContext, repo: ResolverRepo): Position | null {
  const nodeId = cursor.cursorNodeId
  if (!nodeId) return null
  const node = repo.getNode(nodeId)
  if (!node?.parent_id) return null
  const parentNode = repo.getNode(node.parent_id)
  if (!parentNode) return null
  // Parent's slot = { grandparent, parent's index }
  if (!parentNode.parent_id) {
    // Parent is root — return root position
    return { parentId: parentNode.id, childIdx: 0 }
  }
  return { parentId: parentNode.parent_id, childIdx: parentNode.parent_idx }
}

/** Resolve "first" or "last" — first/last sibling slot relative to cursor. */
function resolveFirstLast(cursor: CursorContext, repo: ResolverRepo, which: "first" | "last"): Position | null {
  const nodeId = cursor.cursorNodeId
  if (!nodeId) return null
  const node = repo.getNode(nodeId)
  if (!node?.parent_id) return null
  return { parentId: node.parent_id, childIdx: which === "first" ? 0 : -1 }
}

/** Type guard: is this a PickTarget? */
export function isPickTarget(loc: ResolvedLocation): loc is PickTarget {
  return loc !== null && "pick" in loc
}

/** Type guard: is this a Position? */
export function isPosition(loc: ResolvedLocation): loc is Position {
  return loc !== null && "parentId" in loc
}

// =========================================================================
// Position domain helpers — ergonomic tree slot operations
// =========================================================================

/** A node-like shape with the fields Position helpers need. */
type NodeLike = { id: string; parent_id: string | null; parent_idx: number; name?: string | null }

/** Position of a node — its current slot in its parent. */
export function positionOf(node: NodeLike): Position | null {
  if (!node.parent_id) return null
  return { parentId: node.parent_id, childIdx: node.parent_idx }
}

/** First child slot of a parent. */
export function firstChild(parentId: string): Position {
  return { parentId, childIdx: 0 }
}

/** Last child slot of a parent. */
export function lastChild(parentId: string): Position {
  return { parentId, childIdx: -1 }
}

/**
 * Convert an abstract Position to a concrete sort order for repo.moveNode().
 * childIdx 0 → before the first child, childIdx -1 → after the last child.
 * A concrete childIdx (>0) is passed through.
 */
export function toSortOrder(pos: Position, repo: ResolverRepo): { parentId: string; sortOrder: number } {
  const children = repo.getChildren(pos.parentId)
  if (children.length === 0) return { parentId: pos.parentId, sortOrder: 0 }
  if (pos.childIdx === 0) {
    return { parentId: pos.parentId, sortOrder: children[0]!.parent_idx - 1 }
  }
  if (pos.childIdx === -1) {
    return { parentId: pos.parentId, sortOrder: children.at(-1)!.parent_idx + 1 }
  }
  return { parentId: pos.parentId, sortOrder: pos.childIdx }
}

/** Get the node currently at a position (or null if the slot is empty). */
export function nodeAt(pos: Position, repo: ResolverRepo): NodeLike | null {
  const children = repo.getChildren(pos.parentId)
  if (children.length === 0) return null
  if (pos.childIdx === 0) return (repo.getNode(children[0]!.id) as NodeLike) ?? null
  if (pos.childIdx === -1) return (repo.getNode(children.at(-1)!.id) as NodeLike) ?? null
  const match = children.find((c) => c.parent_idx === pos.childIdx)
  return match ? ((repo.getNode(match.id) as NodeLike) ?? null) : null
}

/** Check if a node is already at the given position. */
export function isAtPosition(nodeId: string, pos: Position, repo: ResolverRepo): boolean {
  const children = repo.getChildren(pos.parentId)
  if (children.length === 0) return false
  if (pos.childIdx === 0) return children[0]!.id === nodeId
  if (pos.childIdx === -1) return children.at(-1)!.id === nodeId
  const match = children.find((c) => c.parent_idx === pos.childIdx)
  return match?.id === nodeId
}

/** Repo interface extended with moveNode for the moveTo helper. */
export interface MoveRepo extends ResolverRepo {
  moveNode(id: string, parentId: string, sortOrder: number): void
}

/**
 * Move a node to a Position. Resolves abstract childIdx (-1, 0) to concrete
 * sort order, then calls repo.moveNode. Returns false if already there.
 */
export function moveTo(repo: MoveRepo, nodeId: string, pos: Position): boolean {
  if (isAtPosition(nodeId, pos, repo)) return false
  const { parentId, sortOrder } = toSortOrder(pos, repo)
  repo.moveNode(nodeId, parentId, sortOrder)
  return true
}
