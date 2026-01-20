/**
 * Layout Factory
 *
 * Creates framework-bound layout components from tui-measure primitives.
 * Single source of truth for both inkx and vanilla ink bindings.
 */

import React, { useMemo, type ComponentType, type ReactNode, type ReactElement } from "react";
import {
  ConstraintRoot as BaseConstraintRoot,
  ConstraintContext,
  useConstraintContext,
  useComputedSize,
  useTerminalSize,
  FlexRow as BaseFlexRow,
  FlexItem,
  distributeSpace,
  calculateScrollState,
  useScrollState as baseUseScrollState,
  constrainText,
  displayLength,
  stripAnsi,
  wrapText,
  truncateText,
  padText,
  calcScrollOffset,
  ANSI_REGEX,
  type ConstraintContextValue,
  type ComputedSize,
  type TerminalSize,
  type FlexItemConfig,
  type FlexRowProps as BaseFlexRowProps,
  type FlexItemProps as BaseFlexItemProps,
  type ScrollState,
} from "@beorn/tui-measure";

// Re-export pure utilities and types (no framework binding needed)
export {
  ConstraintContext,
  useConstraintContext,
  useComputedSize,
  useTerminalSize,
  FlexItem,
  distributeSpace,
  calculateScrollState,
  constrainText,
  displayLength,
  stripAnsi,
  wrapText,
  truncateText,
  padText,
  calcScrollOffset,
  ANSI_REGEX,
  type ConstraintContextValue,
  type ComputedSize,
  type TerminalSize,
  type FlexItemConfig,
  type ScrollState,
};

/**
 * Framework interface - the minimal API needed from ink/inkx
 */
export interface Framework {
  Box: ComponentType<{
    flexDirection?: "row" | "column";
    gap?: number;
    width?: number;
    children?: ReactNode;
  }>;
  Text: ComponentType<{
    children?: ReactNode;
    backgroundColor?: string;
    color?: string;
  }>;
  useStdout: () => { stdout: NodeJS.WriteStream | undefined };
}

// Component prop types
export interface ConstraintRootProps {
  children: ReactNode;
  padding?: number | { x?: number; y?: number };
}

export interface FlexRowProps {
  children: ReactNode;
  gap?: number;
}

export interface FlexItemProps extends FlexItemConfig {
  children: ReactNode;
}

export interface TruncatedTextProps {
  children: string;
  ellipsis?: string;
  maxLines?: number;
  width?: number;
  pad?: boolean;
}

export interface ScrollableListProps<T> {
  items: T[];
  selectedIndex: number;
  itemHeight?: number;
  getItemHeight?: (item: T, index: number) => number;
  renderItem: (item: T, index: number, isSelected: boolean) => ReactNode;
  renderOverflow?: (direction: "top" | "bottom", count: number) => ReactNode;
  gap?: number;
  height?: number;
}

/**
 * Create layout components bound to a specific framework (ink or inkx)
 */
export function createLayoutComponents(fw: Framework) {
  const { Box, Text, useStdout } = fw;

  /**
   * Root component that provides terminal dimensions via context
   */
  function ConstraintRoot({ children, padding = 0 }: ConstraintRootProps): ReactElement {
    const { stdout } = useStdout();
    return (
      <BaseConstraintRoot stdout={stdout ?? undefined} padding={padding}>
        {children}
      </BaseConstraintRoot>
    );
  }

  /**
   * FlexRow distributes horizontal space among children
   */
  function FlexRow({ children, gap = 0 }: FlexRowProps): ReactElement {
    const context = useConstraintContext();
    const { parent, terminal } = context;
    const childArray = React.Children.toArray(children);

    const configs: FlexItemConfig[] = childArray.map((child) => {
      if (React.isValidElement(child) && child.type === FlexItem) {
        const props = child.props as BaseFlexItemProps;
        return {
          flex: props.flex,
          width: props.width,
          minWidth: props.minWidth,
          maxWidth: props.maxWidth,
          squish: props.squish,
        };
      }
      return { flex: 1 };
    });

    const widths = useMemo(
      () => distributeSpace(parent.width, configs, gap),
      [parent.width, configs, gap],
    );

    return (
      <Box flexDirection="row" gap={gap}>
        {childArray.map((child, i) => {
          const width = widths[i] ?? 0;
          const childSize: ComputedSize = { width, height: parent.height };

          const content =
            React.isValidElement(child) && child.type === FlexItem
              ? (child.props as BaseFlexItemProps).children
              : child;

          return (
            <ConstraintContext.Provider
              key={i}
              value={{ terminal, parent: childSize }}
            >
              <Box width={width}>{content}</Box>
            </ConstraintContext.Provider>
          );
        })}
      </Box>
    );
  }

  /**
   * TruncatedText with automatic width from context
   */
  function TruncatedText({
    children,
    ellipsis = "…",
    maxLines = 1,
    width: widthOverride,
    pad = false,
  }: TruncatedTextProps): ReactElement {
    let contextSize: ComputedSize | null = null;
    try {
      contextSize = useComputedSize();
    } catch {
      // Not inside ConstraintRoot
    }

    const width = widthOverride ?? contextSize?.width ?? 80;

    const { lines } = useMemo(
      () => constrainText(children, width, maxLines, pad, ellipsis),
      [children, width, maxLines, pad, ellipsis],
    );

    return (
      <>
        {lines.map((line, i) => (
          <Text key={i}>{line}</Text>
        ))}
      </>
    );
  }

  /**
   * Hook for truncated text (returns lines instead of rendering)
   */
  function useTruncatedText(
    text: string,
    options: {
      maxLines?: number;
      width?: number;
      pad?: boolean;
      ellipsis?: string;
    } = {},
  ): { lines: string[]; truncated: boolean } {
    const { maxLines = 1, width: widthOverride, pad = false, ellipsis } = options;

    let contextSize: ComputedSize | null = null;
    try {
      contextSize = useComputedSize();
    } catch {
      // Not inside ConstraintRoot
    }

    const width = widthOverride ?? contextSize?.width ?? 80;

    return useMemo(
      () => constrainText(text, width, maxLines, pad, ellipsis),
      [text, width, maxLines, pad, ellipsis],
    );
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
  }): ReactElement {
    const arrow = direction === "top" ? "▲" : "▼";
    const text = `${arrow} ${count} more`;
    return (
      <Text backgroundColor="gray" color="white">
        {text}
      </Text>
    );
  }

  /**
   * ScrollableList with virtualized scrolling
   */
  function ScrollableList<T>({
    items,
    selectedIndex,
    itemHeight = 1,
    getItemHeight,
    renderItem,
    renderOverflow,
    gap = 0,
    height: heightOverride,
  }: ScrollableListProps<T>): ReactElement {
    const { parent } = useConstraintContext();
    const availableHeight = heightOverride ?? parent.height;

    const hasOverflowIndicator = true; // Always show indicators

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
      [items, selectedIndex, availableHeight, itemHeight, gap, hasOverflowIndicator, getItemHeight],
    );

    const renderOverflowIndicator = (direction: "top" | "bottom", count: number): ReactNode => {
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

  /**
   * Hook to calculate scroll state from context
   */
  function useScrollState<T>(
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
      [items, selectedIndex, availableHeight, itemHeight, gap, hasOverflowIndicator, getItemHeight],
    );
  }

  return {
    // Components
    ConstraintRoot,
    FlexRow,
    FlexItem, // Pass through from tui-measure
    TruncatedText,
    ScrollableList,
    // Hooks
    useTruncatedText,
    useScrollState,
  };
}
