/**
 * Node Layout Registry
 *
 * Nodes report their actual positions and dimensions from inkx layout.
 * Navigation handlers query these for visual-position-aware h/l movement.
 *
 * Tracks both node-level and card-level (col/card index) lookups.
 */

import createDebug from "debug";

const debug = createDebug("km:tui:layout");

// =============================================================================
// Types
// =============================================================================

/**
 * Layout information for a rendered node.
 */
export interface NodeLayout {
  /** X position (left edge) */
  x: number;
  /** Y position (top edge) */
  y: number;
  /** Head area height (title line only) */
  headHeight: number;
  /** Head area width */
  headWidth: number;
  /** Full card height (including children/subitems) */
  cardHeight: number;
  /** Full card width */
  cardWidth: number;
}

/**
 * Card entry in the registry (combines position info with node ID).
 */
export interface CardEntry {
  nodeId: string;
  layout: NodeLayout;
}

/**
 * Registry of node positions and dimensions.
 * Updated by components as they render via useLayoutEffect.
 */
export interface LayoutRegistry {
  // === Node-level registration ===

  /** Register a node's layout by ID */
  registerNode(nodeId: string, layout: NodeLayout): void;

  /** Get a node's layout by ID (throws if not found) */
  getNode(nodeId: string): NodeLayout;

  /** Get a node's layout by ID (returns undefined if not found) */
  getNodeOptional(nodeId: string): NodeLayout | undefined;

  // === Card-level registration (for column/card index navigation) ===

  /** Register a card's layout by column and card index */
  registerCard(
    colIndex: number,
    cardIndex: number,
    nodeId: string,
    layout: NodeLayout,
  ): void;

  /** Get a card's entry by column and card index (throws if not found) */
  getCard(colIndex: number, cardIndex: number): CardEntry;

  /** Get a card's entry by column and card index (returns undefined if not found) */
  getCardOptional(colIndex: number, cardIndex: number): CardEntry | undefined;

  /** Find the card in a column closest to a target Y position (throws if no cards registered) */
  findCardAtY(colIndex: number, targetY: number): number;

  // === Sticky Y for h/l navigation ===

  /** Set sticky Y position for h/l navigation sequences */
  setStickyY(y: number): void;

  /** Get current sticky Y position (null if not set) */
  getStickyY(): number | null;

  /** Clear sticky Y position (called on j/k navigation) */
  clearStickyY(): void;

  // === Utilities ===

  /** Clear all positions (call on tree structure change) */
  clear(): void;

  /** Dump registry state for debugging */
  dump(): string;

  /** Check if any cards are registered for a column */
  hasCardsInColumn(colIndex: number): boolean;

  /** Get count of registered cards in a column */
  getCardCount(colIndex: number): number;
}

// =============================================================================
// Implementation
// =============================================================================

/**
 * Create a layout registry instance.
 * Pass this through context so components and handlers can access it.
 */
