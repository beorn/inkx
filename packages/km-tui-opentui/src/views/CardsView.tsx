/**
 * CardsView Presenter
 *
 * Kanban-style cards layout. Receives ViewModels, renders components.
 * No hooks, no store access - pure presentation logic.
 */

import { Card, Column } from "../components/index.ts";
import type { ColumnViewModel } from "../types.ts";

interface CardsViewProps {
  columns: ColumnViewModel[];
  selectedCol: number;
  selectedCard: number;
}

export function CardsView({
  columns,
  selectedCol,
  selectedCard,
}: CardsViewProps) {
  return (
    <box flexDirection="row" flexGrow={1}>
      {columns.map((col, colIndex) => {
        const isActive = colIndex === selectedCol;
        const currentSelectedCard = isActive ? selectedCard : -1;

        return (
          <Column
            key={col.id}
            title={col.title}
            count={col.count}
            wipLimit={col.wipLimit}
            isActive={isActive}
            isCollapsed={col.isCollapsed}
            selectedIndex={currentSelectedCard}
          >
            {col.cards.map((card, cardIndex) => (
              <Card
                key={card.id}
                title={card.title}
                isSelected={isActive && cardIndex === currentSelectedCard}
                childCount={card.childCount}
                color={card.color}
                icon={card.icon}
                isFolded={card.isFolded}
                taskStatus={card.taskStatus}
              />
            ))}
          </Column>
        );
      })}
    </box>
  );
}

export default CardsView;
