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
 *
 * Supports variable-height items via getItemHeight callback.
 */
export function calculateScrollState<T>(
  items: T[],
  selectedIndex: number,
  availableHeight: number,
  itemHeight: number,
  gap: number,
  hasOverflowIndicator: boolean,
  getItemHeight?: (item: T, index: number) => number,
): ScrollState<T> {
  if (items.length === 0) {
    return {
      visible: [],
      scrollOffset: 0,
      overflowTop: 0,
      overflowBottom: 0,
    };
  }

  const indicatorHeight = hasOverflowIndicator ? 1 : 0;

  // If using variable heights, we need a different algorithm
  if (getItemHeight) {
    return calculateVariableHeightScrollState(
      items,
      selectedIndex,
      availableHeight,
      gap,
      indicatorHeight,
      getItemHeight,
    );
  }

  // Fixed height algorithm (original)
  const effectiveItemHeight = itemHeight + gap;

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
 * Calculate scroll state for variable-height items.
 * Uses cumulative heights to determine which items fit.
 */
function calculateVariableHeightScrollState<T>(
  items: T[],
  selectedIndex: number,
  availableHeight: number,
  gap: number,
  indicatorHeight: number,
  getItemHeight: (item: T, index: number) => number,
): ScrollState<T> {
  // Calculate heights for all items (guaranteed same length as items)
  const heights: number[] = items.map(
    (item, i) => getItemHeight(item, i) + gap,
  );
  const totalHeight = heights.reduce((sum, h) => sum + h, 0);

  // Check if all items fit
  if (totalHeight <= availableHeight) {
    return {
      visible: items.map((item, index) => ({ item, index })),
      scrollOffset: 0,
      overflowTop: 0,
      overflowBottom: 0,
    };
  }

  // Need scrolling - find a window that includes selectedIndex
  // Strategy: center the selected item, then adjust
  const safeSelectedIndex = Math.min(selectedIndex, items.length - 1);
  const selectedHeight = heights[safeSelectedIndex] ?? 1;
  let heightBefore = 0;
  for (let i = 0; i < safeSelectedIndex; i++) {
    heightBefore += heights[i] ?? 0;
  }

  // Target: selected item roughly centered
  const targetScrollTop = heightBefore - (availableHeight - selectedHeight) / 2;

  // Find scroll offset (first visible item index) based on target scroll position
  let scrollOffset = 0;
  let cumulativeHeight = 0;
  for (let i = 0; i < items.length; i++) {
    if (cumulativeHeight >= targetScrollTop) {
      scrollOffset = i;
      break;
    }
    cumulativeHeight += heights[i] ?? 0;
    scrollOffset = i + 1;
  }
  scrollOffset = Math.max(0, Math.min(scrollOffset, items.length - 1));

  // Determine which indicators will show
  const willShowTop = scrollOffset > 0;
  let effectiveHeight = availableHeight - (willShowTop ? indicatorHeight : 0);

  // Find how many items fit starting from scrollOffset
  let usedHeight = 0;
  let endIndex = scrollOffset;
  for (let i = scrollOffset; i < items.length; i++) {
    const itemH = heights[i] ?? 1;
    // Reserve space for bottom indicator if more items remain
    const needsBottomIndicator = i + 1 < items.length;
    const reserveForBottom = needsBottomIndicator ? indicatorHeight : 0;

    if (usedHeight + itemH <= effectiveHeight - reserveForBottom) {
      usedHeight += itemH;
      endIndex = i + 1;
    } else {
      break;
    }
  }

  // Ensure selected item is visible - adjust if needed
  if (safeSelectedIndex < scrollOffset) {
    // Selected item is above visible area - scroll up
    scrollOffset = safeSelectedIndex;
    // Recalculate visible items
    usedHeight = 0;
    endIndex = scrollOffset;
    effectiveHeight =
      availableHeight - (scrollOffset > 0 ? indicatorHeight : 0);
    for (let i = scrollOffset; i < items.length; i++) {
      const itemH = heights[i] ?? 1;
      const needsBottomIndicator = i + 1 < items.length;
      const reserveForBottom = needsBottomIndicator ? indicatorHeight : 0;
      if (usedHeight + itemH <= effectiveHeight - reserveForBottom) {
        usedHeight += itemH;
        endIndex = i + 1;
      } else {
        break;
      }
    }
  } else if (safeSelectedIndex >= endIndex) {
    // Selected item is below visible area - scroll down
    // Work backwards from selected to find scroll offset
    usedHeight = heights[safeSelectedIndex] ?? 1;
    scrollOffset = safeSelectedIndex;
    const hasBottom = safeSelectedIndex + 1 < items.length;
    effectiveHeight =
      availableHeight - indicatorHeight - (hasBottom ? indicatorHeight : 0);
    for (let i = safeSelectedIndex - 1; i >= 0; i--) {
      const h = heights[i] ?? 0;
      if (usedHeight + h <= effectiveHeight) {
        usedHeight += h;
        scrollOffset = i;
      } else {
        break;
      }
    }
    // Recalculate end index
    usedHeight = 0;
    endIndex = scrollOffset;
    effectiveHeight =
      availableHeight - (scrollOffset > 0 ? indicatorHeight : 0);
    for (let i = scrollOffset; i < items.length; i++) {
      const itemH = heights[i] ?? 1;
      const needsBottomIndicator = i + 1 < items.length;
      const reserveForBottom = needsBottomIndicator ? indicatorHeight : 0;
      if (usedHeight + itemH <= effectiveHeight - reserveForBottom) {
        usedHeight += itemH;
        endIndex = i + 1;
      } else {
        break;
      }
    }
  }

  // Build visible items list
  const visible = items.slice(scrollOffset, endIndex).map((item, i) => ({
    item,
    index: scrollOffset + i,
  }));

  return {
    visible,
    scrollOffset,
    overflowTop: scrollOffset,
    overflowBottom: Math.max(0, items.length - endIndex),
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
