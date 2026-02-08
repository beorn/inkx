/**
 * ViewNavigation — view-owned navigation policy.
 *
 * Each view mode implements this interface to resolve directional input
 * to a target node ID. The navigation layer asks "where should I go?",
 * the view answers with a nodeId.
 *
 * See docs/design/visual-navigation.md for the full design.
 */

import type { Repo } from "@km/storage"
import type { LayoutRegistry } from "./card-positions.ts"

// =============================================================================
// ViewNavigation interface
// =============================================================================

/**
 * Navigation state passed to the view for resolving movement.
 */
export interface NavState {
  cursorNodeId: string
  rootId: string | null
  foldedNodes: Set<string>
  collapsedNodes: Set<string>
}

/**
 * View-owned navigation policy.
 *
 * Each view mode (cards, list, columns, tabs) implements this to resolve
 * directional input to a target nodeId.
 *
 * The one navigation rule: move to the next selectable node in that direction.
 * What "selectable" means depends on the view mode and current state.
 */
export interface ViewNavigation {
  navigate(
    dir: "up" | "down" | "left" | "right",
    state: NavState,
    repo: Repo,
    layoutRegistry: LayoutRegistry,
  ): string | null
}

// =============================================================================
// Cards view navigation
// =============================================================================

/**
 * Cards view navigation (kanban board).
 *
 * Visual model:
 * - Board title at top, columns side by side, cards stacked vertically in columns
 * - j/k: navigate through hierarchy (board → column → card → next/prev card)
 * - h/l: cross-column movement using curswantY for vertical position matching
 *
 * This extracts the logic from handleHierarchicalNavigation and handleHorizontalNav.
 */
export function createCardsViewNavigation(): ViewNavigation {
  return {
    navigate(dir, state, repo, layoutRegistry) {
      const { cursorNodeId, rootId } = state

      if (dir === "up" || dir === "down") {
        return navigateVertical(dir, state, repo, layoutRegistry)
      }

      // dir === "left" || dir === "right"
      return navigateHorizontal(dir, state, repo, layoutRegistry)
    },
  }
}

// =============================================================================
// Vertical navigation (j/k)
// =============================================================================

function navigateVertical(
  dir: "up" | "down",
  state: NavState,
  repo: Repo,
  layoutRegistry: LayoutRegistry,
): string | null {
  const { cursorNodeId, rootId } = state

  const cursorNode = repo.getNode(cursorNodeId)
  if (!cursorNode) {
    throw new Error(`[nav] cursor node not in repo: ${cursorNodeId}`)
  }

  const isAtBoardLevel = cursorNodeId === rootId
  const isAtColumnLevel = cursorNode.parent_id === rootId && !isAtBoardLevel
  const isAtCardLevel = !isAtBoardLevel && !isAtColumnLevel

  if (dir === "down") {
    if (isAtBoardLevel) {
      // Board → column header (use stickyX to remember which column)
      const stickyX = layoutRegistry.getStickyX()
      const columns = repo.getChildren(rootId)
      const targetIdx =
        stickyX !== null && stickyX < columns.length ? stickyX : 0
      return columns[targetIdx]?.id ?? null
    }

    if (isAtColumnLevel) {
      // Column header → first card in column
      const cards = repo.getChildren(cursorNodeId)
      return cards[0]?.id ?? null
    }

    if (isAtCardLevel) {
      // Card → next sibling
      return getNextSibling(cursorNodeId, repo)
    }
  } else {
    // k: move up
    if (isAtCardLevel) {
      // Try previous sibling first
      const prev = getPreviousSibling(cursorNodeId, repo)
      if (prev) return prev
      // At first card → parent (column header)
      return cursorNode.parent_id
    }

    if (isAtColumnLevel) {
      // Column header → board (save column index for return via stickyX)
      const columns = repo.getChildren(rootId)
      const colIdx = columns.findIndex((n) => n.id === cursorNodeId)
      if (colIdx >= 0) layoutRegistry.setStickyX(colIdx)
      return rootId
    }

    if (isAtBoardLevel) {
      return null // can't go higher
    }
  }

  throw new Error(
    `[nav] unreachable: cursor ${cursorNodeId} is not at board/column/card level`,
  )
}

// =============================================================================
// Horizontal navigation (h/l)
// =============================================================================

