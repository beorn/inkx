/**
 * ListView for OpenTUI
 *
 * Full-width hierarchical tree view of the board.
 * Shows all columns as sections with their cards as nested items.
 */

import type { ReactElement } from "react";
import { TreeNode } from "../components/index.ts";
import type { NodeViewModel, TreeViewModel } from "../types.ts";

interface ListViewProps {
  viewModel: TreeViewModel;
  width?: number;
}

export function ListView({
  viewModel,
  width = 80,
}: ListViewProps): ReactElement {
  const { nodes, cursor, selectedNodes } = viewModel;
  const selectedCol = cursor[0] ?? -1;
  const selectedCard = cursor[1] ?? -1;

  return (
    <box flexDirection="column" flexGrow={1}>
      {/* Spacer line */}
      <text> </text>

      {/* Columns as sections */}
      {nodes.map((node: NodeViewModel, colIndex: number) => {
        const isColSelected = colIndex === selectedCol;
        // Design system: selected headers cyan bg+black fg, unselected yellowBright+dim
        const headerBg = isColSelected ? "cyan" : undefined;
        const headerColor = isColSelected ? "black" : "yellowBright";

        return (
          <box key={node.id} flexDirection="column">
            {/* Blank line between sections (except first) */}
            {colIndex > 0 && <text> </text>}

            {/* Column header */}
            <text
              bold={isColSelected}
              dim={!isColSelected}
              color={headerColor}
              backgroundColor={headerBg}
            >
              {node.title} ({node.childCount})
            </text>

            {/* Cards in column */}
            {node.children.map((child: NodeViewModel, cardIndex: number) => {
              const isCardSelected =
                isColSelected && cardIndex === selectedCard;

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
                  width={width - 2}
                  isSelected={isCardSelected}
                  isMultiSelected={selectedNodes.has(child.id)}
                  variant="wide"
                />
              );
            })}
          </box>
        );
      })}

      {nodes.length === 0 && <text color="gray">No columns to display</text>}
    </box>
  );
}

export default ListView;