export function createLayoutRegistry(): LayoutRegistry {
  // Map: nodeId -> NodeLayout
  const nodeLayouts = new Map<string, NodeLayout>();

  // Map: colIndex -> Map<cardIndex, CardEntry>
  const cardLayouts = new Map<number, Map<number, CardEntry>>();

  // Sticky Y for h/l navigation
  let stickyY: number | null = null;

  return {
    // === Node-level ===

    registerNode(nodeId: string, layout: NodeLayout): void {
      nodeLayouts.set(nodeId, layout);
      debug(
        "registerNode: id=%s y=%d head=%dx%d card=%dx%d",
        nodeId.slice(-8),
        layout.y,
        layout.headWidth,
        layout.headHeight,
        layout.cardWidth,
        layout.cardHeight,
      );
    },

    getNode(nodeId: string): NodeLayout {
      const layout = nodeLayouts.get(nodeId);
      if (!layout) {
        throw new Error(`Node layout not found: ${nodeId}`);
      }
      return layout;
    },

    getNodeOptional(nodeId: string): NodeLayout | undefined {
      return nodeLayouts.get(nodeId);
    },

    // === Card-level ===

    registerCard(
      colIndex: number,
      cardIndex: number,
      nodeId: string,
      layout: NodeLayout,
    ): void {
      let colMap = cardLayouts.get(colIndex);
      if (!colMap) {
        colMap = new Map();
        cardLayouts.set(colIndex, colMap);
      }
      colMap.set(cardIndex, { nodeId, layout });

      // Also register by node ID for direct lookup
      nodeLayouts.set(nodeId, layout);

      debug(
        "registerCard: col=%d card=%d id=%s y=%d",
        colIndex,
        cardIndex,
        nodeId.slice(-8),
        layout.y,
      );
    },

    getCard(colIndex: number, cardIndex: number): CardEntry {
      const entry = cardLayouts.get(colIndex)?.get(cardIndex);
      if (!entry) {
        throw new Error(
          `Card layout not found: col=${colIndex}, card=${cardIndex}`,
        );
      }
      return entry;
    },

    getCardOptional(
      colIndex: number,
      cardIndex: number,
    ): CardEntry | undefined {
      return cardLayouts.get(colIndex)?.get(cardIndex);
    },

    findCardAtY(colIndex: number, targetY: number): number {
      const colMap = cardLayouts.get(colIndex);

      if (!colMap || colMap.size === 0) {
        throw new Error(`No cards registered for column ${colIndex}`);
      }

      // Find card whose Y is closest to target
      let closestIdx = 0;
      let closestDist = Infinity;

      for (const [cardIdx, entry] of colMap) {
        const dist = Math.abs(entry.layout.y - targetY);
        if (dist < closestDist) {
          closestDist = dist;
          closestIdx = cardIdx;
        }
      }

      debug(
        "findCardAtY: col=%d targetY=%d -> card=%d (y=%d)",
        colIndex,
        targetY,
        closestIdx,
        colMap.get(closestIdx)?.layout.y,
      );

      return closestIdx;
    },

    // === Sticky Y ===

    setStickyY(y: number): void {
      stickyY = y;
      debug("setStickyY: %d", y);
    },

    getStickyY(): number | null {
      return stickyY;
    },

    clearStickyY(): void {
      if (stickyY !== null) {
        debug("clearStickyY");
        stickyY = null;
      }
    },

    // === Utilities ===

    clear(): void {
      nodeLayouts.clear();
      cardLayouts.clear();
      stickyY = null;
      debug("cleared all layouts");
    },

    hasCardsInColumn(colIndex: number): boolean {
      const colMap = cardLayouts.get(colIndex);
      return colMap !== undefined && colMap.size > 0;
    },

    getCardCount(colIndex: number): number {
      return cardLayouts.get(colIndex)?.size ?? 0;
    },

    dump(): string {
      const lines: string[] = [`stickyY=${stickyY}`];

      if (cardLayouts.size === 0) {
        lines.push("(no cards registered)");
      } else {
        for (const [colIdx, colMap] of cardLayouts) {
          const entries = Array.from(colMap.entries())
            .sort((a, b) => a[0] - b[0])
            .map(
              ([cardIdx, entry]) =>
                `${cardIdx}:y${entry.layout.y}:h${entry.layout.cardHeight}`,
            )
            .join(", ");
          lines.push(`col[${colIdx}]: ${entries}`);
        }
      }

      if (nodeLayouts.size > cardLayouts.size) {
        lines.push(`(${nodeLayouts.size} total nodes registered)`);
      }

      return lines.join("\n");
    },
  };
}

// =============================================================================
// Backward compatibility alias
// =============================================================================

/** @deprecated Use LayoutRegistry instead */
export type CardPositionRegistry = LayoutRegistry;

/** @deprecated Use createLayoutRegistry instead */
export const createCardPositionRegistry = createLayoutRegistry;

// =============================================================================
// Global singleton for tests
// =============================================================================

let globalRegistry: LayoutRegistry | null = null;

/**
 * Get the global card position registry (creates one if needed).
 * Used by tests that need a shared registry instance.
 */
export function getCardPositionRegistry(): LayoutRegistry {
  if (!globalRegistry) {
    globalRegistry = createLayoutRegistry();
  }
  return globalRegistry;
}

/**
 * Reset the global card position registry.
 * Used by tests to reset state between test cases.
 */
export function resetCardPositionRegistry(): void {
  if (globalRegistry) {
    globalRegistry.clear();
  }
  globalRegistry = null;
}
