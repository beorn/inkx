/**
 * Ink-based Board TUI Component
 * Full-screen board view with columns and cards
 */
import React, { useState, useEffect } from "react";
import { render, Box, Text, useInput, useApp, useStdout } from "ink";
import type { BoardState, CardState, ColumnState } from "./types.ts";
import { buildBoardState } from "./state.ts";
import type { Node, TaskStatus } from "../../../node/types.ts";
import { getChildren, getNode } from "../../../node/db.ts";
import {
  getNodeDisplayName,
  getCollapsedTypeSuffix,
} from "../../../shared/tree.ts";

// Build path from root to a given node as file path with # for sections
function getNodePath(nodeId: string | null): string {
  if (!nodeId) return "/";

  // Collect all nodes from root to target
  const nodes: Node[] = [];
  let currentId: string | null = nodeId;
  while (currentId) {
    const node = getNode(currentId);
    if (!node) break;
    nodes.unshift(node);
    currentId = node.parent_id;
  }

  if (nodes.length === 0) return "/";

  // Build path: folders/files use /, sections use #
  let path = "";
  for (const node of nodes) {
    const name = getNodeDisplayName(node);
    if (node.type === "folder" || node.type === "file") {
      path += (path ? "/" : "") + name;
    } else if (node.type === "section") {
      path += "#" + name;
    } else if (node.type === "board") {
      // Skip board nodes in path, or show as root
      if (!path) path = name;
    } else {
      // Other types (paragraph, task, etc.) - add with /
      path += (path ? "/" : "") + name;
    }
  }

  return path || "/";
}

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
  isCardSelected: boolean; // The card containing this item is selected
  isItemSelected: boolean; // This specific item is the selected sub-item
  isMultiSelected: boolean; // This item is part of multi-selection
  flatIndex: number; // Index in flattened list for selection tracking
  selectedSubIndex: number; // Currently selected sub-item index
  multiSelected: Set<SelectionKey>; // All multi-selected items
  colIndex: number;
  cardIndex: number;
}

function OutlineItem({
  node,
  depth,
  maxDepth,
  width,
  foldedNodes,
  onToggleFold,
  isCardSelected,
  isItemSelected,
  isMultiSelected,
  flatIndex,
  selectedSubIndex,
  multiSelected,
  colIndex,
  cardIndex,
}: OutlineItemProps) {
  const indent = "  ".repeat(depth);
  // Only show status icon for tasks, not for sections or other types
  const isTask = node.type === "task";
  const icon = isTask ? getStatusIcon(node.task_status) : "";
  const rawContent = node.content || getNodeDisplayName(node);
  const firstLine = rawContent.split("\n")[0] ?? rawContent;
  // Get collapsed type suffix (e.g., "/ .md #" for unified folder/file/section)
  const typeSuffix = getCollapsedTypeSuffix(node);
  // Calculate available width accounting for indent, icon, fold indicator, and suffix
  const prefixWidth = depth * 2 + 3 + (icon ? 2 : 0); // indent + fold + space + icon
  const suffixWidth = typeSuffix ? typeSuffix.length + 1 : 0;
  const availWidth = Math.max(5, width - prefixWidth - suffixWidth - 2);
  const content = firstLine.slice(0, availWidth);

  const children = getChildren(node.id);
  const hasChildren = children.length > 0;
  const isFolded = foldedNodes.has(node.id);

  const foldIndicator = hasChildren ? (isFolded ? "\u25B6" : "\u25BC") : " ";

  // Determine background color based on selection state
  let backgroundColor: string | undefined;
  let textColor: string | undefined;
  if (isItemSelected) {
    // This specific item is the cursor (blue highlight)
    backgroundColor = "blue";
    textColor = "white";
  } else if (isMultiSelected) {
    // This item is part of multi-selection (yellow/inverse highlight)
    backgroundColor = "yellow";
    textColor = "black";
  }

  // Track index for children
  let nextIndex = flatIndex + 1;

  return (
    <Box flexDirection="column">
      <Text
        backgroundColor={backgroundColor}
        color={textColor}
        dimColor={!isCardSelected && depth > 0}
        wrap="truncate"
      >
        {indent}
        {foldIndicator} {icon}
        {icon ? " " : ""}
        {content}
        {typeSuffix ? <Text color="gray">{` ${typeSuffix}`}</Text> : ""}
        {hasChildren && isFolded ? ` (${children.length})` : ""}
      </Text>
      {hasChildren && !isFolded && depth < maxDepth && (
        <Box flexDirection="column">
          {children.slice(0, 10).map((child) => {
            const childIndex = nextIndex;
            const childKey = makeSelectionKey(colIndex, cardIndex, childIndex);
            // Calculate next index by counting visible descendants
            nextIndex =
              childIndex +
              1 +
              countVisibleDescendants(child, depth + 1, maxDepth, foldedNodes);
            return (
              <OutlineItem
                key={child.id}
                node={child}
                depth={depth + 1}
                maxDepth={maxDepth}
                width={width}
                foldedNodes={foldedNodes}
                onToggleFold={onToggleFold}
                isCardSelected={isCardSelected}
                isItemSelected={
                  isCardSelected && childIndex === selectedSubIndex
                }
                isMultiSelected={multiSelected.has(childKey)}
                flatIndex={childIndex}
                selectedSubIndex={selectedSubIndex}
                multiSelected={multiSelected}
                colIndex={colIndex}
                cardIndex={cardIndex}
              />
            );
          })}
          {children.length > 10 && (
            <Text dimColor>
              {indent} +{children.length - 10} more
            </Text>
          )}
        </Box>
      )}
    </Box>
  );
}

