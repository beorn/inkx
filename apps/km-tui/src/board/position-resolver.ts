/**
 * Position Resolver
 *
 * Resolves a locationKey string (from VerbAction) into a concrete Position
 * in the tree. Pure function — no side effects, no dispatching.
 *
 * Location keys are template strings from the config:
 * - "{parent}", "{first}", "{last}" → positional (cursor-relative)
 * - "journals/{YYYY}/{YYYY-MM-DD}.md" → date-expanded path → resolveNode
 * - "@inbox", "@next" → literal node reference → resolveNode
 * - "pick:#" → picker dialog
 * - "fav:3" → legacy favorite lookup (deprecated, kept for compat)
 *
 * Position type and construction helpers (of, first, last, equals) live in
 * @km/core (Position namespace). Repo-dependent helpers (toSortOrder, nodeAt,
 * isAtPosition, moveTo) are in Tree (@km/tree).
 */

import { getFavorite } from "@km/commands"
import { Position } from "@km/core"
import { expandLocationTemplate } from "../config-persist.ts"

/** Deferred resolution — open a picker filtered by prefix. */
export interface PickTarget {
  pick: string // sigil prefix: "#", "@", "+", "[", ""
}

/** Result of resolving a locationKey. */
export type ResolvedLocation = Position | PickTarget | null

// Re-export Position from @km/core for consumers that import from here
export type { Position } from "@km/core"

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

  // --- Legacy favorites (fav:N) — deprecated, kept for compat ---
  if (locationKey.startsWith("fav:")) {
    const favValue = getFavorite(locationKey.slice(4))
    if (!favValue) return null
    // Favorite value may itself be a template — recurse
    return resolveLocationKey(favValue, cursor, repo)
  }

  // --- Template expansion ---
  const expanded = expandLocationTemplate(locationKey)

  if (expanded.type === "positional") {
    switch (expanded.key) {
      case "parent":
        return resolveParent(cursor, repo)
      case "first":
        return resolveFirstLast(cursor, repo, "first")
      case "last":
        return resolveFirstLast(cursor, repo, "last")
      default:
        return null
    }
  }

  // expanded.type === "resolved" — either date-expanded path or literal ref
  const resolvedValue = expanded.value

  // --- Special locations ---
  if (resolvedValue === "@home") {
    return Position.first("") // root sentinel
  }

  // --- Board/node ID (e.g., @next, @inbox, or a concrete node ID / path) ---
  const targetNode = repo.getNode(resolvedValue) ?? repo.resolveNode(resolvedValue)
  if (!targetNode) return null
  return Position.last(targetNode.id)
}

/** Resolve "parent" — the parent's slot in its grandparent. */
function resolveParent(cursor: CursorContext, repo: ResolverRepo): Position | null {
  const nodeId = cursor.cursorNodeId
  if (!nodeId) return null
  const node = repo.getNode(nodeId)
  if (!node?.parent_id) return null
  const parentNode = repo.getNode(node.parent_id)
  if (!parentNode) return null
  // Parent's slot in grandparent (or root sentinel if parent IS root)
  if (!parentNode.parent_id) return Position.first(parentNode.id)
  return Position.of(parentNode)!
}

/** Resolve "first" or "last" — first/last sibling slot relative to cursor. */
function resolveFirstLast(cursor: CursorContext, repo: ResolverRepo, which: "first" | "last"): Position | null {
  const nodeId = cursor.cursorNodeId
  if (!nodeId) return null
  const node = repo.getNode(nodeId)
  if (!node?.parent_id) return null
  return which === "first" ? Position.first(node.parent_id) : Position.last(node.parent_id)
}

/** Type guard: is this a PickTarget? */
export function isPickTarget(loc: ResolvedLocation): loc is PickTarget {
  return loc !== null && "pick" in loc
}

/** Type guard: is this a Position? */
export function isPosition(loc: ResolvedLocation): loc is Position {
  return loc !== null && "parentId" in loc
}

// Repo-dependent Position helpers (toSortOrder, nodeAt, isAtPosition, moveTo)
// have moved to Tree in @km/tree.
