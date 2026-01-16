/**
 * TabsView for OpenTUI
 *
 * Tab-based interface showing one column at a time.
 * Tab bar at top for switching between columns.
 */

import type { ReactElement } from "react";
import { TreeNode } from "../components/index.ts";
import type { NodeViewModel, TreeViewModel } from "../types.ts";

interface TabsViewProps {
  viewModel: TreeViewModel;
  width?: number;
  height?: number;
}

export function TabsView({
  viewModel,
  width = 80,
  height = 24,
}: TabsViewProps): ReactElement {
  const { nodes, cursor, selectedNodes } = viewModel;
  const selectedCol = cursor[0] ?? -1;
  const selectedCard = cursor[1] ?? -1;

  // Current column
  const currentNode = nodes[selectedCol];
  const count = currentNode?.children.length ?? 0;

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

  const visibleChildren = currentNode
    ? currentNode.children.slice(scrollOffset, scrollOffset + contentHeight)
    : [];

  // Calculate max tab width
  const maxTabWidth = Math.floor((width - 4) / Math.max(nodes.length, 1)) - 3;

  return (
    <box flexDirection="column" width={width} height={height} flexGrow={1}>
      {/* Spacer */}
      <box height={1} />

      {/* Tab bar */}
      <box flexDirection="row" width={width} height={1}>
        {nodes.map((node: NodeViewModel, colIndex: number) => {
          const isActive = colIndex === selectedCol;
          // Truncate tab name if needed
          const truncatedName =
            node.title.length > maxTabWidth
              ? node.title.slice(0, maxTabWidth - 1) + "…"
              : node.title;

          return (
            <box key={node.id} marginRight={1}>
              <text
                bold={isActive}
                color={isActive ? "black" : "white"}
                backgroundColor={isActive ? "cyan" : undefined}
              >
                {truncatedName} ({node.childCount})
              </text>
              {colIndex < nodes.length - 1 && <text color="gray"> │</text>}
            </box>
          );
        })}
      </box>

      {/* Top border */}
      <text color="gray">{"─".repeat(width)}</text>

      {/* Content area */}
      <box flexDirection="column" flexGrow={1}>
        {currentNode ? (
          count > 0 ? (
            <box flexDirection="column" flexGrow={1}>
              {scrollOffset > 0 && (
                <text color="gray"> ▲ {scrollOffset} above</text>
              )}
              {visibleChildren.map((child: NodeViewModel, i: number) => {
                const actualCardIndex = scrollOffset + i;
                const isCardSelected = actualCardIndex === selectedCard;

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
                    width={width - 4}
                    isSelected={isCardSelected}
                    isMultiSelected={selectedNodes.has(child.id)}
                    variant="wide"
                  />
                );
              })}
              {needsScroll && scrollOffset + visibleChildren.length < count && (
                <text color="gray">
                  {" "}
                  ▼ {count - scrollOffset - visibleChildren.length} below
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
