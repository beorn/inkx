/**
 * FlexRow Component - Inkx Version
 *
 * Distributes horizontal space among children using flex semantics.
 * Uses ink-measure's distributeSpace for the core algorithm, renders with inkx Box.
 */

import React, { useMemo } from "react";
import { Box } from "inkx";
import {
  ConstraintContext,
  useConstraintContext,
  type ComputedSize,
} from "./context.tsx";
import {
  distributeSpace,
  type FlexItemConfig,
} from "ink-measure";

// Re-export for backwards compatibility
export { distributeSpace, type FlexItemConfig };

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
