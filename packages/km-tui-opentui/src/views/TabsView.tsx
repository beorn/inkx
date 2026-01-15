/**
 * TabsView for OpenTUI
 *
 * Tab-based interface showing one column at a time.
 * Tab bar at top for switching between columns.
 */

import type { ReactElement } from "react";
import { TreeNode } from "../components/index.ts";
import type { ColumnViewModel } from "../types.ts";

interface TabsViewProps {
  columns: ColumnViewModel[];
  selectedCol: number;
  selectedCard: number;
  selectedCards: Set<string>;
  width?: number;
  height?: number;
}

export function TabsView({
  columns,
  selectedCol,
  selectedCard,
  selectedCards,
  width = 80,
  height = 24,
}: TabsViewProps): ReactElement {
  // Current column
  const currentColumn = columns[selectedCol];
  const count = currentColumn?.cards.length ?? 0;

  // Calculate visible cards with scrolling
  const contentHeight = Math.max(1, height - 6); // tab bar + border + margins
  const needsScroll = count > contentHeight;
  const scrollOffset = needsScroll
    ? Math.max(
        0,
        Math.min(
          selectedCard - Math.floor(contentHeight / 2),
          Math.max(0, count - contentHeight),
        ),
      )
    : 0;

  const visibleCards = currentColumn
    ? currentColumn.cards.slice(scrollOffset, scrollOffset + contentHeight)
    : [];

  // Calculate max tab width
  const maxTabWidth = Math.floor((width - 4) / Math.max(columns.length, 1)) - 3;

  return (
    <box flexDirection="column" width={width} height={height} flexGrow={1}>
      {/* Spacer */}
      <box height={1} />

      {/* Tab bar */}
      <box flexDirection="row" width={width} height={1}>
        {columns.map((column, colIndex) => {
          const isActive = colIndex === selectedCol;
          // Truncate tab name if needed
          const truncatedName =
            column.title.length > maxTabWidth
              ? column.title.slice(0, maxTabWidth - 1) + "…"
              : column.title;

          return (
            <box key={column.id} marginRight={1}>
              <text
                bold={isActive}
                color={isActive ? "black" : "white"}
                backgroundColor={isActive ? "cyan" : undefined}
              >
                {truncatedName} ({column.count})
              </text>
              {colIndex < columns.length - 1 && <text color="gray"> │</text>}
            </box>
          );
        })}
      </box>

      {/* Top border */}
      <text color="gray">{"─".repeat(width)}</text>

      {/* Content area */}
      <box flexDirection="column" flexGrow={1}>
        {currentColumn ? (
          count > 0 ? (
            <box flexDirection="column" flexGrow={1}>
              {scrollOffset > 0 && (
                <text color="gray"> ▲ {scrollOffset} above</text>
              )}
              {visibleCards.map((card, i) => {
                const actualCardIndex = scrollOffset + i;
                const isCardSelected = actualCardIndex === selectedCard;

                return (
                  <TreeNode
                    key={card.id}
                    node={{
                      id: card.id,
                      title: card.title,
                      isTask: card.taskStatus !== undefined,
                      taskStatus: card.taskStatus,
                      childCount: card.childCount,
                      color: card.color,
                      priority: card.priority,
                      dueDate: card.dueDate,
                      hasBacklinks: card.hasBacklinks,
                      refsCount: card.refsCount,
                    }}
                    depth={0}
                    width={width - 4}
                    isSelected={isCardSelected}
                    isMultiSelected={selectedCards.has(card.id)}
                    variant="wide"
                  />
                );
              })}
              {needsScroll && scrollOffset + visibleCards.length < count && (
                <text color="gray">
                  {" "}
                  ▼ {count - scrollOffset - visibleCards.length} below
                </text>
              )}
            </box>
          ) : (
            <box marginLeft={1}>
              <text color="gray">(empty)</text>
            </box>
          )
        ) : (
          <text color="gray">No column selected</text>
        )}
      </box>
    </box>
  );
}

export default TabsView;
