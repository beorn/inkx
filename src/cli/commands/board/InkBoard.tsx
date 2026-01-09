/**
 * Ink-based Board TUI Component
 * Full-screen board view with columns and cards
 */
import React, { useState, useEffect } from "react";
import { render, Box, Text, useInput, useApp, useStdout } from "ink";
import type { BoardState, CardState, ColumnState } from "./types.ts";
import { getNodeDisplayName, buildBoardState } from "./state.ts";
import type { Node, TaskStatus } from "../../../node/types.ts";
import { getChildren } from "../../../node/db.ts";

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

interface OutlineItemProps {
  node: Node;
  depth: number;
  maxDepth: number;
  width: number;
  foldedNodes: Set<string>;
  onToggleFold: (id: string) => void;
  isSelected: boolean;
}

function OutlineItem({ node, depth, maxDepth, width, foldedNodes, onToggleFold, isSelected }: OutlineItemProps) {
  const indent = "  ".repeat(depth);
  const icon = getStatusIcon(node.task_status);
  const rawContent = node.content || getNodeDisplayName(node);
  const firstLine = rawContent.split("\n")[0] ?? rawContent;
  const availWidth = width - (depth * 2) - 4;
  const content = firstLine.slice(0, availWidth);

  const children = getChildren(node.id);
  const hasChildren = children.length > 0;
  const isFolded = foldedNodes.has(node.id);

  const foldIndicator = hasChildren ? (isFolded ? "\u25B6" : "\u25BC") : " ";

  return (
    <Box flexDirection="column">
      <Text
        backgroundColor={isSelected ? "blue" : undefined}
        color={isSelected ? "white" : undefined}
        dimColor={depth > 0}
      >
        {indent}{foldIndicator} {icon} {content}{hasChildren && isFolded ? ` (${children.length})` : ""}
      </Text>
      {hasChildren && !isFolded && depth < maxDepth && (
        <Box flexDirection="column">
          {children.slice(0, 10).map((child) => (
            <OutlineItem
              key={child.id}
              node={child}
              depth={depth + 1}
              maxDepth={maxDepth}
              width={width}
              foldedNodes={foldedNodes}
              onToggleFold={onToggleFold}
              isSelected={false}
            />
          ))}
          {children.length > 10 && (
            <Text dimColor>{indent}  +{children.length - 10} more</Text>
          )}
        </Box>
      )}
    </Box>
  );
}

interface CardProps {
  card: CardState;
  isSelected: boolean;
  width: number;
  maxOutlineDepth: number;
  foldedNodes: Set<string>;
  onToggleFold: (id: string) => void;
}

function Card({ card, isSelected, width, maxOutlineDepth, foldedNodes, onToggleFold }: CardProps) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <OutlineItem
        node={card.node}
        depth={0}
        maxDepth={maxOutlineDepth}
        width={width}
        foldedNodes={foldedNodes}
        onToggleFold={onToggleFold}
        isSelected={isSelected}
      />
    </Box>
  );
}

interface ColumnProps {
  column: ColumnState;
  isSelected: boolean;
  selectedCardIndex: number;
  width: number;
  height: number;
  maxOutlineDepth: number;
  foldedNodes: Set<string>;
  onToggleFold: (id: string) => void;
}

