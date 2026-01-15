/**
 * Column Component
 *
 * Stateless column container with header and scrollable content.
 * Uses OpenTUI's scrollbox for native scrolling support.
 */

import { useRef, useEffect } from "react";
import type { ScrollBoxRenderable } from "@opentui/core";

interface ColumnProps {
  title: string;
  count: number;
  wipLimit?: number;
  isActive: boolean;
  isCollapsed: boolean;
  selectedIndex: number;
  cardHeight?: number;
  children: React.ReactNode;
}

// Default card height for scroll calculations
const DEFAULT_CARD_HEIGHT = 3;

export function Column({
  title,
  count,
  wipLimit,
  isActive,
  isCollapsed,
  selectedIndex,
  cardHeight = DEFAULT_CARD_HEIGHT,
  children,
}: ColumnProps) {
  const scrollboxRef = useRef<ScrollBoxRenderable>(null);
  const isOverLimit = wipLimit !== undefined && count > wipLimit;

  // Auto-scroll to keep selected card visible
  useEffect(() => {
    if (!isActive || !scrollboxRef.current || selectedIndex < 0) return;
    const scrollbox = scrollboxRef.current;
    const targetScrollTop = selectedIndex * cardHeight;
    scrollbox.scrollTo(targetScrollTop);
  }, [selectedIndex, isActive, cardHeight]);

  // Build header text
  const headerColor = isActive ? "cyan" : isOverLimit ? "red" : "white";
  let headerText = title;
  if (wipLimit !== undefined) {
    headerText = `${title} (${count}/${wipLimit})`;
  } else {
    headerText = `${title} (${count})`;
  }

  if (isCollapsed) {
    // Collapsed: just show header
    return (
      <box flexDirection="column" width={3}>
        <box paddingLeft={1}>
          <text bold color={headerColor}>
            {count}
          </text>
        </box>
      </box>
    );
  }

  return (
    <box flexDirection="column" flexGrow={1} height="100%">
      {/* Header */}
      <box paddingLeft={1}>
        <text bold color={headerColor}>
          {headerText}
        </text>
      </box>

      {/* Scrollable cards */}
      <scrollbox ref={scrollboxRef} flexGrow={1}>
        {children}
      </scrollbox>
    </box>
  );
}

export default Column;
