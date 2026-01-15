/**
 * ListView for OpenTUI
 *
 * Full-width hierarchical tree view of the board.
 * Shows all columns as sections with their cards as nested items.
 */

import type { ReactElement } from "react";
import { TreeNode } from "../components/index.ts";
import type { ColumnViewModel } from "../types.ts";

interface ListViewProps {
  columns: ColumnViewModel[];
  selectedCol: number;
  selectedCard: number;
  selectedCards: Set<string>;
  width?: number;
}

export function ListView({
  columns,
  selectedCol,
  selectedCard,
  selectedCards,
  width = 80,
}: ListViewProps): ReactElement {
  return (
    <box flexDirection="column" flexGrow={1}>
      {/* Spacer line */}
      <text> </text>

      {/* Columns as sections */}
      {columns.map((column, colIndex) => {
        const isColSelected = colIndex === selectedCol;
        const headerBg = isColSelected ? "cyan" : undefined;
        const headerColor = isColSelected ? "black" : "yellow";

        return (
          <box key={column.id} flexDirection="column">
            {/* Blank line between sections (except first) */}
            {colIndex > 0 && <text> </text>}

            {/* Column header */}
            <text
              bold={isColSelected}
              color={headerColor}
              backgroundColor={headerBg}
            >
              {column.title} ({column.count})
            </text>

            {/* Cards in column */}
            {column.cards.map((card, cardIndex) => {
              const isCardSelected = isColSelected && cardIndex === selectedCard;

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
                  width={width - 2}
                  isSelected={isCardSelected}
                  isMultiSelected={selectedCards.has(card.id)}
                  variant="wide"
                />
              );
            })}
          </box>
        );
      })}

      {columns.length === 0 && <text color="gray">No columns to display</text>}
    </box>
  );
}

export default ListView;
