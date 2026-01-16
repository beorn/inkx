/**
 * ColumnsView for OpenTUI
 *
 * Multiple columns side-by-side with tree hierarchy inside each.
 * Includes scroll indicators and per-column card scrolling.
 */

import type { ReactElement } from "react";
import { TreeNode } from "../components/index.ts";
import type { NodeViewModel, TreeViewModel } from "../types.ts";

interface ColumnsViewProps {
  viewModel: TreeViewModel;
  width?: number;
  height?: number;
  scrollOffset?: number;
  maxVisibleCols?: number;
}

interface ColumnTreeProps {
  node: NodeViewModel;
  colIndex: number;
  isSelected: boolean;
  selectedCardIndex: number;
  selectedNodes: Set<string>;
  width: number;
  height: number;
}

function ColumnTree({
  node,
  colIndex: _colIndex,
  isSelected,
  selectedCardIndex,
  selectedNodes,
  width,
  height,
}: ColumnTreeProps): ReactElement {
  // Header colors - design system: selected cyan bg+black fg, unselected yellowBright+dim
  const headerBg = isSelected ? "cyan" : undefined;
  const headerColor = isSelected ? "black" : "yellowBright";

  // Calculate visible cards with scrolling
  const contentHeight = Math.max(1, height - 3);
  const needsScroll = node.children.length > contentHeight;
  const scrollOffset = needsScroll
    ? Math.max(
        0,
        Math.min(
          selectedCardIndex - Math.floor(contentHeight / 2),
          Math.max(0, node.children.length - contentHeight),
        ),
      )
    : 0;

  const visibleChildren = node.children.slice(
    scrollOffset,
    scrollOffset + contentHeight,
  );

  return (
    <box flexDirection="column" width={width} height={height}>
      {/* Header section */}
      <box flexDirection="column" height={2}>
        <text> </text>
        <text
          bold={isSelected}
          dim={!isSelected}
          color={headerColor}
          backgroundColor={headerBg}
        >
          {node.title} ({node.childCount})
        </text>
      </box>

      {/* Cards area */}
      <box flexDirection="column" flexGrow={1}>
        {scrollOffset > 0 && <text color="gray"> ▲ {scrollOffset} above</text>}
        {visibleChildren.map((child: NodeViewModel, i: number) => {
          const actualCardIndex = scrollOffset + i;
          const isCardSelected =
            isSelected && actualCardIndex === selectedCardIndex;

          return (
            <TreeNode
              key={child.id}
              node={{
                id: child.id,
                title: child.title,
                isTask: child.taskStatus !== undefined,
                taskStatus: child.taskStatus,
                childCount: child.childCount,
                color: child.color,
                priority: child.priority,
                dueDate: child.dueDate,
                hasBacklinks: child.hasBacklinks,
                refsCount: child.refsCount,
              }}
              depth={0}
              width={width}
              isSelected={isCardSelected}
              isMultiSelected={selectedNodes.has(child.id)}
              variant="compact"
            />
          );
        })}
        {needsScroll &&
          scrollOffset + visibleChildren.length < node.children.length && (
            <text color="gray">
              {"  "}▼{" "}
              {node.children.length - scrollOffset - visibleChildren.length}{" "}
              below
            </text>
          )}
      </box>
    </box>
  );
}

export function ColumnsView({
  viewModel,
  width = 80,
  height = 24,
  scrollOffset = 0,
  maxVisibleCols = 4,
}: ColumnsViewProps): ReactElement {
  const { nodes, cursor, selectedNodes } = viewModel;
  const selectedCol = cursor[0] ?? -1;
  const selectedCard = cursor[1] ?? -1;

  // Calculate which columns are visible
  const hasLeftIndicator = scrollOffset > 0;
  const hasRightIndicator = scrollOffset + maxVisibleCols < nodes.length;
  const indicatorWidth =
    (hasLeftIndicator ? 1 : 0) + (hasRightIndicator ? 1 : 0);
  const availableWidth = width - indicatorWidth;

  // Get visible columns
  const visibleNodes = nodes.slice(scrollOffset, scrollOffset + maxVisibleCols);
  const separatorCount = Math.max(0, visibleNodes.length - 1);
  const colWidth = Math.floor(
    (availableWidth - separatorCount) / Math.max(1, visibleNodes.length),
  );

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
      {visibleNodes.map((node: NodeViewModel, i: number) => {
        const actualColIndex = scrollOffset + i;
        const isLastCol = i === visibleNodes.length - 1;

        return (
          <box key={node.id} flexDirection="row">
            <ColumnTree
              node={node}
              colIndex={actualColIndex}
              isSelected={actualColIndex === selectedCol}
              selectedCardIndex={selectedCard}
              selectedNodes={selectedNodes}
              width={colWidth}
              height={height}
            />
            {/* Separator */}
            {!isLastCol && (
              <box width={1} flexDirection="column">
                <text> </text>
                {Array.from({ length: height - 1 }).map((_, j) => (
                  <text key={j} color="gray">
                    │
                  </text>
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

      {nodes.length === 0 && <text color="gray">No columns to display</text>}
    </box>
  );
}

export default ColumnsView;