function navigateHorizontal(
  dir: "left" | "right",
  state: NavState,
  repo: Repo,
  layoutRegistry: LayoutRegistry,
): string | null {
  const { cursorNodeId, rootId } = state

  const cursorNode = repo.getNode(cursorNodeId)
  if (!cursorNode) {
    throw new Error(`[nav] cursor node not in repo: ${cursorNodeId}`)
  }

  // At board level, h/l can't move
  if (cursorNodeId === rootId) return null

  // Determine which column cursor is in and what position
  const columns = repo.getChildren(rootId)
  const cursorColId = findAncestorAtDepth(cursorNodeId, rootId, 1, repo)
  if (!cursorColId) {
    throw new Error(
      `[nav] cursor ${cursorNodeId} has no column ancestor under root ${rootId}`,
    )
  }

  const colIdx = columns.findIndex((c) => c.id === cursorColId)
  if (colIdx < 0) {
    throw new Error(`[nav] column ${cursorColId} not found in root children`)
  }

  const isAtColumnLevel = cursorNode.parent_id === rootId

  // Find target column, skipping virtual columns (isVirtual not available from
  // repo alone — but virtual columns are only for body columns which don't
  // have standard folder type, so we skip them)
  const step = dir === "left" ? -1 : 1
  let targetColIdx = colIdx + step
  while (targetColIdx >= 0 && targetColIdx < columns.length) {
    // Accept any non-virtual column (we don't have isVirtual from pure repo,
    // so accept all for now — the rendering layer filters virtual columns)
    break
  }

  if (targetColIdx < 0 || targetColIdx >= columns.length) return null
  if (targetColIdx === colIdx) return null

  const targetCol = columns[targetColIdx]
  if (!targetCol) {
    throw new Error(
      `[nav] column at index ${targetColIdx} missing after bounds check`,
    )
  }

  // Get cards in target column
  const targetCards = repo.getChildren(targetCol.id)

  if (targetCards.length === 0) {
    // Empty target column → move to column header
    return targetCol.id
  }

  if (isAtColumnLevel) {
    // From column header: use stickyY to drop into a card, or stay at column level
    const stickyY = layoutRegistry.getStickyY()
    if (stickyY !== null && layoutRegistry.hasCardsInColumn(targetColIdx)) {
      const targetCardIdx = layoutRegistry.findCardAtYVisual(
        targetColIdx,
        stickyY,
      )
      return cardAt(targetCards, Math.max(0, targetCardIdx))
    }
    return targetCol.id
  }

  // At card level: use stickyY (captured by action handler) for position matching
  const stickyY = layoutRegistry.getStickyY()
  if (stickyY !== null && layoutRegistry.hasCardsInColumn(targetColIdx)) {
    const targetCardIdx = layoutRegistry.findCardAtYVisual(
      targetColIdx,
      stickyY,
    )
    return cardAt(targetCards, Math.max(0, targetCardIdx))
  }

  // No stickyY (no measured positions in registry) — first card
  return cardAt(targetCards, 0)
}

// =============================================================================
// Helpers
// =============================================================================

/** Get card ID by index, throw if out of bounds (programming error). */
function cardAt(cards: { id: string }[], idx: number): string {
  const card = cards[idx]
  if (!card) {
    throw new Error(
      `[nav] card index ${idx} out of bounds (${cards.length} cards)`,
    )
  }
  return card.id
}

function getNextSibling(nodeId: string, repo: Repo): string | null {
  const node = repo.getNode(nodeId)
  if (!node) throw new Error(`[nav] node not in repo: ${nodeId}`)
  const siblings = repo.getChildren(node.parent_id)
  const idx = siblings.findIndex((n) => n.id === nodeId)
  if (idx < 0)
    throw new Error(`[nav] node ${nodeId} not found in parent's children`)
  if (idx >= siblings.length - 1) return null // last sibling
  return siblings[idx + 1]?.id ?? null
}

function getPreviousSibling(nodeId: string, repo: Repo): string | null {
  const node = repo.getNode(nodeId)
  if (!node) throw new Error(`[nav] node not in repo: ${nodeId}`)
  const siblings = repo.getChildren(node.parent_id)
  const idx = siblings.findIndex((n) => n.id === nodeId)
  if (idx < 0)
    throw new Error(`[nav] node ${nodeId} not found in parent's children`)
  if (idx === 0) return null // first sibling
  return siblings[idx - 1]?.id ?? null
}

/**
 * Find the ancestor of nodeId at a given depth from rootId.
 * depth=1 means direct child of rootId (column level).
 */
function findAncestorAtDepth(
  nodeId: string,
  rootId: string | null,
  depth: number,
  repo: Repo,
): string | null {
  // Walk up from nodeId, collecting ancestor chain
  const chain: string[] = []
  let currentId: string | null = nodeId

  while (currentId !== rootId && currentId !== null) {
    chain.push(currentId)
    const node = repo.getNode(currentId)
    if (!node)
      throw new Error(`[nav] broken parent chain: ${currentId} not in repo`)
    currentId = node.parent_id
  }

  // chain is [nodeId, ..., directChildOfRoot]
  // depth=1 means we want the last element (direct child of root)
  const targetIndex = chain.length - depth
  if (targetIndex < 0 || targetIndex >= chain.length) return null
  const result = chain[targetIndex]
  if (!result)
    throw new Error(
      `[nav] chain index ${targetIndex} missing after bounds check`,
    )
  return result
}
