/**
 * CardsView Presenter
 *
 * Kanban-style cards layout. Receives ViewModels, renders components.
 * No hooks, no store access - pure presentation logic.
 */

import { Card, Column } from "../components/index.ts";
import type { NodeViewModel, TreeViewModel } from "../types.ts";

interface CardsViewProps {
  viewModel: TreeViewModel;
}

export function CardsView({ viewModel }: CardsViewProps) {
  const { nodes, cursor, selectedNodes } = viewModel;
  const selectedCol = cursor[0] ?? -1;
  const selectedCard = cursor[1] ?? -1;

  return (
    <box flexDirection="row" flexGrow={1}>
      {nodes.map((node: NodeViewModel, colIndex: number) => {
        const isActive = colIndex === selectedCol;
        const currentSelectedCard = isActive ? selectedCard : -1;

        return (
          <Column
            key={node.id}
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
        );
      })}
    </box>
  );
}

export default CardsView;
