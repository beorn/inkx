/**
 * ScrollableList Component - Vanilla Ink Version
 *
 * Virtualized scrolling list with overflow indicators.
 * Uses @beorn/ink-measure's calculateScrollState, renders with ink Box/Text.
 */

import React, { useMemo } from "react";
import { Box, Text } from "ink";
import { useConstraintContext } from "./context.tsx";
import {
  calculateScrollState,
  type ScrollState,
} from "@beorn/ink-measure";

// Re-export for backwards compatibility
export { calculateScrollState, type ScrollState };

export interface ScrollableListProps<T> {
  /** Items to render */
  items: T[];
  /** Currently selected item index */
  selectedIndex: number;
  /** Height of each item in lines (characters) - used when getItemHeight not provided */
  itemHeight?: number;
  /** Get height of specific item (overrides itemHeight when provided) */
  getItemHeight?: (item: T, index: number) => number;
  /** Render function for each item */
  renderItem: (item: T, index: number, isSelected: boolean) => React.ReactNode;
  /** Custom overflow indicator renderer */
  renderOverflow?: (
    direction: "top" | "bottom",
    count: number,
  ) => React.ReactNode;
  /** Gap between items in lines */
  gap?: number;
  /** Height override (uses context height if not provided) */
  height?: number;
}

/**
 * Default overflow indicator - matches unified OverflowIndicator style (inverse)
 */
function DefaultOverflow({
  direction,
  count,
}: {
  direction: "top" | "bottom";
  count: number;
}): React.ReactElement {
  const arrow = direction === "top" ? "▲" : "▼";
  const text = `${arrow} ${count} more`;
  return (
    <Text backgroundColor="gray" color="white">
      {text}
    </Text>
  );
}

/**
 * Hook to calculate scroll state from context.
 */
export function useScrollState<T>(
  items: T[],
  selectedIndex: number,
  options: {
    itemHeight?: number;
    gap?: number;
    height?: number;
    hasOverflowIndicator?: boolean;
    getItemHeight?: (item: T, index: number) => number;
  } = {},
): ScrollState<T> {
  const { parent } = useConstraintContext();
  const {
    itemHeight = 1,
    gap = 0,
    height: heightOverride,
    hasOverflowIndicator = true,
    getItemHeight,
  } = options;

  const availableHeight = heightOverride ?? parent.height;

  return useMemo(
    () =>
      calculateScrollState(
        items,
        selectedIndex,
        availableHeight,
        itemHeight,
        gap,
        hasOverflowIndicator,
        getItemHeight,
      ),
    [
      items,
      selectedIndex,
      availableHeight,
      itemHeight,
      gap,
      hasOverflowIndicator,
      getItemHeight,
    ],
  );
}

/**
 * ScrollableList renders a virtualized list with overflow indicators.
 *
 * @example
 * ```tsx
 * <ScrollableList
 *   items={cards}
 *   selectedIndex={selectedCardIndex}
 *   itemHeight={4}
 *   renderItem={(card, idx, isSelected) => (
 *     <Card card={card} isSelected={isSelected} />
 *   )}
 * />
 * ```
 */
export function ScrollableList<T>({
  items,
  selectedIndex,
  itemHeight = 1,
  getItemHeight,
  renderItem,
  renderOverflow,
  gap = 0,
  height: heightOverride,
}: ScrollableListProps<T>): React.ReactElement {
  const { parent } = useConstraintContext();
  const availableHeight = heightOverride ?? parent.height;

  const hasOverflowIndicator = renderOverflow !== undefined || true; // Default to showing indicators

  const { visible, overflowTop, overflowBottom } = useMemo(
    () =>
      calculateScrollState(
        items,
        selectedIndex,
        availableHeight,
        itemHeight,
        gap,
        hasOverflowIndicator,
        getItemHeight,
      ),
    [
      items,
      selectedIndex,
      availableHeight,
      itemHeight,
      gap,
      hasOverflowIndicator,
      getItemHeight,
    ],
  );

  // Use the custom renderer or default
  const renderOverflowIndicator = (
    direction: "top" | "bottom",
    count: number,
  ): React.ReactNode => {
    if (renderOverflow) {
      return renderOverflow(direction, count);
    }
    return <DefaultOverflow direction={direction} count={count} />;
  };

  return (
    <Box flexDirection="column" gap={gap}>
      {overflowTop > 0 && renderOverflowIndicator("top", overflowTop)}
      {visible.map(({ item, index }) => (
        <React.Fragment key={index}>
          {renderItem(item, index, index === selectedIndex)}
        </React.Fragment>
      ))}
      {overflowBottom > 0 && renderOverflowIndicator("bottom", overflowBottom)}
    </Box>
  );
}