// Helper to count visible descendants for flat indexing
function countVisibleDescendants(
  node: Node,
  depth: number,
  maxDepth: number,
  foldedNodes: Set<string>,
): number {
  if (depth > maxDepth || foldedNodes.has(node.id)) {
    return 0;
  }
  const children = getChildren(node.id).slice(0, 10);
  let count = children.length;
  for (const child of children) {
    count += countVisibleDescendants(child, depth + 1, maxDepth, foldedNodes);
  }
  return count;
}

// Selection key: "col:card:sub" format for tracking multi-selection
type SelectionKey = string;
function makeSelectionKey(
  colIndex: number,
  cardIndex: number,
  subIndex: number,
): SelectionKey {
  return `${colIndex}:${cardIndex}:${subIndex}`;
}

interface CardProps {
  card: CardState;
  isSelected: boolean;
  selectedSubIndex: number; // Which sub-item within this card is selected (-1 = card header)
  width: number;
  maxOutlineDepth: number;
  foldedNodes: Set<string>;
  onToggleFold: (id: string) => void;
  multiSelected: Set<SelectionKey>; // Set of selected sub-item keys within this card
  colIndex: number;
  cardIndex: number;
}

function Card({
  card,
  isSelected,
  selectedSubIndex,
  width,
  maxOutlineDepth,
  foldedNodes,
  onToggleFold,
  multiSelected,
  colIndex,
  cardIndex,
}: CardProps) {
  // Card width includes border (2 chars), so inner content width is width - 4
  const innerWidth = Math.max(5, width - 4);
  return (
    <Box
      flexDirection="column"
      width={width}
      borderStyle="round"
      borderColor={isSelected ? "cyan" : "gray"}
      borderDimColor={!isSelected}
      overflowX="hidden"
    >
      <OutlineItem
        node={card.node}
        depth={0}
        maxDepth={maxOutlineDepth}
        width={innerWidth}
        foldedNodes={foldedNodes}
        onToggleFold={onToggleFold}
        isCardSelected={isSelected}
        isItemSelected={isSelected && selectedSubIndex === 0}
        isMultiSelected={multiSelected.has(
          makeSelectionKey(colIndex, cardIndex, 0),
        )}
        flatIndex={0}
        selectedSubIndex={selectedSubIndex}
        multiSelected={multiSelected}
        colIndex={colIndex}
        cardIndex={cardIndex}
      />
    </Box>
  );
}

