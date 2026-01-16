/**
 * CardsView Presenter
 *
 * Kanban-style cards layout. Receives ViewModels, renders components.
 * No hooks, no store access - pure presentation logic.
 *
 * TUI1 style: columns separated by vertical lines (│)
 */

import { Fragment } from "react";
import { Card, Column } from "../components/index.ts";
import type { NodeViewModel, TreeViewModel } from "../types.ts";

interface CardsViewProps {
  viewModel: TreeViewModel;
  height?: number;
}

/**
 * Column separator - vertical line between columns
 * TUI1 uses: gray "│" characters for the full height
 */
function ColumnSeparator({ height }: { height?: number }) {
  // Default height if not provided
  const lines = height ? Math.max(1, height - 2) : 10;
  return (
    <box flexDirection="column" width={1}>
      {/* Blank line to align with column header spacing */}
      <text> </text>
      {Array.from({ length: lines }).map((_, i) => (
        <text key={i} color="gray">
          │
        </text>
      ))}
    </box>
  );
}

export function CardsView({ viewModel, height }: CardsViewProps) {
  const { nodes, cursor, selectedNodes } = viewModel;
  const selectedCol = cursor[0] ?? -1;
  const selectedCard = cursor[1] ?? -1;

  return (
    <box flexDirection="row" flexGrow={1}>
      {nodes.map((node: NodeViewModel, colIndex: number) => {
        const isActive = colIndex === selectedCol;
        const currentSelectedCard = isActive ? selectedCard : -1;
        const isLastCol = colIndex === nodes.length - 1;

        return (
          <Fragment key={node.id}>
            <Column
              title={node.title}
              count={node.childCount}
              isActive={isActive}
              isCollapsed={node.isFolded}
              selectedIndex={currentSelectedCard}
            >
              {node.children.map((child: NodeViewModel, cardIndex: number) => (
                <Card
                  key={child.id}
                  title={child.title}
                  isSelected={isActive && cardIndex === currentSelectedCard}
                  isMultiSelected={selectedNodes.has(child.id)}
                  childCount={child.childCount}
                  color={child.color}
                  icon={child.icon}
                  isFolded={child.isFolded}
                  taskStatus={child.taskStatus}
                  priority={child.priority}
                  dueDate={child.dueDate}
                  hasBacklinks={child.hasBacklinks}
                  refsCount={child.refsCount}
                />
              ))}
            </Column>
            {/* Separator line between columns (not after last column) */}
            {!isLastCol && <ColumnSeparator height={height} />}
          </Fragment>
        );
      })}
    </box>
  );
}

export default CardsView;
