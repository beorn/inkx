/**
 * List View Component
 *
 * Full-width tree/outline view of the board hierarchy.
 * Shows the same data as board view but in a hierarchical list format.
 *
 * Uses inkx overflow="scroll" for native scrolling support.
 *
 * Performance optimization: Pre-caches board pills for all visible nodes
 * to avoid O(n) database queries during render.
 */
import React, { useMemo, useCallback } from "react";
import { Box, Text } from "inkx";
import type { BoardState, CardState } from "../types.ts";
import { getBoardPills, type BoardPill } from "../board-pills.ts";
import { useTreeConfig, useRootBoardId } from "../ui-context.tsx";
import { useVault } from "../vault-context.tsx";
import type { KNode } from "@km/core";
import {
  MemoizedTreeCard,
  MemoizedColumnHeader,
} from "./shared-components.tsx";

// Type for flattened list items
type FlatItem =
  | {
      type: "header";
      colIdx: number;
      cardIdx: -1;
      column: BoardState["columns"][0];
      card?: undefined;
    }
  | {
      type: "card";
      colIdx: number;
      cardIdx: number;
      column: BoardState["columns"][0];
      card: CardState;
    };

// Empty children array constant - stable reference for memoization
const EMPTY_CHILDREN: KNode[] = [];

interface ListViewProps {
  state: BoardState;
  width: number;
  height: number;
  colIndex: number;
  cardIndex: number;
  subIndex: number;
  selectionLevel: "board" | "column" | "card";
}

export function ListView({
  state,
  width,
  height,
  colIndex,
  cardIndex,
  subIndex,
  selectionLevel,
}: ListViewProps): React.ReactElement {
  const { inOutlineMode } = useTreeConfig();
  const rootBoardId = useRootBoardId();
  const vault = useVault();

  // Flatten all cards into a single list
  const flatItems = useMemo(() => {
    const items: FlatItem[] = [];

    state.columns.forEach((column, cIdx) => {
      items.push({ type: "header", colIdx: cIdx, cardIdx: -1, column });
      column.cards.forEach((card, idx) => {
        items.push({ type: "card", colIdx: cIdx, cardIdx: idx, column, card });
      });
    });

    return items;
  }, [state.columns]);

  // Pre-cache board pills for ALL cards to avoid O(n) DB queries during render
  // This batches the lookups into a single pass through all cards
  const boardPillsCache = useMemo(() => {
    const cache = new Map<string, BoardPill[]>();
    const excludeBoardIds = rootBoardId
      ? new Set([rootBoardId])
      : new Set<string>();

    for (const item of flatItems) {
      if (item.type === "card" && item.card.node.task_status != null) {
        cache.set(
          item.card.node.id,
          getBoardPills(vault, item.card.node, excludeBoardIds),
        );
      }
    }
    return cache;
  }, [flatItems, rootBoardId, vault]);

  // Cached getBoardPills function to pass to TreeNode
  // Use useCallback to maintain stable reference when cache content is same
  const getCachedBoardPills = useCallback(
    (node: KNode, _excludeBoardIds: Set<string>): BoardPill[] => {
      return boardPillsCache.get(node.id) ?? [];
    },
    [boardPillsCache],
  );

  // Calculate the selected item's index in flat list
  const selectedFlatIndex = useMemo(() => {
    let idx = 0;
    for (let c = 0; c < colIndex; c++) {
      idx += 1 + (state.columns[c]?.cards.length ?? 0);
    }
    return selectionLevel === "column" ? idx : idx + 1 + cardIndex;
  }, [colIndex, cardIndex, selectionLevel, state.columns]);

  // Empty state
  if (state.columns.length === 0) {
    return (
      <Box flexDirection="column" width={width} height={height}>
        <Text> </Text>
        <Text dimColor>No columns to display</Text>
      </Box>
    );
  }

  return (
    <Box
      flexDirection="column"
      width={width}
      maxHeight={height}
      overflow="hidden"
    >
      {/* Blank line at top */}
      <Box height={1} flexShrink={0}>
        <Text> </Text>
      </Box>

      {/* Scrollable list using inkx native scrolling */}
      <Box
        flexDirection="column"
        width={width}
        height={height - 1}
        overflow="scroll"
        scrollTo={selectedFlatIndex}
      >
        {flatItems.map((item) => {
          if (item.type === "header") {
            const cIdx = item.colIdx;
            const isColSelected =
              selectionLevel === "column" && colIndex === cIdx;
            const isSelected = colIndex === cIdx;

            return (
              <MemoizedColumnHeader
                key={`header-${item.column.node.id}`}
                column={item.column}
                colIdx={cIdx}
                isSelected={isSelected}
                isColSelected={isColSelected}
                width={width}
                showTopSpacer={cIdx > 0}
              />
            );
          }

          // Card item
          const cIdx = item.colIdx;
          const cardIdx = item.cardIdx;
          const isCardSelected =
            selectionLevel === "card" &&
            colIndex === cIdx &&
            cardIndex === cardIdx &&
            (!inOutlineMode || subIndex === 0);

          return (
            <MemoizedTreeCard
              key={item.card.node.id}
              card={item.card}
              colIndex={cIdx}
              cardIndex={cardIdx}
              isSelected={isCardSelected}
              children={EMPTY_CHILDREN}
              getBoardPills={getCachedBoardPills}
            />
          );
        })}
      </Box>
    </Box>
  );
}