interface ColumnProps {
  column: ColumnState;
  colIndex: number;
  isSelected: boolean;
  selectedCardIndex: number;
  selectedSubIndex: number; // Which sub-item within the selected card (0 = card header)
  width: number;
  height: number;
  maxOutlineDepth: number;
  foldedNodes: Set<string>;
  onToggleFold: (id: string) => void;
  multiSelected: Set<SelectionKey>;
}

function Column({
  column,
  colIndex,
  isSelected,
  selectedCardIndex,
  selectedSubIndex,
  width,
  height,
  maxOutlineDepth,
  foldedNodes,
  onToggleFold,
  multiSelected,
}: ColumnProps) {
  const name = getNodeDisplayName(column.node);
  const typeSuffix = getCollapsedTypeSuffix(column.node);
  const count = column.cards.length;
  // Available height for cards: column height - border (2) - header (1) - scroll indicator (1)
  const contentHeight = Math.max(1, height - 4);
  // Estimate how many cards can be visible (each card ~3 lines minimum with border)
  const maxCards = Math.max(1, Math.floor(contentHeight / 3));

  // Scroll to keep selected card visible
  const scrollOffset = Math.max(
    0,
    Math.min(
      selectedCardIndex - Math.floor(maxCards / 2),
      Math.max(0, column.cards.length - maxCards),
    ),
  );
  const visibleCards = column.cards.slice(
    scrollOffset,
    scrollOffset + maxCards,
  );

  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      borderStyle="single"
      borderColor={isSelected ? "blue" : "gray"}
      overflowY="hidden"
    >
      <Text bold inverse={isSelected} wrap="truncate">
        {` ${name.slice(0, width - 8 - (typeSuffix ? typeSuffix.length + 1 : 0))}`}
        {typeSuffix ? <Text color="gray">{` ${typeSuffix}`}</Text> : ""}
        {` (${count}) `}
      </Text>
      <Box flexDirection="column" height={contentHeight} overflowY="hidden">
        {visibleCards.map((card, i) => {
          const actualCardIndex = scrollOffset + i;
          const cardIsSelected =
            isSelected && actualCardIndex === selectedCardIndex;
          return (
            <Card
              key={card.node.id}
              card={card}
              isSelected={cardIsSelected}
              selectedSubIndex={cardIsSelected ? selectedSubIndex : -1}
              width={width - 2}
              maxOutlineDepth={maxOutlineDepth}
              foldedNodes={foldedNodes}
              onToggleFold={onToggleFold}
              multiSelected={multiSelected}
              colIndex={colIndex}
              cardIndex={actualCardIndex}
            />
          );
        })}
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
  const [dimensions, setDimensions] = useState({
    columns: stdout?.columns ?? 80,
    rows: stdout?.rows ?? 24,
  });
  const [state, setState] = useState(initialState);
  const [foldedNodes, setFoldedNodes] = useState<Set<string>>(new Set());
  const [maxOutlineDepth, setMaxOutlineDepth] = useState(2); // Default 2 levels
  const [subIndex, setSubIndex] = useState(0); // Sub-item index within selected card (0 = card header)
  const [inOutlineMode, setInOutlineMode] = useState(false); // Whether navigating within card outline
  const [multiSelected, setMultiSelected] = useState<Set<SelectionKey>>(
    new Set(),
  ); // Multi-selected items
  const [selectionAnchor, setSelectionAnchor] = useState<{
    col: number;
    card: number;
    sub: number;
  } | null>(null);

  // Listen for terminal resize
  useEffect(() => {
    if (!stdout) return;
    const handleResize = () => {
      setDimensions({ columns: stdout.columns, rows: stdout.rows });
    };
    stdout.on("resize", handleResize);
    return () => {
      stdout.off("resize", handleResize);
    };
  }, [stdout]);

  const termWidth = dimensions.columns;
  const termHeight = dimensions.rows;

  const maxCols = Math.min(
    state.columns.length,
    Math.max(2, Math.floor(termWidth / 35)),
  );
  const colWidth = Math.floor((termWidth - 2) / maxCols);

  // Horizontal scrolling for columns
  const colScrollOffset = Math.max(
    0,
    Math.min(
      state.colIndex - Math.floor(maxCols / 2),
      Math.max(0, state.columns.length - maxCols),
    ),
  );
  const visibleColumns = state.columns.slice(
    colScrollOffset,
    colScrollOffset + maxCols,
  );

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

  // Calculate max sub-items in current card
  const getMaxSubIndex = () => {
    const col = state.columns[state.colIndex];
    const card = col?.cards[state.cardIndex];
    if (!card) return 0;
    return (
      1 + countVisibleDescendants(card.node, 0, maxOutlineDepth, foldedNodes)
    );
  };

  // Update multi-selection range from anchor to current position
  const updateSelectionRange = (
    toCol: number,
    toCard: number,
    toSub: number,
  ) => {
    if (!selectionAnchor) return;
    const newSelected = new Set<SelectionKey>();

    // For simplicity, only support selection within same column and card for now
    if (selectionAnchor.col === toCol && selectionAnchor.card === toCard) {
      const minSub = Math.min(selectionAnchor.sub, toSub);
      const maxSub = Math.max(selectionAnchor.sub, toSub);
      for (let s = minSub; s <= maxSub; s++) {
        newSelected.add(makeSelectionKey(toCol, toCard, s));
      }
    } else if (selectionAnchor.col === toCol) {
      // Selection across cards in same column
      const minCard = Math.min(selectionAnchor.card, toCard);
      const maxCard = Math.max(selectionAnchor.card, toCard);
      for (let c = minCard; c <= maxCard; c++) {
        // Select all visible items in each card
        const card = state.columns[toCol]?.cards[c];
        if (card) {
          const maxItems =
            1 +
            countVisibleDescendants(card.node, 0, maxOutlineDepth, foldedNodes);
          for (let s = 0; s < maxItems; s++) {
            newSelected.add(makeSelectionKey(toCol, c, s));
          }
        }
      }
    }
    setMultiSelected(newSelected);
  };

  // Clear selection
  const clearSelection = () => {
    setMultiSelected(new Set());
    setSelectionAnchor(null);
  };

  useInput((input, key) => {
    const col = state.columns[state.colIndex];
    const card = col?.cards[state.cardIndex];

    // Quit
    if (input === "q") {
      exit();
      return;
    }

    // Go to parent: Escape or 'u'
    if (key.escape || input === "u") {
      // If in outline mode, exit outline mode
      if (inOutlineMode) {
        setInOutlineMode(false);
        setSubIndex(0);
        clearSelection();
        return;
      }
      // If zoomed in, go back to parent board
      if (state.zoomStack.length > 0) {
        const parentId = state.zoomStack[state.zoomStack.length - 1];
        if (parentId) {
          const zoomed = buildBoardState(parentId);
          zoomed.zoomStack = state.zoomStack.slice(0, -1);
          setState(zoomed);
          clearSelection();
          return;
        }
      }
      // At root, quit
      exit();
      return;
    }

    // Tab: enter outline mode (or toggle fold if already in outline mode)
    if (key.tab && card) {
      if (!inOutlineMode) {
        setInOutlineMode(true);
        setSubIndex(0);
      } else {
        toggleFold(card.node.id);
      }
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

    // Shift+J/K for multi-selection (vim style: capital letters)
    if (input === "J" && inOutlineMode) {
      // Start or extend selection downward
      if (!selectionAnchor) {
        setSelectionAnchor({
          col: state.colIndex,
          card: state.cardIndex,
          sub: subIndex,
        });
      }
      const maxSub = getMaxSubIndex();
      if (subIndex < maxSub - 1) {
        const newSubIndex = subIndex + 1;
        setSubIndex(newSubIndex);
        updateSelectionRange(state.colIndex, state.cardIndex, newSubIndex);
      }
      return;
    }
    if (input === "K" && inOutlineMode) {
      // Start or extend selection upward
      if (!selectionAnchor) {
        setSelectionAnchor({
          col: state.colIndex,
          card: state.cardIndex,
          sub: subIndex,
        });
      }
      if (subIndex > 0) {
        const newSubIndex = subIndex - 1;
        setSubIndex(newSubIndex);
        updateSelectionRange(state.colIndex, state.cardIndex, newSubIndex);
      }
      return;
    }

    // Vertical navigation
    if (input === "j" || key.downArrow) {
      clearSelection();
      if (inOutlineMode) {
        // In outline mode: navigate within card, then to next card
        const maxSub = getMaxSubIndex();
        if (subIndex < maxSub - 1) {
          setSubIndex(subIndex + 1);
        } else {
          // Move to next card's first item
          const currentCol = state.columns[state.colIndex];
          const nextCardIndex = Math.min(
            (currentCol?.cards.length || 1) - 1,
            state.cardIndex + 1,
          );
          if (nextCardIndex !== state.cardIndex) {
            setState((s) => ({ ...s, cardIndex: nextCardIndex }));
            setSubIndex(0);
          }
        }
      } else {
        // Not in outline mode: just move cards
        const currentCol = state.columns[state.colIndex];
        const nextCardIndex = Math.min(
          (currentCol?.cards.length || 1) - 1,
          state.cardIndex + 1,
        );
        setState((s) => ({ ...s, cardIndex: nextCardIndex }));
      }
      return;
    }

    if (input === "k" || key.upArrow) {
      clearSelection();
      if (inOutlineMode) {
        // In outline mode: navigate within card, then to previous card
        if (subIndex > 0) {
          setSubIndex(subIndex - 1);
        } else {
          // Move to previous card's last item
          const prevCardIndex = Math.max(0, state.cardIndex - 1);
          if (prevCardIndex !== state.cardIndex) {
            setState((s) => ({ ...s, cardIndex: prevCardIndex }));
            const prevCard =
              state.columns[state.colIndex]?.cards[prevCardIndex];
            if (prevCard) {
              const maxSub =
                1 +
                countVisibleDescendants(
                  prevCard.node,
                  0,
                  maxOutlineDepth,
                  foldedNodes,
                );
              setSubIndex(maxSub - 1);
            }
          }
        }
      } else {
        // Not in outline mode: just move cards
        const prevCardIndex = Math.max(0, state.cardIndex - 1);
        setState((s) => ({ ...s, cardIndex: prevCardIndex }));
      }
      return;
    }

    setState((s) => {
      const newState = { ...s };

      // Horizontal navigation - exit outline mode and clear selection when changing columns
      if (input === "h" || key.leftArrow) {
        newState.colIndex = Math.max(0, s.colIndex - 1);
        newState.cardIndex = Math.min(
          s.cardIndex,
          Math.max(0, (s.columns[newState.colIndex]?.cards.length || 1) - 1),
        );
        setInOutlineMode(false);
        setSubIndex(0);
        clearSelection();
      } else if (input === "l" || key.rightArrow) {
        newState.colIndex = Math.min(s.columns.length - 1, s.colIndex + 1);
        newState.cardIndex = Math.min(
          s.cardIndex,
          Math.max(0, (s.columns[newState.colIndex]?.cards.length || 1) - 1),
        );
        setInOutlineMode(false);
        setSubIndex(0);
        clearSelection();
      } else if (input === "g") {
        newState.cardIndex = 0;
        setInOutlineMode(false);
        setSubIndex(0);
        clearSelection();
      } else if (input === "G") {
        const currentCol = s.columns[s.colIndex];
        newState.cardIndex = Math.max(0, (currentCol?.cards.length || 1) - 1);
        setInOutlineMode(false);
        setSubIndex(0);
        clearSelection();
      }

      // Zoom in
      if (key.return && card && card.children.length > 0) {
        const zoomed = buildBoardState(card.node.id);
        zoomed.zoomStack = [...s.zoomStack, s.rootId || ""];
        setInOutlineMode(false);
        setSubIndex(0);
        clearSelection();
        return zoomed;
      }

      return newState;
    });
  });

  // Build board root path (static title)
  // Use filesystem path if available, otherwise build from node path
  const boardPath = state.rootPath || getNodePath(state.rootId);

  // Build selected item path for status line
  const selectedCol = state.columns[state.colIndex];
  const selectedCard = selectedCol?.cards[state.cardIndex];
  const selectedPath = selectedCard ? getNodePath(selectedCard.node.id) : "";

  return (
    <Box flexDirection="column" height={termHeight} minHeight={3}>
      <Box height={1}>
        <Text bold inverse>{` ${boardPath} `}</Text>
      </Box>
      <Box flexGrow={1}>
        {visibleColumns.map((col, i) => {
          const actualColIndex = colScrollOffset + i;
          return (
            <Column
              key={col.node.id}
              column={col}
              colIndex={actualColIndex}
              isSelected={actualColIndex === state.colIndex}
              selectedCardIndex={state.cardIndex}
              selectedSubIndex={inOutlineMode ? subIndex : -1}
              width={colWidth}
              height={termHeight - 3}
              maxOutlineDepth={maxOutlineDepth}
              foldedNodes={foldedNodes}
              onToggleFold={toggleFold}
              multiSelected={multiSelected}
            />
          );
        })}
      </Box>
      <Text>
        <Text>{selectedPath} </Text>
        {inOutlineMode && <Text color="cyan">{`[OUTLINE] `}</Text>}
        {multiSelected.size > 0 && (
          <Text color="yellow">{`[${multiSelected.size} sel] `}</Text>
        )}
        {state.columns.length > maxCols && (
          <Text
            dimColor
          >{`[cols ${colScrollOffset + 1}-${colScrollOffset + maxCols}/${state.columns.length}] `}</Text>
        )}
      </Text>
    </Box>
  );
}

export function renderInkBoard(state: BoardState): void {
  // Use patchConsole to prevent console output from corrupting the TUI
  // and enable full screen to ensure proper initial render
  render(<Board initialState={state} />, {
    exitOnCtrlC: true,
    patchConsole: true,
  });
}

// Testable version of Board component with fixed dimensions for testing
interface TestBoardProps {
  initialState: BoardState;
  testWidth: number;
  testHeight: number;
}

export function InkBoardTestable({
  initialState,
  testWidth,
  testHeight,
}: TestBoardProps): React.ReactElement {
  const [foldedNodes, setFoldedNodes] = useState<Set<string>>(new Set());
  const maxOutlineDepth = 2;
  const multiSelected = new Set<SelectionKey>();

  // Use fixed test dimensions instead of stdout
  const termWidth = testWidth;
  const termHeight = testHeight;

  const maxCols = Math.min(
    initialState.columns.length,
    Math.max(2, Math.floor(termWidth / 35)),
  );
  const colWidth = Math.floor((termWidth - 2) / maxCols);

  const colScrollOffset = Math.max(
    0,
    Math.min(
      initialState.colIndex - Math.floor(maxCols / 2),
      Math.max(0, initialState.columns.length - maxCols),
    ),
  );
  const visibleColumns = initialState.columns.slice(
    colScrollOffset,
    colScrollOffset + maxCols,
  );

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

  const boardPath = initialState.rootPath || getNodePath(initialState.rootId);
  const selectedCol = initialState.columns[initialState.colIndex];
  const selectedCard = selectedCol?.cards[initialState.cardIndex];
  const selectedPath = selectedCard ? getNodePath(selectedCard.node.id) : "";

  return (
    <Box flexDirection="column" height={termHeight} minHeight={3}>
      <Box height={1}>
        <Text bold inverse>{` ${boardPath} `}</Text>
      </Box>
      <Box flexGrow={1}>
        {visibleColumns.map((col, i) => {
          const actualColIndex = colScrollOffset + i;
          return (
            <Column
              key={col.node.id}
              column={col}
              colIndex={actualColIndex}
              isSelected={actualColIndex === initialState.colIndex}
              selectedCardIndex={initialState.cardIndex}
              selectedSubIndex={-1}
              width={colWidth}
              height={termHeight - 3}
              maxOutlineDepth={maxOutlineDepth}
              foldedNodes={foldedNodes}
              onToggleFold={toggleFold}
              multiSelected={multiSelected}
            />
          );
        })}
      </Box>
      <Text>
        <Text>{selectedPath} </Text>
        {initialState.columns.length > maxCols && (
          <Text
            dimColor
          >{`[cols ${colScrollOffset + 1}-${colScrollOffset + maxCols}/${initialState.columns.length}] `}</Text>
        )}
      </Text>
    </Box>
  );
}
