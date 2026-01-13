/**
 * Ink-based Board TUI Component
 * Full-screen board view with columns and cards
 */
import React, { useState, useEffect } from "react";
import { Box, Text, useInput, useApp, useStdout } from "ink";
import { withFullScreen } from "fullscreen-ink";
import type { BoardState, CardState, ColumnState } from "./types.ts";
import { buildBoardState, initBoardState } from "./state.ts";
import type { Node, TaskStatus } from "@km/core";
import { getChildren, getNode, getDb, isMemoryMode } from "@km/store";
import { emit } from "@km/core";
import { getNodeDisplayName, getCollapsedTypeSuffix } from "@km/shared";
import { DetailPane } from "./detail-pane.tsx";
import { ProjectPicker } from "./project-picker.tsx";
import { HelpOverlay } from "./help-overlay.tsx";
import {
  createPasteHandler,
  getFileInfo,
  supportsFileDrop,
} from "./paste-handler.ts";
import {
  createMouseHandler,
  supportsMouseMode,
  SelectionManager,
  type SelectionRange,
  type MouseEvent as TermMouseEvent,
} from "./mouse-handler.ts";

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
  // Only show status icon for tasks, not for sections or other types
  const isTask = node.type === "task";
  const icon = isTask ? getStatusIcon(node.task_status) : "";
  const rawContent = node.content || getNodeDisplayName(node);
  const firstLine = rawContent.split("\n")[0] ?? rawContent;
  // Get collapsed type suffix (e.g., "/ .md #" for unified folder/file/section)
  const typeSuffix = getCollapsedTypeSuffix(node);

  const children = getChildren(node.id);
  const hasChildren = children.length > 0;
  const isFolded = foldedNodes.has(node.id);
  const foldIndicator = hasChildren ? (isFolded ? "\u25B6" : "\u25BC") : " ";
  const foldedCount = hasChildren && isFolded ? ` (${children.length})` : "";

  // Build prefix: "  " per depth + fold indicator + space + icon + space
  const indent = "  ".repeat(depth);
  const prefix = icon
    ? `${indent}${foldIndicator} ${icon} `
    : `${indent}${foldIndicator} `;
  const suffix = typeSuffix ? ` ${typeSuffix}` : "";

  // Build the full line and truncate to fit width exactly
  // Format: prefix + content + suffix + foldedCount
  const fixedParts = prefix.length + suffix.length + foldedCount.length;
  const availWidth = Math.max(1, width - fixedParts);
  const truncatedContent =
    firstLine.length > availWidth
      ? firstLine.slice(0, availWidth - 1) + "…"
      : firstLine;

  // Build complete line, padded/truncated to exact width
  const fullLine = prefix + truncatedContent + suffix + foldedCount;
  const displayLine = fullLine.slice(0, width);

  // Determine background color based on selection state
  let backgroundColor: string | undefined;
  let textColor: string | undefined;
  if (isItemSelected) {
    backgroundColor = "blue";
    textColor = "white";
  } else if (isMultiSelected) {
    backgroundColor = "yellow";
    textColor = "black";
  }

  // Track index for children
  let nextIndex = flatIndex + 1;

  return (
    <Box flexDirection="column" width={width} overflowX="hidden">
      <Text
        backgroundColor={backgroundColor}
        color={textColor}
        dimColor={!isCardSelected && depth > 0}
        wrap="truncate"
      >
        {displayLine}
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
  // Card border uses 2 chars (1 left + 1 right), so inner content is width - 2
  const innerWidth = Math.max(5, width - 2);
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
  isCollapsed: boolean; // Whether column shows only header with count
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
  isCollapsed,
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
  const wipLimit = column.wipLimit;
  const wipExceeded = wipLimit !== undefined && count > wipLimit;

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

  // Build count display: "(3)" or "(4/3)" with WIP limit
  const countDisplay =
    wipLimit !== undefined ? `(${count}/${wipLimit})` : `(${count})`;
  const warningIndicator = wipExceeded ? " \u26A0" : ""; // Warning sign when WIP exceeded
  const collapsedIndicator = isCollapsed ? " \u25B8" : ""; // Right-pointing triangle when collapsed

  // Determine border color: red if WIP exceeded, otherwise normal
  const borderColor = wipExceeded ? "red" : isSelected ? "blue" : "gray";

  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      borderStyle="single"
      borderColor={borderColor}
      overflowY="hidden"
    >
      <Text bold inverse={isSelected} wrap="truncate">
        {name.slice(
          0,
          width -
            6 -
            (typeSuffix ? typeSuffix.length + 1 : 0) -
            countDisplay.length -
            warningIndicator.length -
            collapsedIndicator.length,
        )}
        {typeSuffix ? <Text color="gray">{` ${typeSuffix}`}</Text> : ""}
        {wipExceeded ? (
          <Text color="red">{` ${countDisplay}${warningIndicator}`}</Text>
        ) : (
          ` ${countDisplay}`
        )}
        {collapsedIndicator}
      </Text>
      {isCollapsed ? (
        // Collapsed view: show only count summary
        <Box
          flexDirection="column"
          height={contentHeight}
          justifyContent="center"
          alignItems="center"
        >
          <Text dimColor>[collapsed - {count}]</Text>
        </Box>
      ) : (
        // Normal view: show cards
        <>
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
        </>
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
  const [moveMode, setMoveMode] = useState(false); // Whether in move mode (m prefix)
  const [showDetailPane, setShowDetailPane] = useState(false); // Whether detail pane is visible
  const [collapsedColumns, setCollapsedColumns] = useState<Set<number>>(
    new Set(initialState.collapsedColumns),
  ); // Column indices that are collapsed
  const [showProjectPicker, setShowProjectPicker] = useState(false); // Whether project picker is visible
  const [recentProjectIds, setRecentProjectIds] = useState<string[]>([]); // Recently used project targets
  const [droppedFiles, setDroppedFiles] = useState<string[]>([]); // Files dropped via drag-and-drop
  const [showDropNotification, setShowDropNotification] = useState(false); // Show drop notification
  const [mouseSelection, setMouseSelection] = useState<SelectionRange | null>(
    null,
  ); // Mouse drag selection range
  const [isMouseDragging, setIsMouseDragging] = useState(false); // Whether mouse drag is active
  const [showHelp, setShowHelp] = useState(false); // Whether help overlay is visible

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

  // Handle file drops via bracketed paste
  useEffect(() => {
    if (!supportsFileDrop()) return;

    const cleanup = createPasteHandler((files) => {
      setDroppedFiles(files);
      setShowDropNotification(true);
      // Auto-hide notification after 3 seconds
      setTimeout(() => setShowDropNotification(false), 3000);
    });

    return cleanup;
  }, []);

  // Handle mouse drag-select
  useEffect(() => {
    if (!supportsMouseMode()) return;

    const selectionManager = new SelectionManager((range) => {
      setMouseSelection(range);
      setIsMouseDragging(range !== null);
    });

    const cleanup = createMouseHandler((event: TermMouseEvent) => {
      selectionManager.handleMouseEvent(event);

      // Convert screen coordinates to board items
      // This is a simplified version - full implementation would map
      // coordinates to specific cards/items in the board
      if (event.type === "up" && mouseSelection) {
        // Selection complete - could trigger multi-select of items
        // within the selection range
      }
    });

    return cleanup;
  }, [mouseSelection]);

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

  // Move card within column (up/down)
  const moveCardInColumn = (card: CardState, direction: "up" | "down") => {
    const col = state.columns[state.colIndex];
    if (!col) return;

    const currentIndex = state.cardIndex;
    const targetIndex =
      direction === "up" ? currentIndex - 1 : currentIndex + 1;

    if (targetIndex < 0 || targetIndex >= col.cards.length) return;

    // Calculate new sort order using fractional indexing
    // When cards have same parent_idx (e.g., all 0), use index-based fallback
    const getEffectiveSortOrder = (cardIndex: number): number => {
      const c = col.cards[cardIndex];
      // If all cards have parent_idx 0, use index as fallback
      // Otherwise use the actual parent_idx
      return c
        ? c.node.parent_idx === 0
          ? cardIndex
          : c.node.parent_idx
        : cardIndex;
    };

    let newSortOrder: number;
    if (direction === "up") {
      if (targetIndex === 0) {
        // Moving to first position: go before the current first card
        const firstOrder = getEffectiveSortOrder(0);
        newSortOrder = firstOrder - 1;
      } else {
        // Moving between two cards: use midpoint
        const prevOrder = getEffectiveSortOrder(targetIndex - 1);
        const targetOrder = getEffectiveSortOrder(targetIndex);
        newSortOrder = (prevOrder + targetOrder) / 2;
      }
    } else {
      if (targetIndex >= col.cards.length - 1) {
        // Moving to last position: go after the current last card
        const lastOrder = getEffectiveSortOrder(col.cards.length - 1);
        newSortOrder = lastOrder + 1;
      } else {
        // Moving between two cards: use midpoint
        const targetOrder = getEffectiveSortOrder(targetIndex);
        const nextOrder = getEffectiveSortOrder(targetIndex + 1);
        newSortOrder = (targetOrder + nextOrder) / 2;
      }
    }

    // Update database - use direct SQL in memory mode, emit event in disk mode
    if (isMemoryMode()) {
      const db = getDb();
      db.run(
        "UPDATE nodes SET parent_id = ?, parent_idx = ?, updated_at = ? WHERE id = ?",
        [col.node.id, newSortOrder, Date.now(), card.node.id],
      );
    } else {
      emit({
        type: "node_moved",
        actor: "user",
        target: card.node.id,
        data: {
          parent_id: col.node.id,
          parent_idx: newSortOrder,
        },
      });
    }

    // Update local state and rebuild
    const newCardIndex = targetIndex;
    setState((s) => ({ ...s, cardIndex: newCardIndex }));

    // Rebuild board state to reflect changes
    setTimeout(() => {
      const newState = state.rootId
        ? buildBoardState(state.rootId)
        : initBoardState();

      if (newState) {
        newState.zoomStack = state.zoomStack;
        newState.rootPath = state.rootPath;
        newState.colIndex = state.colIndex;
        newState.cardIndex = newCardIndex;
        setState(newState);
      }
    }, 50);
  };

  // Move card to different column (left/right)
  const moveCardToColumn = (card: CardState, direction: "left" | "right") => {
    const targetColIndex =
      direction === "left" ? state.colIndex - 1 : state.colIndex + 1;
    if (targetColIndex < 0 || targetColIndex >= state.columns.length) return;

    const targetCol = state.columns[targetColIndex];
    if (!targetCol) return;

    // Calculate sort order (add at end of target column)
    const lastCard = targetCol.cards[targetCol.cards.length - 1];
    const newSortOrder = lastCard ? lastCard.node.parent_idx + 1 : 0;

    // Update database - use direct SQL in memory mode, emit event in disk mode
    if (isMemoryMode()) {
      const db = getDb();
      db.run(
        "UPDATE nodes SET parent_id = ?, parent_idx = ?, updated_at = ? WHERE id = ?",
        [targetCol.node.id, newSortOrder, Date.now(), card.node.id],
      );
    } else {
      emit({
        type: "node_moved",
        actor: "user",
        target: card.node.id,
        data: {
          parent_id: targetCol.node.id,
          parent_idx: newSortOrder,
        },
      });
    }

    // Update local state
    const newCardIndex = targetCol.cards.length;
    setState((s) => ({
      ...s,
      colIndex: targetColIndex,
      cardIndex: newCardIndex,
    }));

    // Rebuild board state
    setTimeout(() => {
      // Use initBoardState for root level (null), buildBoardState for specific root
      const newState = state.rootId
        ? buildBoardState(state.rootId)
        : initBoardState();

      if (newState) {
        newState.zoomStack = state.zoomStack;
        newState.rootPath = state.rootPath;
        newState.colIndex = targetColIndex;
        newState.cardIndex = Math.min(
          newCardIndex,
          newState.columns[targetColIndex]?.cards.length || 0,
        );
        setState(newState);
      }
    }, 50);
  };

  useInput((input, key) => {
    const col = state.columns[state.colIndex];
    const card = col?.cards[state.cardIndex];

    // Toggle help with '?'
    if (input === "?") {
      setShowHelp((prev) => !prev);
      return;
    }

    // Close help with Escape
    if (showHelp && key.escape) {
      setShowHelp(false);
      return;
    }

    // Ignore other keys when help is shown
    if (showHelp) {
      return;
    }

    // Quit
    if (input === "q" && !moveMode) {
      exit();
      return;
    }

    // Cancel move mode with Escape or q
    if (moveMode && (key.escape || input === "q")) {
      setMoveMode(false);
      return;
    }

    // Enter move mode with 'm'
    if (input === "m" && !moveMode) {
      setMoveMode(true);
      return;
    }

    // Move mode operations: m+hjkl
    if (moveMode) {
      // Valid move keys - stay in move mode for repeated moves
      if (input === "k" || input === "j" || input === "h" || input === "l") {
        if (card) {
          if (input === "k") moveCardInColumn(card, "up");
          else if (input === "j") moveCardInColumn(card, "down");
          else if (input === "h") moveCardToColumn(card, "left");
          else if (input === "l") moveCardToColumn(card, "right");
        }
        return;
      }
      // Arrow keys also work in move mode
      if (key.upArrow || key.downArrow || key.leftArrow || key.rightArrow) {
        if (card) {
          if (key.upArrow) moveCardInColumn(card, "up");
          else if (key.downArrow) moveCardInColumn(card, "down");
          else if (key.leftArrow) moveCardToColumn(card, "left");
          else if (key.rightArrow) moveCardToColumn(card, "right");
        }
        return;
      }
      // Ignore empty inputs (terminal noise) - stay in move mode
      if (input === "") {
        return;
      }
      // Any other key cancels move mode
      setMoveMode(false);
      // Don't return - let the key be processed normally
    }

    // Alt+Arrow for move (direct, without move mode prefix)
    if (key.meta && card) {
      if (key.upArrow) {
        moveCardInColumn(card, "up");
        return;
      }
      if (key.downArrow) {
        moveCardInColumn(card, "down");
        return;
      }
      if (key.leftArrow) {
        moveCardToColumn(card, "left");
        return;
      }
      if (key.rightArrow) {
        moveCardToColumn(card, "right");
        return;
      }
    }

    // Go to parent: Escape or 'u'
    if (key.escape || input === "u") {
      // If detail pane is open, close it
      if (showDetailPane) {
        setShowDetailPane(false);
        return;
      }
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
      // At root of zoom stack - try to go up to parent node
      if (state.rootId) {
        const currentRoot = getNode(state.rootId);
        if (currentRoot?.parent_id) {
          // Go up to parent
          const parentNode = getNode(currentRoot.parent_id);
          if (parentNode?.parent_id) {
            // Parent has a parent - build board from grandparent
            const grandparent = getNode(parentNode.parent_id);
            if (grandparent) {
              const zoomed = buildBoardState(grandparent.id);
              setState(zoomed);
              clearSelection();
              return;
            }
          }
          // Parent is at top level - go to root view
          const rootState = initBoardState();
          if (rootState) {
            setState(rootState);
            clearSelection();
            return;
          }
        }
      }
      // Truly at top level, quit
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

    // Toggle column collapse (c key)
    if (input === "c") {
      setCollapsedColumns((prev) => {
        const next = new Set(prev);
        if (next.has(state.colIndex)) {
          next.delete(state.colIndex);
        } else {
          next.add(state.colIndex);
        }
        return next;
      });
      return;
    }

    // Shift+J/K or Shift+Down/Up for range selection
    // Works in both outline mode (sub-item selection) and card mode (card selection)
    if (input === "J" || (key.shift && key.downArrow)) {
      if (inOutlineMode) {
        // Start or extend selection downward within card
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
        } else {
          // At end of card, extend selection to next card
          const currentCol = state.columns[state.colIndex];
          if (currentCol && state.cardIndex < currentCol.cards.length - 1) {
            const newCardIndex = state.cardIndex + 1;
            setState((s) => ({ ...s, cardIndex: newCardIndex }));
            setSubIndex(0);
            updateSelectionRange(state.colIndex, newCardIndex, 0);
          }
        }
      } else {
        // Card-level selection: extend selection to include next card
        if (!selectionAnchor) {
          setSelectionAnchor({
            col: state.colIndex,
            card: state.cardIndex,
            sub: 0,
          });
          // Select current card fully
          const currentCard = col?.cards[state.cardIndex];
          if (currentCard) {
            const maxItems =
              1 +
              countVisibleDescendants(
                currentCard.node,
                0,
                maxOutlineDepth,
                foldedNodes,
              );
            const newSelected = new Set<SelectionKey>();
            for (let s = 0; s < maxItems; s++) {
              newSelected.add(
                makeSelectionKey(state.colIndex, state.cardIndex, s),
              );
            }
            setMultiSelected(newSelected);
          }
        }
        const currentCol = state.columns[state.colIndex];
        if (currentCol && state.cardIndex < currentCol.cards.length - 1) {
          const newCardIndex = state.cardIndex + 1;
          setState((s) => ({ ...s, cardIndex: newCardIndex }));
          updateSelectionRange(state.colIndex, newCardIndex, 0);
        }
      }
      return;
    }
    if (input === "K" || (key.shift && key.upArrow)) {
      if (inOutlineMode) {
        // Start or extend selection upward within card
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
        } else {
          // At start of card, extend selection to previous card
          if (state.cardIndex > 0) {
            const newCardIndex = state.cardIndex - 1;
            const prevCard = state.columns[state.colIndex]?.cards[newCardIndex];
            if (prevCard) {
              const maxSub =
                1 +
                countVisibleDescendants(
                  prevCard.node,
                  0,
                  maxOutlineDepth,
                  foldedNodes,
                );
              setState((s) => ({ ...s, cardIndex: newCardIndex }));
              setSubIndex(maxSub - 1);
              updateSelectionRange(state.colIndex, newCardIndex, maxSub - 1);
            }
          }
        }
      } else {
        // Card-level selection: extend selection to include previous card
        if (!selectionAnchor) {
          setSelectionAnchor({
            col: state.colIndex,
            card: state.cardIndex,
            sub: 0,
          });
          // Select current card fully
          const currentCard = col?.cards[state.cardIndex];
          if (currentCard) {
            const maxItems =
              1 +
              countVisibleDescendants(
                currentCard.node,
                0,
                maxOutlineDepth,
                foldedNodes,
              );
            const newSelected = new Set<SelectionKey>();
            for (let s = 0; s < maxItems; s++) {
              newSelected.add(
                makeSelectionKey(state.colIndex, state.cardIndex, s),
              );
            }
            setMultiSelected(newSelected);
          }
        }
        if (state.cardIndex > 0) {
          const newCardIndex = state.cardIndex - 1;
          setState((s) => ({ ...s, cardIndex: newCardIndex }));
          updateSelectionRange(state.colIndex, newCardIndex, 0);
        }
      }
      return;
    }

    // Shift+H/L or Shift+Left/Right for horizontal range selection (across columns)
    if (input === "H" || (key.shift && key.leftArrow)) {
      // Currently H is used for moving cards. For now, Shift+Left extends selection.
      // In the future, could remap card movement to Alt+H/L
      if (state.colIndex > 0) {
        if (!selectionAnchor) {
          setSelectionAnchor({
            col: state.colIndex,
            card: state.cardIndex,
            sub: 0,
          });
        }
        const newColIndex = state.colIndex - 1;
        setState((s) => ({
          ...s,
          colIndex: newColIndex,
          cardIndex: Math.min(
            s.cardIndex,
            Math.max(0, (s.columns[newColIndex]?.cards.length || 1) - 1),
          ),
        }));
        // For cross-column selection, we just track that multiple columns are involved
        // Full implementation would require more complex selection model
      }
      return;
    }
    if (input === "L" || (key.shift && key.rightArrow)) {
      if (state.colIndex < state.columns.length - 1) {
        if (!selectionAnchor) {
          setSelectionAnchor({
            col: state.colIndex,
            card: state.cardIndex,
            sub: 0,
          });
        }
        const newColIndex = state.colIndex + 1;
        setState((s) => ({
          ...s,
          colIndex: newColIndex,
          cardIndex: Math.min(
            s.cardIndex,
            Math.max(0, (s.columns[newColIndex]?.cards.length || 1) - 1),
          ),
        }));
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

      // Helper to find card with closest relative position
      // Uses fractional position (0-1) to find best match regardless of column length
      const findClosestCard = (
        targetColIndex: number,
        currentCardIndex: number,
        currentColLength: number,
      ): number => {
        const targetCol = s.columns[targetColIndex];
        if (!targetCol || targetCol.cards.length === 0) return 0;

        // Calculate relative position (0-1) of current card in its column
        const relativePos =
          currentColLength <= 1
            ? 0.5
            : currentCardIndex / (currentColLength - 1);

        // Find card at equivalent relative position in target column
        const targetIndex = Math.round(
          relativePos * (targetCol.cards.length - 1),
        );
        return Math.max(0, Math.min(targetCol.cards.length - 1, targetIndex));
      };

      // Horizontal navigation - exit outline mode and clear selection when changing columns
      if (input === "h" || key.leftArrow) {
        const newColIndex = Math.max(0, s.colIndex - 1);
        const currentCol = s.columns[s.colIndex];
        newState.colIndex = newColIndex;
        newState.cardIndex = findClosestCard(
          newColIndex,
          s.cardIndex,
          currentCol?.cards.length || 0,
        );
        setInOutlineMode(false);
        setSubIndex(0);
        clearSelection();
      } else if (input === "l" || key.rightArrow) {
        const newColIndex = Math.min(s.columns.length - 1, s.colIndex + 1);
        const currentCol = s.columns[s.colIndex];
        newState.colIndex = newColIndex;
        newState.cardIndex = findClosestCard(
          newColIndex,
          s.cardIndex,
          currentCol?.cards.length || 0,
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

      // Enter opens detail pane
      if (key.return && card) {
        setShowDetailPane(true);
        setInOutlineMode(false);
        setSubIndex(0);
        clearSelection();
        return s; // Don't change board state, just show pane
      }

      // Zoom in with 'o' (open/expand into children)
      if (input === "o" && card && card.children.length > 0) {
        const zoomed = buildBoardState(card.node.id);
        zoomed.zoomStack = [...s.zoomStack, s.rootId || ""];
        setInOutlineMode(false);
        setSubIndex(0);
        clearSelection();
        setShowDetailPane(false);
        return zoomed;
      }

      // Open project picker with 'p' key
      if (input === "p" && card) {
        setShowProjectPicker(true);
        setInOutlineMode(false);
        setSubIndex(0);
        clearSelection();
        setShowDetailPane(false);
        return s; // Don't change board state, just show picker
      }

      return newState;
    });
  });

  // Handle detail pane navigation (j/k to move cards while pane is open)
  useInput(
    (input, key) => {
      if (!showDetailPane) return;

      const col = state.columns[state.colIndex];

      // Close detail pane with 'h' key
      if (input === "h") {
        setShowDetailPane(false);
        return;
      }

      // Navigate cards while detail pane is open
      if (input === "j" || key.downArrow) {
        if (col && state.cardIndex < col.cards.length - 1) {
          setState((s) => ({ ...s, cardIndex: s.cardIndex + 1 }));
        }
        return;
      }
      if (input === "k" || key.upArrow) {
        if (state.cardIndex > 0) {
          setState((s) => ({ ...s, cardIndex: s.cardIndex - 1 }));
        }
        return;
      }

      // Quit from detail pane
      if (input === "q") {
        exit();
        return;
      }

      // Status cycling in detail pane
      if (input === "s" || input === "x") {
        const card = state.columns[state.colIndex]?.cards[state.cardIndex];
        if (card) {
          const currentStatus = card.node.task_status || "open";
          const statusCycle: TaskStatus[] = [
            "open",
            "blocked",
            "done",
            "dropped",
          ];
          const currentIndex = statusCycle.indexOf(currentStatus);
          const nextIndex = (currentIndex + 1) % statusCycle.length;
          const nextStatus = statusCycle[nextIndex] as TaskStatus;
          const markMap: Record<TaskStatus, string> = {
            open: " ",
            blocked: "!",
            done: "x",
            dropped: "-",
          };
          const nextMark = markMap[nextStatus];

          emit({
            type: "node_updated",
            actor: "user",
            target: card.node.id,
            data: { task_status: nextStatus, task_mark: nextMark },
          });

          // Refresh board state
          setTimeout(() => {
            const newState = state.rootId
              ? buildBoardState(state.rootId)
              : initBoardState();
            if (newState) {
              newState.zoomStack = state.zoomStack;
              newState.rootPath = state.rootPath;
              newState.colIndex = state.colIndex;
              newState.cardIndex = state.cardIndex;
              setState(newState);
            }
          }, 50);
        }
        return;
      }

      // Priority setting in detail pane (1-5)
      if (["1", "2", "3", "4", "5"].includes(input)) {
        const card = state.columns[state.colIndex]?.cards[state.cardIndex];
        if (card) {
          emit({
            type: "node_updated",
            actor: "user",
            target: card.node.id,
            data: { priority: parseInt(input, 10) },
          });

          // Refresh board state
          setTimeout(() => {
            const newState = state.rootId
              ? buildBoardState(state.rootId)
              : initBoardState();
            if (newState) {
              newState.zoomStack = state.zoomStack;
              newState.rootPath = state.rootPath;
              newState.colIndex = state.colIndex;
              newState.cardIndex = state.cardIndex;
              setState(newState);
            }
          }, 50);
        }
        return;
      }
    },
    { isActive: showDetailPane },
  );

  // Handle project picker selection
  const handleProjectSelect = (targetNode: Node) => {
    const card = state.columns[state.colIndex]?.cards[state.cardIndex];
    if (!card) {
      setShowProjectPicker(false);
      return;
    }

    // Calculate sort order (add at end of target)
    const targetChildren = getChildren(targetNode.id);
    const lastChild = targetChildren[targetChildren.length - 1];
    const newSortOrder = lastChild ? lastChild.parent_idx + 1 : 0;

    // Update database - use direct SQL in memory mode, emit event in disk mode
    if (isMemoryMode()) {
      const db = getDb();
      db.run(
        "UPDATE nodes SET parent_id = ?, parent_idx = ?, updated_at = ? WHERE id = ?",
        [targetNode.id, newSortOrder, Date.now(), card.node.id],
      );
    } else {
      emit({
        type: "node_moved",
        actor: "user",
        target: card.node.id,
        data: {
          parent_id: targetNode.id,
          parent_idx: newSortOrder,
        },
      });
    }

    // Track as recent project
    setRecentProjectIds((prev) => {
      const filtered = prev.filter((id) => id !== targetNode.id);
      return [targetNode.id, ...filtered].slice(0, 5); // Keep last 5
    });

    // Close picker and rebuild board
    setShowProjectPicker(false);

    setTimeout(() => {
      const newState = state.rootId
        ? buildBoardState(state.rootId)
        : initBoardState();

      if (newState) {
        newState.zoomStack = state.zoomStack;
        newState.rootPath = state.rootPath;
        // Reset to first card if current no longer exists
        newState.colIndex = Math.min(
          state.colIndex,
          Math.max(0, newState.columns.length - 1),
        );
        const col = newState.columns[newState.colIndex];
        newState.cardIndex = Math.min(
          state.cardIndex,
          Math.max(0, (col?.cards.length ?? 1) - 1),
        );
        setState(newState);
      }
    }, 50);
  };

  const handleProjectCancel = () => {
    setShowProjectPicker(false);
  };

  // Build board root path (static title)
  // Use filesystem path if available, otherwise build from node path
  const boardPath = state.rootPath || getNodePath(state.rootId);

  // Build selected item path for status line
  const selectedCol = state.columns[state.colIndex];
  const selectedCard = selectedCol?.cards[state.cardIndex];
  const selectedPath = selectedCard ? getNodePath(selectedCard.node.id) : "";

  // Calculate widths for split view
  const detailPaneWidth = showDetailPane ? Math.floor(termWidth * 0.4) : 0;
  const boardWidth = termWidth - detailPaneWidth;

  // Recalculate columns when detail pane is shown
  const effectiveMaxCols = showDetailPane
    ? Math.min(state.columns.length, Math.max(1, Math.floor(boardWidth / 35)))
    : maxCols;
  const effectiveColWidth = showDetailPane
    ? Math.floor((boardWidth - 2) / effectiveMaxCols)
    : colWidth;
  const effectiveVisibleColumns = showDetailPane
    ? state.columns.slice(
        Math.max(
          0,
          Math.min(
            state.colIndex - Math.floor(effectiveMaxCols / 2),
            Math.max(0, state.columns.length - effectiveMaxCols),
          ),
        ),
        Math.max(
          0,
          Math.min(
            state.colIndex - Math.floor(effectiveMaxCols / 2),
            Math.max(0, state.columns.length - effectiveMaxCols),
          ),
        ) + effectiveMaxCols,
      )
    : visibleColumns;
  const effectiveScrollOffset = showDetailPane
    ? Math.max(
        0,
        Math.min(
          state.colIndex - Math.floor(effectiveMaxCols / 2),
          Math.max(0, state.columns.length - effectiveMaxCols),
        ),
      )
    : colScrollOffset;

  return (
    <Box flexDirection="column" height={termHeight} minHeight={3}>
      <Box height={1}>
        <Text bold inverse>{` ${boardPath} `}</Text>
      </Box>
      <Box flexGrow={1} flexDirection="row">
        {/* Board columns */}
        <Box flexDirection="row" width={boardWidth}>
          {effectiveVisibleColumns.map((col, i) => {
            const actualColIndex = effectiveScrollOffset + i;
            return (
              <Column
                key={col.node.id}
                column={col}
                colIndex={actualColIndex}
                isSelected={actualColIndex === state.colIndex}
                isCollapsed={collapsedColumns.has(actualColIndex)}
                selectedCardIndex={state.cardIndex}
                selectedSubIndex={inOutlineMode ? subIndex : -1}
                width={effectiveColWidth}
                height={termHeight - 3}
                maxOutlineDepth={maxOutlineDepth}
                foldedNodes={foldedNodes}
                onToggleFold={toggleFold}
                multiSelected={multiSelected}
              />
            );
          })}
        </Box>
        {/* Detail pane */}
        {showDetailPane && selectedCard && (
          <DetailPane
            node={selectedCard.node}
            width={detailPaneWidth}
            height={termHeight - 3}
          />
        )}
        {/* Project picker modal */}
        {showProjectPicker && (
          <Box
            position="absolute"
            marginLeft={Math.floor(termWidth / 4)}
            marginTop={Math.floor(termHeight / 4)}
          >
            <ProjectPicker
              onSelect={handleProjectSelect}
              onCancel={handleProjectCancel}
              width={Math.floor(termWidth / 2)}
              height={Math.floor(termHeight / 2)}
              recentProjectIds={recentProjectIds}
            />
          </Box>
        )}
        {/* Help overlay */}
        {showHelp && <HelpOverlay width={termWidth} height={termHeight - 2} />}
      </Box>
      <Text>
        <Text>{selectedPath} </Text>
        {showHelp && <Text color="cyan">{`[HELP ?] `}</Text>}
        {showDetailPane && <Text color="cyan">{`[DETAIL] `}</Text>}
        {showProjectPicker && <Text color="green">{`[PROJECT] `}</Text>}
        {moveMode && <Text color="magenta">{`[MOVE] `}</Text>}
        {inOutlineMode && <Text color="cyan">{`[OUTLINE] `}</Text>}
        {multiSelected.size > 0 && (
          <Text color="yellow">{`[${multiSelected.size} sel] `}</Text>
        )}
        {showDropNotification && droppedFiles.length > 0 && (
          <Text color="green">
            {`[Dropped: ${droppedFiles.map((f) => getFileInfo(f).name).join(", ")}] `}
          </Text>
        )}
        {isMouseDragging && mouseSelection && (
          <Text color="blue">
            {`[Select: ${mouseSelection.startY}-${mouseSelection.endY}] `}
          </Text>
        )}
        {state.columns.length > effectiveMaxCols && (
          <Text
            dimColor
          >{`[cols ${effectiveScrollOffset + 1}-${effectiveScrollOffset + effectiveMaxCols}/${state.columns.length}] `}</Text>
        )}
      </Text>
    </Box>
  );
}

export function renderInkBoard(state: BoardState): void {
  void withFullScreen(<Board initialState={state} />, {
    exitOnCtrlC: true,
    patchConsole: true,
  }).start();
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
              isCollapsed={initialState.collapsedColumns.has(actualColIndex)}
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
