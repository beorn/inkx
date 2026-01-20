/**
 * FlexRow Component
 *
 * Distributes horizontal space among children using flex semantics.
 * Uses integer math to avoid floating-point errors that cause 1-char gaps.
 */

import React, { useMemo, type ReactNode, type ReactElement } from "react";
import {
  ConstraintContext,
  useConstraintContext,
  type ComputedSize,
} from "./context.tsx";

/** Configuration for a flex item */
export interface FlexItemConfig {
  /** Flex grow factor (default 1 for FlexItem, 0 for raw children) */
  flex?: number;
  /** Fixed width (takes precedence over flex) */
  width?: number;
  /** Minimum width */
  minWidth?: number;
  /** Maximum width */
  maxWidth?: number;
  /** Allow shrinking below minWidth when necessary */
  squish?: boolean;
}

export interface FlexRowProps {
  children: ReactNode;
  /** Gap between items in characters */
  gap?: number;
  /**
   * Render function for the row container.
   * Receives the row children with computed widths.
   * Default renders children directly (no wrapper).
   *
   * @example
   * ```tsx
   * // With Ink Box
   * <FlexRow
   *   gap={1}
   *   renderRow={(children) => <Box flexDirection="row" gap={1}>{children}</Box>}
   * >
   *   ...
   * </FlexRow>
   * ```
   */
  renderRow?: (children: ReactNode) => ReactElement;
  /**
   * Render function for each item wrapper.
   * Receives the item content and computed width.
   * Default renders content directly (no wrapper).
   *
   * @example
   * ```tsx
   * // With Ink Box
   * <FlexRow
   *   renderItem={(content, width) => <Box width={width}>{content}</Box>}
   * >
   *   ...
   * </FlexRow>
   * ```
   */
  renderItem?: (content: ReactNode, width: number) => ReactElement;
}

export interface FlexItemProps extends FlexItemConfig {
  children: ReactNode;
}

/**
 * FlexItem is a marker component that FlexRow reads props from.
 * The actual rendering is done by FlexRow.
 */
export function FlexItem({ children }: FlexItemProps): ReactElement {
  return <>{children}</>;
}

/**
 * FlexRow distributes horizontal space among children.
 *
 * Children can be:
 * - FlexItem with explicit props (flex, width, minWidth, maxWidth)
 * - Any element (defaults to flex: 1)
 *
 * @example
 * ```tsx
 * // Basic usage (renders flat, no Box wrapper)
 * <FlexRow gap={1}>
 *   <FlexItem width={10}><Prefix /></FlexItem>
 *   <FlexItem flex={2}><Title /></FlexItem>
 *   <FlexItem flex={1}><Status /></FlexItem>
 * </FlexRow>
 *
 * // With Ink Box wrappers
 * <FlexRow
 *   gap={1}
 *   renderRow={(children) => <Box flexDirection="row" gap={1}>{children}</Box>}
 *   renderItem={(content, width) => <Box width={width}>{content}</Box>}
 * >
 *   <FlexItem width={10}><Prefix /></FlexItem>
 *   <FlexItem flex={2}><Title /></FlexItem>
 * </FlexRow>
 * ```
 */
export function FlexRow({
  children,
  gap = 0,
  renderRow,
  renderItem,
}: FlexRowProps): ReactElement {
  const context = useConstraintContext();
  const { parent, terminal } = context;
  const childArray = React.Children.toArray(children);

  const configs: FlexItemConfig[] = childArray.map((child) => {
    if (React.isValidElement(child) && child.type === FlexItem) {
      const props = child.props as FlexItemProps;
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

  const items = childArray.map((child, i) => {
    const width = widths[i] ?? 0;
    const childSize: ComputedSize = { width, height: parent.height };

    const content =
      React.isValidElement(child) && child.type === FlexItem
        ? (child.props as FlexItemProps).children
        : child;

    const wrappedContent = (
      <ConstraintContext.Provider
        key={i}
        value={{ terminal, parent: childSize }}
      >
        {renderItem ? renderItem(content, width) : content}
      </ConstraintContext.Provider>
    );

    return wrappedContent;
  });

  return renderRow ? renderRow(items) : <>{items}</>;
}

/**
 * Distribute available space among items using integer math.
 * Avoids floating-point errors that cause 1-char gaps.
 *
 * Algorithm:
 * 1. Subtract gap space from total
 * 2. Allocate fixed-width items first
 * 3. Distribute remaining space proportionally to flex items
 * 4. Apply min/max constraints
 * 5. Distribute remainder chars one at a time to flex items
 */
export function distributeSpace(
  total: number,
  configs: FlexItemConfig[],
  gap: number,
): number[] {
  if (configs.length === 0) {
    return [];
  }

  const gapTotal = Math.max(0, configs.length - 1) * gap;
  let available = Math.max(0, total - gapTotal);

  const widths: number[] = new Array(configs.length).fill(0);

  // Pass 1: Allocate fixed widths
  let flexTotal = 0;

  configs.forEach((config, i) => {
    if (config.width !== undefined) {
      widths[i] = config.width;
      available -= config.width;
    } else {
      const flex = config.flex ?? 1;
      flexTotal += flex;
    }
  });

  available = Math.max(0, available);

  // Pass 2: Distribute remaining space to flex items using integer division
  if (flexTotal > 0 && available > 0) {
    let remaining = available;

    configs.forEach((config, i) => {
      if (config.width === undefined) {
        const flex = config.flex ?? 1;
        const share = Math.floor((available * flex) / flexTotal);
        widths[i] = share;
        remaining -= share;
      }
    });

    // Distribute remainder to first flex items (1 char each)
    for (let i = 0; remaining > 0 && i < configs.length; i++) {
      if (configs[i]?.width === undefined) {
        widths[i]++;
        remaining--;
      }
    }
  }

  // Pass 3: Apply min/max constraints
  configs.forEach((config, i) => {
    const currentWidth = widths[i] ?? 0;

    if (config.minWidth !== undefined && currentWidth < config.minWidth) {
      if (!config.squish) {
        widths[i] = config.minWidth;
      }
    }

    if (config.maxWidth !== undefined && currentWidth > config.maxWidth) {
      widths[i] = config.maxWidth;
    }
  });

  return widths;
}