function Column({ column, isSelected, selectedCardIndex, width, height, maxOutlineDepth, foldedNodes, onToggleFold }: ColumnProps) {
  const name = getNodeDisplayName(column.node);
  const count = column.cards.length;
  const maxCards = Math.max(1, Math.floor(height / 3)); // Estimate cards visible

  // Scroll to keep selected card visible
  const scrollOffset = Math.max(0, Math.min(
    selectedCardIndex - Math.floor(maxCards / 2),
    Math.max(0, column.cards.length - maxCards)
  ));
  const visibleCards = column.cards.slice(scrollOffset, scrollOffset + maxCards);

  return (
    <Box flexDirection="column" width={width} borderStyle="single" borderColor={isSelected ? "blue" : "gray"}>
      <Text bold inverse={isSelected}>
        {` ${name.slice(0, width - 8)} (${count}) `.slice(0, width - 2)}
      </Text>
      <Box flexDirection="column" paddingX={1}>
        {visibleCards.map((card, i) => (
          <Card
            key={card.node.id}
            card={card}
            isSelected={isSelected && (scrollOffset + i) === selectedCardIndex}
            width={width - 4}
            maxOutlineDepth={maxOutlineDepth}
            foldedNodes={foldedNodes}
            onToggleFold={onToggleFold}
          />
        ))}
        {column.cards.length === 0 && <Text dimColor>(empty)</Text>}
      </Box>
      {column.cards.length > maxCards && (
        <Text dimColor>
          {scrollOffset > 0 ? "\u2191" : " "}
          {scrollOffset + maxCards < column.cards.length ? "\u2193" : " "}
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
  const [foldedNodes, setFoldedNodes] = useState<Set<string>>(new Set());
  const [maxOutlineDepth, setMaxOutlineDepth] = useState(2); // Default 2 levels

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

  const maxCols = Math.min(state.columns.length, Math.max(2, Math.floor(termWidth / 35)));
  const colWidth = Math.floor((termWidth - 2) / maxCols);

  // Horizontal scrolling for columns
  const colScrollOffset = Math.max(0, Math.min(
    state.colIndex - Math.floor(maxCols / 2),
    Math.max(0, state.columns.length - maxCols)
  ));
  const visibleColumns = state.columns.slice(colScrollOffset, colScrollOffset + maxCols);

  const toggleFold = (nodeId: string) => {
    setFoldedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  useInput((input, key) => {
    const col = state.columns[state.colIndex];
    const card = col?.cards[state.cardIndex];

    // Quit
    if (input === "q") {
      exit();
      return;
    }

    if (key.escape) {
      if (state.zoomStack.length > 0) {
        const parentId = state.zoomStack[state.zoomStack.length - 1];
        if (parentId) {
          const zoomed = buildBoardState(parentId);
          zoomed.zoomStack = state.zoomStack.slice(0, -1);
          setState(zoomed);
          return;
        }
      }
      exit();
      return;
    }

    // Toggle fold on current card
    if (key.tab && card) {
      toggleFold(card.node.id);
      return;
    }

    // Adjust outline depth with +/-
    if (input === "+" || input === "=") {
      setMaxOutlineDepth((d) => Math.min(5, d + 1));
      return;
    }
    if (input === "-" || input === "_") {
      setMaxOutlineDepth((d) => Math.max(0, d - 1));
      return;
    }

    // Fold all / unfold all
    if (input === "z") {
      // Fold all cards in current column
      if (col) {
        setFoldedNodes((prev) => {
          const next = new Set(prev);
          for (const c of col.cards) {
            next.add(c.node.id);
          }
          return next;
        });
      }
      return;
    }
    if (input === "Z") {
      // Unfold all cards in current column
      if (col) {
        setFoldedNodes((prev) => {
          const next = new Set(prev);
          for (const c of col.cards) {
            next.delete(c.node.id);
          }
          return next;
        });
      }
      return;
    }

    setState((s) => {
      const newState = { ...s };
      const currentCol = s.columns[s.colIndex];

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
        newState.cardIndex = Math.min((currentCol?.cards.length || 1) - 1, s.cardIndex + 1);
      } else if (input === "k" || key.upArrow) {
        newState.cardIndex = Math.max(0, s.cardIndex - 1);
      } else if (input === "g") {
        newState.cardIndex = 0;
      } else if (input === "G") {
        newState.cardIndex = Math.max(0, (currentCol?.cards.length || 1) - 1);
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
      <Box>
        <Text bold inverse>{` ${title} `}</Text>
        {state.zoomStack.length > 0 && <Text dimColor>{` [depth: ${state.zoomStack.length}]`}</Text>}
        {state.columns.length > maxCols && (
          <Text dimColor>{` [${colScrollOffset + 1}-${colScrollOffset + maxCols}/${state.columns.length} cols]`}</Text>
        )}
        <Text dimColor>{` [outline: ${maxOutlineDepth}]`}</Text>
      </Box>
      <Box flexGrow={1}>
        {visibleColumns.map((col, i) => (
          <Column
            key={col.node.id}
            column={col}
            isSelected={(colScrollOffset + i) === state.colIndex}
            selectedCardIndex={state.cardIndex}
            width={colWidth}
            height={termHeight - 4}
            maxOutlineDepth={maxOutlineDepth}
            foldedNodes={foldedNodes}
            onToggleFold={toggleFold}
          />
        ))}
      </Box>
      <Text dimColor>
        h/l:cols  j/k:cards  Tab:fold  +/-:depth({maxOutlineDepth})  z/Z:fold/unfold all  Enter:zoom  q:quit
      </Text>
    </Box>
  );
}

export function renderInkBoard(state: BoardState): void {
  render(<Board initialState={state} />, { exitOnCtrlC: true });
}
