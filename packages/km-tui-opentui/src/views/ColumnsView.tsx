/**
 * ColumnsView for OpenTUI
 *
 * Multiple columns side-by-side with tree hierarchy inside each.
 * Includes scroll indicators and per-column card scrolling.
 */

import type { ReactElement } from "react";
import { TreeNode } from "../components/index.ts";
import type { ColumnViewModel } from "../types.ts";

interface ColumnsViewProps {
  columns: ColumnViewModel[];
  selectedCol: number;
  selectedCard: number;
  width?: number;
  height?: number;
  scrollOffset?: number;
  maxVisibleCols?: number;
}

interface ColumnTreeProps {
  column: ColumnViewModel;
  colIndex: number;
  isSelected: boolean;
  selectedCardIndex: number;
  width: number;
  height: number;
}

function ColumnTree({
  column,
  colIndex,
  isSelected,
  selectedCardIndex,
  width,
  height,
}: ColumnTreeProps): ReactElement {
  // Header colors
  const headerBg = isSelected ? "cyan" : undefined;
  const headerColor = isSelected ? "black" : "yellow";

  // Calculate visible cards with scrolling
  const contentHeight = Math.max(1, height - 3);
  const needsScroll = column.cards.length > contentHeight;
  const scrollOffset = needsScroll
    ? Math.max(
        0,
        Math.min(
          selectedCardIndex - Math.floor(contentHeight / 2),
          Math.max(0, column.cards.length - contentHeight),
        ),
      )
    : 0;

  const visibleCards = column.cards.slice(
    scrollOffset,
    scrollOffset + contentHeight,
  );

  return (
    <box flexDirection="column" width={width} height={height}>
      {/* Header section */}
      <box flexDirection="column" height={2}>
        <text> </text>
        <text bold={isSelected} color={headerColor} backgroundColor={headerBg}>
          {column.title} ({column.count})
        </text>
      </box>

      {/* Cards area */}
      <box flexDirection="column" flexGrow={1}>
        {scrollOffset > 0 && (
          <text color="gray"> ▲ {scrollOffset} above</text>
        )}
        {visibleCards.map((card, i) => {
          const actualCardIndex = scrollOffset + i;
          const isCardSelected = isSelected && actualCardIndex === selectedCardIndex;

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
              }}
              depth={0}
              width={width}
              isSelected={isCardSelected}
              variant="compact"
            />
          );
        })}
        {needsScroll && scrollOffset + visibleCards.length < column.cards.length && (
          <text color="gray">
            {"  "}▼ {column.cards.length - scrollOffset - visibleCards.length} below
          </text>
        )}
      </box>
    </box>
  );
}

export function ColumnsView({
  columns,
  selectedCol,
  selectedCard,
  width = 80,
  height = 24,
  scrollOffset = 0,
  maxVisibleCols = 4,
}: ColumnsViewProps): ReactElement {
  // Calculate which columns are visible
  const hasLeftIndicator = scrollOffset > 0;
  const hasRightIndicator = scrollOffset + maxVisibleCols < columns.length;
  const indicatorWidth = (hasLeftIndicator ? 1 : 0) + (hasRightIndicator ? 1 : 0);
  const availableWidth = width - indicatorWidth;

  // Get visible columns
  const visibleColumns = columns.slice(scrollOffset, scrollOffset + maxVisibleCols);
  const separatorCount = Math.max(0, visibleColumns.length - 1);
  const colWidth = Math.floor((availableWidth - separatorCount) / Math.max(1, visibleColumns.length));

  return (
    <box flexDirection="row" width={width} height={height} flexGrow={1}>
      {/* Left scroll indicator */}
      {hasLeftIndicator && (
        <box width={1} height={height}>
          <text backgroundColor="gray" color="white">
            {"‹".padStart(Math.floor(height / 2), " ")}
          </text>
        </box>
      )}

      {/* Columns */}
      {visibleColumns.map((col, i) => {
        const actualColIndex = scrollOffset + i;
        const isLastCol = i === visibleColumns.length - 1;

        return (
          <box key={col.id} flexDirection="row">
            <ColumnTree
              column={col}
              colIndex={actualColIndex}
              isSelected={actualColIndex === selectedCol}
              selectedCardIndex={selectedCard}
              width={colWidth}
              height={height}
            />
            {/* Separator */}
            {!isLastCol && (
              <box width={1} flexDirection="column">
                <text> </text>
                {Array.from({ length: height - 1 }).map((_, j) => (
                  <text key={j} color="gray">│</text>
                ))}
              </box>
            )}
          </box>
        );
      })}

      {/* Right scroll indicator */}
      {hasRightIndicator && (
        <box width={1} height={height}>
          <text backgroundColor="gray" color="white">
            {"›".padStart(Math.floor(height / 2), " ")}
          </text>
        </box>
      )}

      {columns.length === 0 && <text color="gray">No columns to display</text>}
    </box>
  );
}

export default ColumnsView;
