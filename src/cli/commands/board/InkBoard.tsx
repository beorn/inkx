/**
 * Ink-based Board TUI Component
 * Full-screen board view with columns and cards
 */
import React, { useState, useEffect } from "react";
import { render, Box, Text, useInput, useApp, useStdout } from "ink";
import type { BoardState, CardState, ColumnState } from "./types.ts";
import { getNodeDisplayName, buildBoardState } from "./state.ts";
import type { TaskStatus } from "../../../node/types.ts";

// Status icons
function getStatusIcon(status?: TaskStatus): string {
  switch (status) {
    case "done":
      return "\u2713"; // checkmark
    case "in_progress":
      return "\u25D0"; // half circle
    case "blocked":
      return "\u2298"; // circled slash
    case "waiting":
      return "\u25F7"; // clock
    default:
      return "\u25CB"; // empty circle
  }
}

interface CardProps {
  card: CardState;
  isSelected: boolean;
  width: number;
}

function Card({ card, isSelected, width }: CardProps) {
  const icon = getStatusIcon(card.node.task_status);
  const rawContent = card.node.content || getNodeDisplayName(card.node);
  const firstLine = rawContent.split("\n")[0] ?? rawContent;
  const content = firstLine.slice(0, width - 4);
  const hasChildren = card.children.length > 0;

  return (
    <Text
      backgroundColor={isSelected ? "blue" : undefined}
      color={isSelected ? "white" : undefined}
    >
      {icon} {content}{hasChildren ? ` (${card.children.length})` : ""}
    </Text>
  );
}

interface ColumnProps {
  column: ColumnState;
  isSelected: boolean;
  selectedCardIndex: number;
  width: number;
  height: number;
}

function Column({ column, isSelected, selectedCardIndex, width, height }: ColumnProps) {
  const name = getNodeDisplayName(column.node);
  const count = column.cards.length;
  const maxCards = Math.max(1, height - 4); // Leave room for header and footer

  // Scroll to keep selected card visible
  const scrollOffset = Math.max(0, Math.min(
    selectedCardIndex - Math.floor(maxCards / 2),
    Math.max(0, column.cards.length - maxCards)
  ));
  const visibleCards = column.cards.slice(scrollOffset, scrollOffset + maxCards);

  return (
    <Box flexDirection="column" width={width}>
      <Text bold inverse={isSelected}>
        {` ${name.slice(0, width - 8)} (${count}) `.slice(0, width)}
      </Text>
      <Box flexDirection="column" height={maxCards}>
        {visibleCards.map((card, i) => (
          <Card
            key={card.node.id}
            card={card}
            isSelected={isSelected && (scrollOffset + i) === selectedCardIndex}
            width={width}
          />
        ))}
        {column.cards.length === 0 && <Text dimColor>(empty)</Text>}
      </Box>
      {column.cards.length > maxCards && (
        <Text dimColor>
          {scrollOffset > 0 ? "↑" : " "}
          {scrollOffset + maxCards < column.cards.length ? "↓" : " "}
          {` ${scrollOffset + 1}-${Math.min(scrollOffset + maxCards, column.cards.length)}/${column.cards.length}`}
        </Text>
      )}
    </Box>
  );
}

interface BoardProps {
  initialState: BoardState;
}

function Board({ initialState }: BoardProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [state, setState] = useState(initialState);
  const [termWidth, setTermWidth] = useState(stdout?.columns || 80);
  const [termHeight, setTermHeight] = useState(stdout?.rows || 24);

  useEffect(() => {
    const handler = () => {
      setTermWidth(stdout?.columns || 80);
      setTermHeight(stdout?.rows || 24);
    };
    stdout?.on("resize", handler);
    return () => {
      stdout?.off("resize", handler);
    };
  }, [stdout]);

  const maxCols = Math.min(state.columns.length, Math.max(2, Math.floor(termWidth / 30)));
  const colWidth = Math.floor((termWidth - 2) / maxCols);

  // Horizontal scrolling for columns
  const colScrollOffset = Math.max(0, Math.min(
    state.colIndex - Math.floor(maxCols / 2),
    Math.max(0, state.columns.length - maxCols)
  ));
  const visibleColumns = state.columns.slice(colScrollOffset, colScrollOffset + maxCols);

  useInput((input, key) => {
    setState((s) => {
      const newState = { ...s };
      const col = s.columns[s.colIndex];
      const card = col?.cards[s.cardIndex];

      // Quit
      if (input === "q" || key.escape) {
        if (s.zoomStack.length > 0) {
          const parentId = s.zoomStack[s.zoomStack.length - 1];
          if (parentId) {
            const zoomed = buildBoardState(parentId);
            zoomed.zoomStack = s.zoomStack.slice(0, -1);
            return zoomed;
          }
        }
        exit();
        return s;
      }

      // Navigation
      if (input === "h" || key.leftArrow) {
        newState.colIndex = Math.max(0, s.colIndex - 1);
        newState.cardIndex = Math.min(
          s.cardIndex,
          Math.max(0, (s.columns[newState.colIndex]?.cards.length || 1) - 1)
        );
      } else if (input === "l" || key.rightArrow) {
        newState.colIndex = Math.min(s.columns.length - 1, s.colIndex + 1);
        newState.cardIndex = Math.min(
          s.cardIndex,
          Math.max(0, (s.columns[newState.colIndex]?.cards.length || 1) - 1)
        );
      } else if (input === "j" || key.downArrow) {
        newState.cardIndex = Math.min((col?.cards.length || 1) - 1, s.cardIndex + 1);
      } else if (input === "k" || key.upArrow) {
        newState.cardIndex = Math.max(0, s.cardIndex - 1);
      } else if (input === "g") {
        newState.cardIndex = 0;
      } else if (input === "G") {
        newState.cardIndex = Math.max(0, (col?.cards.length || 1) - 1);
      }

      // Zoom in
      if (key.return && card && card.children.length > 0) {
        const zoomed = buildBoardState(card.node.id);
        zoomed.zoomStack = [...s.zoomStack, s.rootId || ""];
        return zoomed;
      }

      return newState;
    });
  });

  // Title
  const title = state.rootId
    ? getNodeDisplayName(
        state.columns[0]?.node || { id: "", type: "folder", parent_id: null, sort_order: 0, symlink_to: null, content: "Board", data: {}, created_at: 0, updated_at: 0, version: "v1" }
      )
    : "Board";

  return (
    <Box flexDirection="column" height={termHeight}>
      <Text bold inverse>
        {` ${title} `}
        {state.zoomStack.length > 0 && <Text dimColor>{`[depth: ${state.zoomStack.length}]`}</Text>}
        {state.columns.length > maxCols && (
          <Text dimColor>{` [${colScrollOffset + 1}-${colScrollOffset + maxCols}/${state.columns.length} cols]`}</Text>
        )}
      </Text>
      <Box flexGrow={1}>
        {visibleColumns.map((col, i) => (
          <Column
            key={col.node.id}
            column={col}
            isSelected={(colScrollOffset + i) === state.colIndex}
            selectedCardIndex={state.cardIndex}
            width={colWidth}
            height={termHeight - 3}
          />
        ))}
      </Box>
      <Text dimColor>
        h/l:cols  j/k:cards  g/G:top/bottom  Enter:zoom  Esc:back  q:quit
      </Text>
    </Box>
  );
}

export function renderInkBoard(state: BoardState): void {
  render(<Board initialState={state} />, { exitOnCtrlC: true });
}
