/**
 * ScrollableList Component
 *
 * Virtualized scrolling list with overflow indicators.
 * Uses constraint context for height calculation.
 */

import React, { useMemo } from "react";
import { Box, Text } from "ink";
import { useConstraintContext } from "./context.tsx";

export interface ScrollableListProps<T> {
  /** Items to render */
  items: T[];
  /** Currently selected item index */
  selectedIndex: number;
  /** Height of each item in lines (characters) */
  itemHeight?: number;
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

export interface ScrollState<T = unknown> {
  /** Items visible in the viewport */
  visible: { item: T; index: number }[];
  /** Current scroll offset (index of first visible item) */
  scrollOffset: number;
  /** Number of items above the viewport */
  overflowTop: number;
  /** Number of items below the viewport */
  overflowBottom: number;
}

/**
 * Default overflow indicator
 */
function DefaultOverflow({
  direction,
  count,
}: {
  direction: "top" | "bottom";
  count: number;
}): React.ReactElement {
  const arrow = direction === "top" ? "▲" : "▼";
  return (
    <Text dimColor>
      {arrow} {count} more
    </Text>
  );
}

/**
 * Calculate scroll state for a list with a selected item.
 *
 * The algorithm:
 * 1. Calculate how many items can fit in the available height
 * 2. Reserve space for overflow indicators if needed
 * 3. Center the selected item when possible
 * 4. Clamp scroll offset to valid range
 */
export function calculateScrollState<T>(
  items: T[],
  selectedIndex: number,
  availableHeight: number,
  itemHeight: number,
  gap: number,
  hasOverflowIndicator: boolean,
): ScrollState<T> {
  if (items.length === 0) {
    return {
      visible: [],
      scrollOffset: 0,
      overflowTop: 0,
      overflowBottom: 0,
    };
  }

  const effectiveItemHeight = itemHeight + gap;
  const indicatorHeight = hasOverflowIndicator ? 1 : 0;

  // First pass: how many items fit without any indicators?
  const maxWithoutIndicators = Math.floor(
    availableHeight / effectiveItemHeight,
  );

  // If all items fit, no scrolling needed
  if (items.length <= maxWithoutIndicators) {
    return {
      visible: items.map((item, index) => ({ item, index })),
      scrollOffset: 0,
      overflowTop: 0,
      overflowBottom: 0,
    };
  }

  // Need scrolling - calculate scroll offset first to know which indicators show
  // Start by estimating maxVisible with space for both indicators
  let maxVisible = Math.max(
    1,
    Math.floor((availableHeight - indicatorHeight * 2) / effectiveItemHeight),
  );

  // Calculate scroll offset to keep selected item visible (centered when possible)
  const halfVisible = Math.floor(maxVisible / 2);
  let scrollOffset = Math.max(0, selectedIndex - halfVisible);
  scrollOffset = Math.min(scrollOffset, items.length - maxVisible);

  // Now we know which indicators will show based on scroll position
  const willShowTop = scrollOffset > 0;
  const willShowBottom = scrollOffset + maxVisible < items.length;
  const actualIndicatorSpace =
    (willShowTop ? indicatorHeight : 0) +
    (willShowBottom ? indicatorHeight : 0);

  // Recalculate maxVisible with actual indicator space needed
  if (hasOverflowIndicator) {
    maxVisible = Math.max(
      1,
      Math.floor(
        (availableHeight - actualIndicatorSpace) / effectiveItemHeight,
      ),
    );

    // Recalculate scroll offset with new maxVisible
    scrollOffset = Math.max(0, selectedIndex - Math.floor(maxVisible / 2));
    scrollOffset = Math.min(scrollOffset, items.length - maxVisible);
  }

  // Build visible items list
  const visible = items
    .slice(scrollOffset, scrollOffset + maxVisible)
    .map((item, i) => ({
      item,
      index: scrollOffset + i,
    }));

  return {
    visible,
    scrollOffset,
    overflowTop: scrollOffset,
    overflowBottom: Math.max(0, items.length - scrollOffset - maxVisible),
  };
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
  } = {},
): ScrollState<T> {
  const { parent } = useConstraintContext();
  const {
    itemHeight = 1,
    gap = 0,
    height: heightOverride,
    hasOverflowIndicator = true,
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
      ),
    [
      items,
      selectedIndex,
      availableHeight,
      itemHeight,
      gap,
      hasOverflowIndicator,
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
      ),
    [
      items,
      selectedIndex,
      availableHeight,
      itemHeight,
      gap,
      hasOverflowIndicator,
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
