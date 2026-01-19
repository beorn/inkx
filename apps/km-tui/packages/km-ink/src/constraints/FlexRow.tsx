/**
 * FlexRow Component
 *
 * Distributes horizontal space among children using flex semantics.
 * Uses integer math to avoid floating-point errors that cause 1-char gaps.
 */

import React, { useMemo } from "react";
import { Box } from "inkx";
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
  children: React.ReactNode;
  /** Gap between items in characters */
  gap?: number;
}

export interface FlexItemProps extends FlexItemConfig {
  children: React.ReactNode;
}

/**
 * FlexItem is a marker component that FlexRow reads props from.
 * The actual rendering is done by FlexRow.
 */
export function FlexItem({ children }: FlexItemProps): React.ReactElement {
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
 * <FlexRow gap={1}>
 *   <FlexItem width={10}><Prefix /></FlexItem>
 *   <FlexItem flex={2}><Title /></FlexItem>
 *   <FlexItem flex={1}><Status /></FlexItem>
 * </FlexRow>
 * ```
 */
export function FlexRow({
  children,
  gap = 0,
}: FlexRowProps): React.ReactElement {
  const context = useConstraintContext();
  const { parent, terminal } = context;
  const childArray = React.Children.toArray(children);

  // Extract configs from children props
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
    // Default: flex equally with other non-FlexItem children
    return { flex: 1 };
  });

  // Calculate widths using integer math
  const widths = useMemo(
    () => distributeSpace(parent.width, configs, gap),
    [parent.width, configs, gap],
  );

  return (
    <Box flexDirection="row" gap={gap}>
      {childArray.map((child, i) => {
        const width = widths[i] ?? 0;
        const childSize: ComputedSize = { width, height: parent.height };

        // Get the actual content to render
        const content =
          React.isValidElement(child) && child.type === FlexItem
            ? (child.props as FlexItemProps).children
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

  // Account for gaps between items
  const gapTotal = Math.max(0, configs.length - 1) * gap;
  let available = Math.max(0, total - gapTotal);

  const widths: number[] = new Array(configs.length).fill(0);

  // Pass 1: Allocate fixed widths
  let flexTotal = 0;
  let flexItemCount = 0;

  configs.forEach((config, i) => {
    if (config.width !== undefined) {
      widths[i] = config.width;
      available -= config.width;
    } else {
      const flex = config.flex ?? 1;
      flexTotal += flex;
      flexItemCount++;
    }
  });

  // Ensure available doesn't go negative
  available = Math.max(0, available);

  // Pass 2: Distribute remaining space to flex items using integer division
  if (flexTotal > 0 && available > 0) {
    let remaining = available;

    configs.forEach((config, i) => {
      if (config.width === undefined) {
        const flex = config.flex ?? 1;
        // Integer division: floor(available * flex / flexTotal)
        const share = Math.floor((available * flex) / flexTotal);
        widths[i] = share;
        remaining -= share;
      }
    });

    // Distribute remainder to first flex items (1 char each)
    // This ensures we use exactly all available space
    for (let i = 0; remaining > 0 && i < configs.length; i++) {
      if (configs[i]?.width === undefined) {
        widths[i]++;
        remaining--;
      }
    }
  }

  // Pass 3: Apply min/max constraints
  // Note: This may violate the total width if constraints conflict
  // A more sophisticated implementation would iterate until stable
  configs.forEach((config, i) => {
    const currentWidth = widths[i] ?? 0;

    if (config.minWidth !== undefined && currentWidth < config.minWidth) {
      // Only enforce minWidth if not squishable or if we have room
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
