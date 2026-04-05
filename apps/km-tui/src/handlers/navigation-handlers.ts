/**
 * Navigation Handlers
 *
 * Pure navigation functions that compute the next cursor position.
 * Tree navigation uses Repo for tree structure.
 * Visual navigation uses GridNavigator for screen positions.
 *
 * These handlers return the new cursor or null if movement not possible.
 * The caller dispatches SELECT actions with the returned nodeId.
 *
 * See plan hazy-forging-crayon.md for design rationale.
 */

import { createLogger } from "loggily"
import type { Repo } from "@km/storage"
import { indexOfChild } from "../navigation/sibling-index.ts"

const log = createLogger("km:tui:nav")

// =============================================================================
// Tree Navigation
// =============================================================================

/**
 * Tree navigation direction.
 * - next/prev: sibling navigation (mapped from cursor_down/cursor_up in board-actions)
 * - first/last: jump to first/last sibling
 * - child: enter first child
 * - parent: go to parent
 */
export type TreeDirection = "next" | "prev" | "first" | "last" | "child" | "parent"

const TREE_DIRECTIONS = new Set<string>(["next", "prev", "first", "last", "child", "parent"])

/** Type guard for TreeDirection string values */
export function isTreeDirection(dir: string): dir is TreeDirection {
  return TREE_DIRECTIONS.has(dir)
}

/**
 * Navigation state fields needed for tree navigation.
 */
export interface TreeNavState {
  cursor: string | null
  rootId: string | null
  foldDepths: Map<string, number>
}

/**
 * Handle tree-based navigation.
 *
 * Uses Repo for tree structure queries. No visual layout involved.
 *
 * @param direction - Navigation direction ("next"/"prev" for siblings, "child"/"parent" for tree traversal)
 * @param state - Navigation state (cursor, rootId, foldDepths)
 * @param repo - Repo for tree queries
 * @returns New cursor node ID, or null if can't move
 */
export function handleTreeNavigation(direction: TreeDirection, state: TreeNavState, repo: Repo): string | null {
  const { cursor, rootId, foldDepths } = state

  // If no cursor, can't navigate
  if (!cursor) {
    return null
  }

  const currentNode = repo.getNode(cursor)
  if (!currentNode) {
    log.debug?.("tree nav: current node not found")
    return null
  }

  switch (direction) {
    case "next": {
      // Move to next sibling
      const siblings = repo.getChildren(currentNode.parent_id)
      const currentIndex = indexOfChild(siblings, cursor)
      if (currentIndex < 0 || currentIndex >= siblings.length - 1) {
        log.debug?.("tree nav: at last sibling, can't move next")
        return null // At last sibling
      }
      const nextSibling = siblings[currentIndex + 1]
      log.debug?.(`tree nav: next sibling ${nextSibling?.id.slice(-8)}`)
      return nextSibling?.id ?? null
    }

    case "prev": {
      // Move to previous sibling
      const siblings = repo.getChildren(currentNode.parent_id)
      const currentIndex = indexOfChild(siblings, cursor)
      if (currentIndex <= 0) {
        log.debug?.("tree nav: at first sibling, can't move prev")
        return null // At first sibling
      }
      const prevSibling = siblings[currentIndex - 1]
      log.debug?.(`tree nav: prev sibling ${prevSibling?.id.slice(-8)}`)
      return prevSibling?.id ?? null
    }

    case "first": {
      // Jump to first sibling
      const siblings = repo.getChildren(currentNode.parent_id)
      if (siblings.length === 0) {
        log.debug?.("tree nav: no siblings, can't jump to first")
        return null
      }
      const firstSibling = siblings[0]
      log.debug?.(`tree nav: first sibling ${firstSibling?.id.slice(-8)}`)
      return firstSibling?.id ?? null
    }

    case "last": {
      // Jump to last sibling
      const siblings = repo.getChildren(currentNode.parent_id)
      if (siblings.length === 0) {
        log.debug?.("tree nav: no siblings, can't jump to last")
        return null
      }
      const lastSibling = siblings[siblings.length - 1]
      log.debug?.(`tree nav: last sibling ${lastSibling?.id.slice(-8)}`)
      return lastSibling?.id ?? null
    }

    case "child": {
      // Move to first child (if not folded and has children)
      if (foldDepths.get(cursor) === 0) {
        log.debug?.("tree nav: node is folded, can't enter child")
        return null
      }
      const children = repo.getChildren(cursor)
      if (children.length === 0) {
        log.debug?.("tree nav: no children, can't enter child")
        return null
      }
      const firstChild = children[0]
      log.debug?.(`tree nav: first child ${firstChild?.id.slice(-8)}`)
      return firstChild?.id ?? null
    }

    case "parent": {
      // Move to parent
      if (currentNode.parent_id === null) {
        log.debug?.("tree nav: at repo root, can't move to parent")
        return null // At repo root (parent_id is null)
      }
      // Don't go above the current zoom root
      if (currentNode.parent_id === rootId) {
        log.debug?.("tree nav: at zoom root, returning to root")
        return rootId
      }
      // Check if parent is repo root (can't go above it)
      const parentNode = repo.getNode(currentNode.parent_id)
      if (parentNode?.parent_id === null) {
        log.debug?.("tree nav: parent is repo root, can't go higher")
        return null
      }
      log.debug?.(`tree nav: parent ${currentNode.parent_id.slice(-8)}`)
      return currentNode.parent_id
    }

    default: {
      // Exhaustiveness check - TypeScript will error if new TreeDirection values are added
      const _exhaustive: never = direction
      throw new Error(`Unhandled tree direction: ${_exhaustive as string}. This is a programming error.`)
    }
  }
}
