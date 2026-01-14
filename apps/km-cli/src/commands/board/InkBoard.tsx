/**
 * Ink-based Board TUI Component
 * Full-screen board view with columns and cards
 */
import React, { useState, useEffect } from "react";
import { Box, Text, useInput, useApp, useStdout } from "ink";
import { withFullScreen } from "fullscreen-ink";
import chalk from "chalk";
import type {
  BoardState,
  CardState,
  ColumnState,
  ViewMode,
  SelectionKey,
} from "./types.ts";
import { buildBoardState, initBoardState } from "./state.ts";
import type { Node, TaskStatus } from "@km/core";
import {
  getChildren,
  getNode,
  getDb,
  isMemoryMode,
  resolveNode,
} from "@km/store";
import { emit } from "@km/core";
import {
  getNodeDisplayName,
  getCollapsedTypeSuffix,
  getParentContext,
} from "@km/shared";
import { DetailPane } from "./detail-pane.tsx";
import { ProjectPicker } from "./project-picker.tsx";
import { HelpOverlay } from "./help-overlay.tsx";
import { TreeView } from "./TreeView.tsx";
import { ColumnsView } from "./ColumnsView.tsx";
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

// Default favorites: common boards accessed via 1-9 keys
// These are resolved at runtime using the same resolution as CLI commands
const DEFAULT_FAVORITES: Record<string, string> = {
  "1": "@inbox", // Inbox
  "2": "@next", // Next actions
  "3": "@waiting", // Waiting for
  "4": "@someday", // Someday/maybe
  "5": "@projects", // Projects
  "6": "@areas", // Areas of responsibility
  "7": "@archive", // Archive
  "8": "@reference", // Reference
  "9": "@goals", // Goals
};

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

// Build path segments for colorized display
// Returns segments with: { name, sep, isWithinBoard }
// isWithinBoard distinguishes the board root path from path within the board
function getPathSegments(
  nodeId: string | null,
  boardRootId: string | null,
): Array<{ name: string; sep: string; isWithinBoard: boolean }> {
  if (!nodeId) return [{ name: "/", sep: "", isWithinBoard: false }];

  // Collect all nodes from root to target
  const nodes: Node[] = [];
  let currentId: string | null = nodeId;
  while (currentId) {
    const node = getNode(currentId);
    if (!node) break;
    nodes.unshift(node);
    currentId = node.parent_id;
  }

  if (nodes.length === 0) return [{ name: "/", sep: "", isWithinBoard: false }];

  // Find index where we enter the board (nodes after boardRootId)
  let boardRootIndex = -1;
  if (boardRootId) {
    boardRootIndex = nodes.findIndex((n) => n.id === boardRootId);
  }

  // Build segments with separators
  const segments: Array<{ name: string; sep: string; isWithinBoard: boolean }> =
    [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!node) continue;
    const name = getNodeDisplayName(node);
    const isWithinBoard = boardRootIndex >= 0 && i > boardRootIndex;

    if (node.type === "folder" || node.type === "file") {
      segments.push({
        name,
        sep: segments.length > 0 ? "/" : "",
        isWithinBoard,
      });
    } else if (node.type === "section") {
      segments.push({ name, sep: "#", isWithinBoard });
    } else if (node.type === "board") {
      if (segments.length === 0) {
        segments.push({ name, sep: "", isWithinBoard: false });
      }
    } else {
      // Other types (paragraph, task, etc.)
      segments.push({
        name,
        sep: segments.length > 0 ? "/" : "",
        isWithinBoard,
      });
    }
  }

  return segments.length > 0
    ? segments
    : [{ name: "/", sep: "", isWithinBoard: false }];
}

// Truncate path segments to fit within maxWidth
// First truncates from the start of within-board segments, then from start of root path
function truncatePathSegments(
  segments: Array<{ name: string; sep: string; isWithinBoard: boolean }>,
  maxWidth: number,
): Array<{ name: string; sep: string; isWithinBoard: boolean }> {
  // Calculate current total length (sep has space padding: " sep ")
  const calcLength = (
    segs: Array<{ name: string; sep: string; isWithinBoard: boolean }>,
  ) =>
    segs.reduce(
      (acc, seg) => acc + seg.name.length + (seg.sep ? seg.sep.length + 2 : 0),
      0,
    );

  let totalLen = calcLength(segments);
  if (totalLen <= maxWidth) return segments;

  // Split into root path and within-board segments
  const rootSegs = segments.filter((s) => !s.isWithinBoard);
  const boardSegs = segments.filter((s) => s.isWithinBoard);

  // First truncate within-board segments from the start
  while (
    boardSegs.length > 1 &&
    calcLength([...rootSegs, ...boardSegs]) > maxWidth
  ) {
    boardSegs.shift();
    const first = boardSegs[0];
    if (first) {
      boardSegs[0] = { ...first, name: "…" + first.name };
    }
    break; // Only add one ellipsis
  }

  // If still too long, truncate root segments from the start
  const combined = [...rootSegs, ...boardSegs];
  totalLen = calcLength(combined);
  if (totalLen > maxWidth && rootSegs.length > 1) {
    // Remove from start, add ellipsis
    const result = [...rootSegs.slice(1), ...boardSegs];
    if (result.length > 0 && result[0]) {
      result[0] = { ...result[0], sep: "", name: "…" + result[0].name };
    }
    return result;
  }

  return [...rootSegs, ...boardSegs];
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
    case "dropped":
      return "\u2205"; // empty set (∅)
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

  // Check if this is a transcluded (symlinked) node
  const isTranscluded =
    node.symlink_to !== null && node.symlink_to !== undefined;

  // Get parent context for top-level cards (depth 0)
  // Shows where the task belongs, e.g., "< Green card" for a task from green-card.md
  // For transcluded items, getParentContext follows symlink_to to get original location
  const parentContext = depth === 0 && isTask ? getParentContext(node) : null;

  const children = getChildren(node.id);
  const hasChildren = children.length > 0;
  const isFolded = foldedNodes.has(node.id);
  const foldIndicator = hasChildren ? (isFolded ? "\u25B6" : "\u25BC") : " ";
  const foldedCount = hasChildren && isFolded ? ` (${children.length})` : "";

  // Build prefix: "  " per depth + fold indicator + space + icon + space
  // Add transclusion indicator (→) for symlinked nodes
  const indent = "  ".repeat(depth);
  const transclusionMark = isTranscluded ? "→" : "";
  const prefix = icon
    ? `${indent}${foldIndicator} ${icon}${transclusionMark} `
    : `${indent}${foldIndicator} `;
  const suffix = typeSuffix ? ` ${typeSuffix}` : "";

  // Build the full line and truncate to fit width exactly
  // Format: prefix + content + suffix + foldedCount + parentContext (grey)
  // Parent context truncated to max 20 chars for readability
  const maxContextLen = 20;
  const truncatedContext = parentContext
    ? parentContext.length > maxContextLen
      ? parentContext.slice(0, maxContextLen - 1) + "…"
      : parentContext
    : null;
  const contextSuffix = truncatedContext ? ` < ${truncatedContext}` : "";
  const fixedParts =
    prefix.length + suffix.length + foldedCount.length + contextSuffix.length;
  const availWidth = Math.max(1, width - fixedParts);
  const truncatedContent =
    firstLine.length > availWidth
      ? firstLine.slice(0, availWidth - 1) + "…"
      : firstLine;

  // Build the main line (without context) - context suffix styled separately
  const mainLine = prefix + truncatedContent + suffix + foldedCount;

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
        {mainLine}
        {truncatedContext && <Text dimColor>{contextSuffix}</Text>}
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

// Selection key helper: "col:card:sub" format for tracking multi-selection
export function makeSelectionKey(
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
      borderColor={isSelected ? "cyanBright" : "blackBright"}
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
  selectionLevel: "board" | "column" | "card"; // Current selection level
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
  selectionLevel,
}: ColumnProps) {
  const name = getNodeDisplayName(column.node);
  const typeSuffix = getCollapsedTypeSuffix(column.node);
  const count = column.cards.length;
  const wipLimit = column.wipLimit;
  const wipExceeded = wipLimit !== undefined && count > wipLimit;

  // Available height for cards: column height - border (2) - header (1)
  const baseContentHeight = Math.max(1, height - 3);
  // Each card takes ~3 lines minimum (top border + content + bottom border)
  const minCardHeight = 3;

  // Calculate how many cards can fit - use generous estimate to avoid false overflow
  const maxCards = Math.max(1, Math.floor(baseContentHeight / minCardHeight));

  // Only scroll/overflow if we actually have more cards than can fit
  const needsScroll = column.cards.length > maxCards;

  // Scroll to keep selected card visible (only if scrolling needed)
  const scrollOffset = needsScroll
    ? Math.max(
        0,
        Math.min(
          selectedCardIndex - Math.floor(maxCards / 2),
          Math.max(0, column.cards.length - maxCards),
        ),
      )
    : 0;
  const visibleCards = column.cards.slice(
    scrollOffset,
    scrollOffset + maxCards,
  );

  // Content height is what's available (let Ink handle actual overflow)
  const contentHeight = baseContentHeight;

  // Determine actual overflow visibility - only show when actively scrolling
  const hasTopOverflow = scrollOffset > 0;
  const hasBottomOverflow = scrollOffset + maxCards < column.cards.length;

  // Build count display: "(3)" or "(4/3)" with WIP limit
  const countDisplay =
    wipLimit !== undefined ? `(${count}/${wipLimit})` : `(${count})`;
  const warningIndicator = wipExceeded ? " \u26A0" : ""; // Warning sign when WIP exceeded
  const collapsedIndicator = isCollapsed ? " \u25B8" : ""; // Right-pointing triangle when collapsed

  // Determine border color: red if WIP exceeded, bright for selected, dim for unselected
  const borderColor = wipExceeded
    ? "red"
    : isSelected
      ? "blueBright"
      : "blackBright";

  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      borderStyle="single"
      borderColor={borderColor}
      overflowY="hidden"
    >
      <Text
        bold
        color={isSelected && selectionLevel === "column" ? "white" : "yellow"}
        backgroundColor={isSelected && selectionLevel === "column" ? "blue" : undefined}
        wrap="truncate"
      >
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
        // Normal view: show cards with overflow indicators
        <>
          {/* Top overflow indicator - full width bar */}
          {hasTopOverflow && (
            <Box width={width - 2}>
              <Text backgroundColor="gray" color="white">
                {" ".repeat(Math.floor((width - 4) / 2))}▲
                {" ".repeat(Math.ceil((width - 4) / 2))}
              </Text>
            </Box>
          )}
          <Box flexDirection="column" height={contentHeight} overflowY="hidden">
            {visibleCards.map((card, i) => {
              const actualCardIndex = scrollOffset + i;
              // Card is only selected when at card level (not column or board level)
              const cardIsSelected =
                isSelected && actualCardIndex === selectedCardIndex && selectionLevel === "card";
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
            {column.cards.length === 0 && (
              <Box marginTop={1}>
                <Text dimColor>(empty)</Text>
              </Box>
            )}
          </Box>
          {/* Bottom overflow indicator - full width bar */}
          {hasBottomOverflow && (
            <Box width={width - 2}>
              <Text backgroundColor="gray" color="white">
                {" ".repeat(Math.floor((width - 4) / 2))}▼
                {" ".repeat(Math.ceil((width - 4) / 2))}
              </Text>
            </Box>
          )}
        </>
      )}
    </Box>
  );
}

interface BoardProps {
  initialState: BoardState;
  initialViewMode?: ViewMode;
}

function Board({ initialState, initialViewMode = "board" }: BoardProps) {
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
  const [showDetailPane, setShowDetailPane] = useState(
    initialViewMode === "tree",
  ); // Detail pane visible by default in tree view
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
  const [selectAllLevel, setSelectAllLevel] = useState(0); // Track selection level for progressive Shift+A
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode); // cards, list, or columns view
  // Selection level: "card" (default), "column" (column header selected), "board" (entire board selected)
  const [selectionLevel, setSelectionLevel] = useState<"board" | "column" | "card">("card");

  // Navigation history for [ and ] keys (separate from zoom stack which is physical parent chain)
  // Each entry stores the root ID and cursor position at that view
  const [navHistory, setNavHistory] = useState<
    Array<{ rootId: string | null; colIndex: number; cardIndex: number }>
  >([{ rootId: initialState.rootId, colIndex: 0, cardIndex: 0 }]);
  const [navHistoryIndex, setNavHistoryIndex] = useState(0); // Current position in history

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

  // Push a new entry to navigation history (truncating any forward history)
  const pushNavHistory = (
    rootId: string | null,
    colIndex: number,
    cardIndex: number,
  ) => {
    setNavHistory((prev) => {
      // Truncate forward history if we're not at the end
      const truncated = prev.slice(0, navHistoryIndex + 1);
      return [...truncated, { rootId, colIndex, cardIndex }];
    });
    setNavHistoryIndex((prev) => prev + 1);
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
    setSelectAllLevel(0);
  };

  // Get unique selected card indices from multi-selection
  const getSelectedCardIndices = (): number[] => {
    if (multiSelected.size === 0) return [];
    const indices = new Set<number>();
    for (const key of multiSelected) {
      const [colStr, cardStr] = key.split(":");
      const col = parseInt(colStr ?? "0", 10);
      const card = parseInt(cardStr ?? "0", 10);
      // Only include cards from the current column
      if (col === state.colIndex) {
        indices.add(card);
      }
    }
    return Array.from(indices).sort((a, b) => a - b);
  };

  // Move card within column (up/down)
  const moveCardInColumn = (card: CardState, direction: "up" | "down") => {
    const col = state.columns[state.colIndex];
    if (!col) return;

    // Get all selected card indices, or just the current one if no multi-selection
    const selectedIndices = getSelectedCardIndices();
    const cardsToMove =
      selectedIndices.length > 0
        ? selectedIndices.map((i) => ({ index: i, card: col.cards[i] }))
        : [{ index: state.cardIndex, card }];

    // Filter out any undefined cards
    const validCards = cardsToMove.filter(
      (c): c is { index: number; card: CardState } => c.card !== undefined,
    );
    if (validCards.length === 0) return;

    // For moving up, we need to move the topmost card first
    // For moving down, we need to move the bottommost card first
    const sortedCards =
      direction === "up"
        ? validCards.sort((a, b) => a.index - b.index)
        : validCards.sort((a, b) => b.index - a.index);

    // Check if we can move in this direction
    const firstToMove = sortedCards[0];
    if (!firstToMove) return;
    const targetIndex =
      direction === "up" ? firstToMove.index - 1 : firstToMove.index + 1;
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

    // Move each card
    for (const { index: currentIndex, card: cardToMove } of sortedCards) {
      const cardTargetIndex =
        direction === "up" ? currentIndex - 1 : currentIndex + 1;

      if (cardTargetIndex < 0 || cardTargetIndex >= col.cards.length) continue;

      let newSortOrder: number;
      if (direction === "up") {
        if (cardTargetIndex === 0) {
          // Moving to first position: go before the current first card
          const firstOrder = getEffectiveSortOrder(0);
          newSortOrder = firstOrder - 1;
        } else {
          // Moving between two cards: use midpoint
          const prevOrder = getEffectiveSortOrder(cardTargetIndex - 1);
          const targetOrder = getEffectiveSortOrder(cardTargetIndex);
          newSortOrder = (prevOrder + targetOrder) / 2;
        }
      } else {
        if (cardTargetIndex >= col.cards.length - 1) {
          // Moving to last position: go after the current last card
          const lastOrder = getEffectiveSortOrder(col.cards.length - 1);
          newSortOrder = lastOrder + 1;
        } else {
          // Moving between two cards: use midpoint
          const targetOrder = getEffectiveSortOrder(cardTargetIndex);
          const nextOrder = getEffectiveSortOrder(cardTargetIndex + 1);
          newSortOrder = (targetOrder + nextOrder) / 2;
        }
      }

      // Update database - use direct SQL in memory mode, emit event in disk mode
      if (isMemoryMode()) {
        const db = getDb();
        db.run(
          "UPDATE nodes SET parent_id = ?, parent_idx = ?, updated_at = ? WHERE id = ?",
          [col.node.id, newSortOrder, Date.now(), cardToMove.node.id],
        );
      } else {
        emit({
          type: "node_moved",
          actor: "user",
          target: cardToMove.node.id,
          data: {
            parent_id: col.node.id,
            parent_idx: newSortOrder,
          },
        });
      }
    }

    // Track moved card IDs to re-select after state rebuild
    const movedCardIds = validCards.map((c) => c.card.node.id);

    // Update local state: move the focused card index
    const newCardIndex =
      direction === "up" ? state.cardIndex - 1 : state.cardIndex + 1;
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

        // Re-select moved cards in their new positions
        if (movedCardIds.length > 1) {
          const newSelected = new Set<SelectionKey>();
          const col = newState.columns[state.colIndex];
          if (col) {
            for (let cardIdx = 0; cardIdx < col.cards.length; cardIdx++) {
              const c = col.cards[cardIdx];
              if (c && movedCardIds.includes(c.node.id)) {
                newSelected.add(makeSelectionKey(state.colIndex, cardIdx, 0));
              }
            }
          }
          setMultiSelected(newSelected);
        }
      }
    }, 50);
  };

  // Move card to different column (left/right)
  const moveCardToColumn = (card: CardState, direction: "left" | "right") => {
    const col = state.columns[state.colIndex];
    if (!col) return;

    const targetColIndex =
      direction === "left" ? state.colIndex - 1 : state.colIndex + 1;
    if (targetColIndex < 0 || targetColIndex >= state.columns.length) return;

    const targetCol = state.columns[targetColIndex];
    if (!targetCol) return;

    // Get all selected card indices, or just the current one if no multi-selection
    const selectedIndices = getSelectedCardIndices();
    const cardsToMove: CardState[] =
      selectedIndices.length > 0
        ? selectedIndices
            .map((i) => col.cards[i])
            .filter((c): c is CardState => c !== undefined)
        : [card];

    if (cardsToMove.length === 0) return;

    // Calculate sort order (add at end of target column)
    let newSortOrder =
      targetCol.cards.length > 0
        ? (targetCol.cards[targetCol.cards.length - 1]?.node.parent_idx ?? 0) +
          1
        : 0;

    // Move each card, incrementing sort order
    for (const cardToMove of cardsToMove) {
      // Update database - use direct SQL in memory mode, emit event in disk mode
      if (isMemoryMode()) {
        const db = getDb();
        db.run(
          "UPDATE nodes SET parent_id = ?, parent_idx = ?, updated_at = ? WHERE id = ?",
          [targetCol.node.id, newSortOrder, Date.now(), cardToMove.node.id],
        );
      } else {
        emit({
          type: "node_moved",
          actor: "user",
          target: cardToMove.node.id,
          data: {
            parent_id: targetCol.node.id,
            parent_idx: newSortOrder,
          },
        });
      }
      newSortOrder++;
    }

    // Track moved card IDs to re-select after state rebuild
    const movedCardIds = cardsToMove.map((c) => c.node.id);

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

        // Re-select moved cards in their new positions
        if (movedCardIds.length > 0) {
          const newSelected = new Set<SelectionKey>();
          const col = newState.columns[targetColIndex];
          if (col) {
            for (let cardIdx = 0; cardIdx < col.cards.length; cardIdx++) {
              const c = col.cards[cardIdx];
              if (c && movedCardIds.includes(c.node.id)) {
                newSelected.add(makeSelectionKey(targetColIndex, cardIdx, 0));
              }
            }
          }
          setMultiSelected(newSelected);
        }
      }
    }, 50);
  };

  // Move card to a specific column by index (for Opt+1-9)
  const moveCardToColumnByIndex = (card: CardState, targetColIndex: number) => {
    const col = state.columns[state.colIndex];
    if (!col) return;

    if (targetColIndex < 0 || targetColIndex >= state.columns.length) return;
    if (targetColIndex === state.colIndex) return; // Already in this column

    const targetCol = state.columns[targetColIndex];
    if (!targetCol) return;

    // Get all selected card indices, or just the current one if no multi-selection
    const selectedIndices = getSelectedCardIndices();
    const cardsToMove: CardState[] =
      selectedIndices.length > 0
        ? selectedIndices
            .map((i) => col.cards[i])
            .filter((c): c is CardState => c !== undefined)
        : [card];

    if (cardsToMove.length === 0) return;

    // Calculate sort order - add at TOP of target column (before first card)
    let newSortOrder =
      targetCol.cards.length > 0
        ? (targetCol.cards[0]?.node.parent_idx ?? 0) - cardsToMove.length
        : 0;

    // Move each card, incrementing sort order to keep order
    for (const cardToMove of cardsToMove) {
      // Update database - use direct SQL in memory mode, emit event in disk mode
      if (isMemoryMode()) {
        const db = getDb();
        db.run(
          "UPDATE nodes SET parent_id = ?, parent_idx = ?, updated_at = ? WHERE id = ?",
          [targetCol.node.id, newSortOrder, Date.now(), cardToMove.node.id],
        );
      } else {
        emit({
          type: "node_moved",
          actor: "user",
          target: cardToMove.node.id,
          data: {
            parent_id: targetCol.node.id,
            parent_idx: newSortOrder,
          },
        });
      }
      newSortOrder++;
    }

    // Track moved card IDs to re-select after state rebuild
    const movedCardIds = cardsToMove.map((c) => c.node.id);

    // Stay in current column and select the next card that took this spot
    // (or the previous card if we were at the end)
    const newCardIndex = Math.min(
      state.cardIndex,
      Math.max(0, col.cards.length - cardsToMove.length - 1),
    );

    // Rebuild board state
    setTimeout(() => {
      const newState = state.rootId
        ? buildBoardState(state.rootId)
        : initBoardState();

      if (newState) {
        newState.zoomStack = state.zoomStack;
        newState.rootPath = state.rootPath;
        newState.colIndex = state.colIndex; // Stay in same column
        newState.cardIndex = Math.min(
          newCardIndex,
          Math.max(
            0,
            (newState.columns[state.colIndex]?.cards.length ?? 1) - 1,
          ),
        );
        setState(newState);

        // Re-select moved cards in their new positions (target column)
        if (movedCardIds.length > 0) {
          const newSelected = new Set<SelectionKey>();
          const targetColumnState = newState.columns[targetColIndex];
          if (targetColumnState) {
            for (
              let cardIdx = 0;
              cardIdx < targetColumnState.cards.length;
              cardIdx++
            ) {
              const c = targetColumnState.cards[cardIdx];
              if (c && movedCardIds.includes(c.node.id)) {
                newSelected.add(makeSelectionKey(targetColIndex, cardIdx, 0));
              }
            }
          }
          setMultiSelected(newSelected);
        }
      }
    }, 50);
  };

  // Indent node: make it a child of the sibling above it
  const indentNode = (card: CardState) => {
    const col = state.columns[state.colIndex];
    if (!col) return;

    const cardIndex = col.cards.findIndex((c) => c.node.id === card.node.id);
    if (cardIndex <= 0) {
      // Can't indent first item - no sibling above
      process.stdout.write("\x07"); // Beep
      return;
    }

    // Get the sibling above this card
    const siblingAbove = col.cards[cardIndex - 1];
    if (!siblingAbove) return;

    // Make this card a child of the sibling above
    // Use timestamp-based ordering for new child
    const newSortOrder = Date.now();

    if (isMemoryMode()) {
      const db = getDb();
      db.run(
        "UPDATE nodes SET parent_id = ?, parent_idx = ?, updated_at = ? WHERE id = ?",
        [siblingAbove.node.id, newSortOrder, Date.now(), card.node.id],
      );
    } else {
      emit({
        type: "node_moved",
        actor: "user",
        target: card.node.id,
        data: {
          parent_id: siblingAbove.node.id,
          parent_idx: newSortOrder,
        },
      });
    }

    // Rebuild board state
    setTimeout(() => {
      const newState = state.rootId
        ? buildBoardState(state.rootId)
        : initBoardState();

      if (newState) {
        newState.zoomStack = state.zoomStack;
        newState.rootPath = state.rootPath;
        newState.colIndex = state.colIndex;
        // Stay at same card index (will now point to different card)
        newState.cardIndex = Math.max(0, cardIndex - 1);
        setState(newState);
      }
    }, 50);
  };

  // Outdent node: make it a sibling of its parent
  const outdentNode = (card: CardState) => {
    const parentId = card.node.parent_id;
    if (!parentId) {
      // Can't outdent root-level item
      process.stdout.write("\x07"); // Beep
      return;
    }

    const parent = getNode(parentId);
    if (!parent || !parent.parent_id) {
      // Can't outdent if parent has no parent
      process.stdout.write("\x07"); // Beep
      return;
    }

    // Get parent's siblings to calculate sort order
    const grandparentChildren = getChildren(parent.parent_id);
    const parentIndex = grandparentChildren.findIndex((c) => c.id === parentId);

    // Insert after the parent, before next sibling
    let newSortOrder: number;
    if (parentIndex === grandparentChildren.length - 1) {
      // Parent is last child - add after it
      newSortOrder = parent.parent_idx + 1;
    } else {
      // Insert between parent and next sibling
      const nextSibling = grandparentChildren[parentIndex + 1];
      newSortOrder =
        (parent.parent_idx +
          (nextSibling?.parent_idx ?? parent.parent_idx + 2)) /
        2;
    }

    // Move card to be sibling of parent (child of grandparent)
    if (isMemoryMode()) {
      const db = getDb();
      db.run(
        "UPDATE nodes SET parent_id = ?, parent_idx = ?, updated_at = ? WHERE id = ?",
        [parent.parent_id, newSortOrder, Date.now(), card.node.id],
      );
    } else {
      emit({
        type: "node_moved",
        actor: "user",
        target: card.node.id,
        data: {
          parent_id: parent.parent_id,
          parent_idx: newSortOrder,
        },
      });
    }

    // Rebuild board state
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
  };

  // Progressive select all with Shift+A
  const progressiveSelectAll = () => {
    const col = state.columns[state.colIndex];
    const card = col?.cards[state.cardIndex];

    // Determine current selection level based on what's already selected
    const currentLevel = selectAllLevel;

    // Level 0: Select all sub-items in current card (if in outline mode)
    // Level 1: Select all cards in current column
    // Level 2: Select all cards in all columns (entire board)
    if (currentLevel === 0 && inOutlineMode && card) {
      // Select all sub-items in current card
      const newSelected = new Set<SelectionKey>();
      const maxItems =
        1 + countVisibleDescendants(card.node, 0, maxOutlineDepth, foldedNodes);
      for (let s = 0; s < maxItems; s++) {
        newSelected.add(makeSelectionKey(state.colIndex, state.cardIndex, s));
      }
      setMultiSelected(newSelected);
      setSelectAllLevel(1);
    } else if (currentLevel <= 1 && col) {
      // Select all cards in current column
      const newSelected = new Set<SelectionKey>();
      for (let cardIdx = 0; cardIdx < col.cards.length; cardIdx++) {
        const c = col.cards[cardIdx];
        if (c) {
          const maxItems =
            1 +
            countVisibleDescendants(c.node, 0, maxOutlineDepth, foldedNodes);
          for (let s = 0; s < maxItems; s++) {
            newSelected.add(makeSelectionKey(state.colIndex, cardIdx, s));
          }
        }
      }
      setMultiSelected(newSelected);
      setSelectAllLevel(2);
    } else {
      // Select all cards in all columns
      const newSelected = new Set<SelectionKey>();
      for (let colIdx = 0; colIdx < state.columns.length; colIdx++) {
        const column = state.columns[colIdx];
        if (column) {
          for (let cardIdx = 0; cardIdx < column.cards.length; cardIdx++) {
            const c = column.cards[cardIdx];
            if (c) {
              const maxItems =
                1 +
                countVisibleDescendants(
                  c.node,
                  0,
                  maxOutlineDepth,
                  foldedNodes,
                );
              for (let s = 0; s < maxItems; s++) {
                newSelected.add(makeSelectionKey(colIdx, cardIdx, s));
              }
            }
          }
        }
      }
      setMultiSelected(newSelected);
      setSelectAllLevel(0); // Wrap around
    }
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

    // Cycle view mode with 'v': cards -> columns -> list -> cards
    if (input === "v") {
      setViewMode((prev) => {
        switch (prev) {
          case "cards":
            return "columns";
          case "columns":
            return "list";
          case "list":
            return "cards";
          default:
            return "cards";
        }
      });
      return;
    }

    // Shift+A: progressive select all
    if (input === "A") {
      progressiveSelectAll();
      return;
    }

    // Shift+1-9: jump cursor to column (0-indexed, so Shift+1 = column 0)
    // Terminal sends !@#$%^&*( for Shift+1-9
    const shiftNumberMap: Record<string, number> = {
      "!": 0,
      "@": 1,
      "#": 2,
      $: 3,
      "%": 4,
      "^": 5,
      "&": 6,
      "*": 7,
      "(": 8,
    };
    const shiftColIndex = shiftNumberMap[input];
    if (
      shiftColIndex !== undefined &&
      !showDetailPane &&
      !inOutlineMode &&
      shiftColIndex < state.columns.length
    ) {
      setState((s) => ({
        ...s,
        colIndex: shiftColIndex,
        cardIndex: Math.min(
          s.cardIndex,
          Math.max(0, (s.columns[shiftColIndex]?.cards.length ?? 1) - 1),
        ),
      }));
      clearSelection();
      setSelectAllLevel(0); // Reset select all level when moving
      return;
    }

    // Plain 1-9: jump to favorite boards
    // Note: Alt+1-9 for moving is handled below with key.meta check
    if (
      /^[1-9]$/.test(input) &&
      !showDetailPane &&
      !inOutlineMode &&
      !key.meta // Not Alt+number (move)
    ) {
      const favoriteRef = DEFAULT_FAVORITES[input];
      if (favoriteRef) {
        const resolved = resolveNode(favoriteRef);
        if (resolved) {
          const zoomed = buildBoardState(resolved.id);
          zoomed.zoomStack = [...state.zoomStack, state.rootId || ""];
          // Push current location to navigation history before navigating
          pushNavHistory(state.rootId, state.colIndex, state.cardIndex);
          setInOutlineMode(false);
          setSubIndex(0);
          clearSelection();
          setShowDetailPane(false);
          setState(zoomed);
        } else {
          // Favorite not found - beep
          process.stdout.write("\x07");
        }
      }
      return;
    }

    // Quit
    if (input === "q") {
      exit();
      return;
    }

    // Alt/Opt + key for moving items (standardized modifier)
    if (key.meta && card) {
      // Alt+Arrow: move card
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
      // Alt+hjkl: move card (vim style)
      if (input === "k") {
        moveCardInColumn(card, "up");
        return;
      }
      if (input === "j") {
        moveCardInColumn(card, "down");
        return;
      }
      if (input === "h") {
        moveCardToColumn(card, "left");
        return;
      }
      if (input === "l") {
        moveCardToColumn(card, "right");
        return;
      }
      // Alt+1-9: move card to column (at top)
      if (/^[1-9]$/.test(input) && !showDetailPane) {
        const targetCol = parseInt(input, 10) - 1;
        if (targetCol < state.columns.length) {
          moveCardToColumnByIndex(card, targetCol);
        }
        return;
      }
    }

    // Escape: close UI elements progressively, then quit
    if (key.escape) {
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
      // Otherwise quit
      exit();
      return;
    }

    // 'u': Go up the physical path (parent of current root)
    if (input === "u") {
      if (showDetailPane) {
        setShowDetailPane(false);
        return;
      }
      if (inOutlineMode) {
        setInOutlineMode(false);
        setSubIndex(0);
        clearSelection();
        return;
      }

      // Go up to parent of current root
      if (state.rootId) {
        const currentRoot = getNode(state.rootId);
        if (currentRoot?.parent_id) {
          const parentNode = getNode(currentRoot.parent_id);
          if (parentNode) {
            const zoomed = buildBoardState(parentNode.id);
            // Push current location to history before navigating
            pushNavHistory(state.rootId, state.colIndex, state.cardIndex);
            setState(zoomed);
            clearSelection();
            return;
          }
        }
      }
      // No parent - beep
      process.stdout.write("\x07");
      return;
    }

    // '[': Navigate back in history
    if (input === "[") {
      if (navHistoryIndex > 0) {
        const prevEntry = navHistory[navHistoryIndex - 1];
        if (prevEntry) {
          const newState = prevEntry.rootId
            ? buildBoardState(prevEntry.rootId)
            : initBoardState();
          if (newState) {
            newState.colIndex = prevEntry.colIndex;
            newState.cardIndex = prevEntry.cardIndex;
            setState(newState);
            setNavHistoryIndex(navHistoryIndex - 1);
            clearSelection();
            setInOutlineMode(false);
            setSubIndex(0);
          }
        }
      } else {
        // No history to go back to - beep
        process.stdout.write("\x07");
      }
      return;
    }

    // ']': Navigate forward in history
    if (input === "]") {
      if (navHistoryIndex < navHistory.length - 1) {
        const nextEntry = navHistory[navHistoryIndex + 1];
        if (nextEntry) {
          const newState = nextEntry.rootId
            ? buildBoardState(nextEntry.rootId)
            : initBoardState();
          if (newState) {
            newState.colIndex = nextEntry.colIndex;
            newState.cardIndex = nextEntry.cardIndex;
            setState(newState);
            setNavHistoryIndex(navHistoryIndex + 1);
            clearSelection();
            setInOutlineMode(false);
            setSubIndex(0);
          }
        }
      } else {
        // No forward history - beep
        process.stdout.write("\x07");
      }
      return;
    }

    // Tab/Shift-Tab: indent/outdent items structurally
    if (key.tab && card) {
      if (key.shift) {
        // Shift-Tab: outdent - make item a sibling of its parent
        outdentNode(card);
      } else {
        // Tab: indent - make item a child of the item above
        indentNode(card);
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

    // Status cycling with Space key (works on selected card/item)
    // For symlinked nodes (transclusions), apply status change to the TARGET node
    if (input === " " && card) {
      // Resolve symlink target: if this is a symlink, operate on the target
      const targetId = card.node.symlink_to || card.node.id;
      const targetNode = card.node.symlink_to
        ? getNode(card.node.symlink_to)
        : card.node;
      const currentStatus = targetNode?.task_status || "open";
      const statusCycle: TaskStatus[] = ["open", "blocked", "done", "dropped"];
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
        target: targetId,
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

    // Vertical navigation with selection levels: board -> column -> card
    if (input === "j" || key.downArrow) {
      clearSelection();
      // Handle selection level transitions
      if (selectionLevel === "board") {
        // From board level, go to column level (first column)
        setSelectionLevel("column");
        setState((s) => ({ ...s, colIndex: 0 }));
        return;
      }
      if (selectionLevel === "column") {
        // From column level, go to card level (first card in column)
        setSelectionLevel("card");
        setState((s) => ({ ...s, cardIndex: 0 }));
        return;
      }
      // At card level
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
      // Handle selection level transitions
      if (selectionLevel === "card") {
        if (inOutlineMode) {
          // In outline mode: navigate within card, then to previous card, then to column
          if (subIndex > 0) {
            setSubIndex(subIndex - 1);
            return;
          } else if (state.cardIndex > 0) {
            // Move to previous card's last item
            const prevCardIndex = state.cardIndex - 1;
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
            return;
          } else {
            // At first card, first item - go to column level
            setSelectionLevel("column");
            setSubIndex(0);
            return;
          }
        } else {
          // Not in outline mode
          if (state.cardIndex > 0) {
            // Move to previous card
            setState((s) => ({ ...s, cardIndex: s.cardIndex - 1 }));
          } else {
            // At first card - go to column level
            setSelectionLevel("column");
          }
          return;
        }
      }
      if (selectionLevel === "column") {
        // From column level, go to board level
        setSelectionLevel("board");
        return;
      }
      // Already at board level, do nothing (or beep)
      return;
    }

    setState((s) => {
      const newState = { ...s };

      // Helper to find card at same vertical position in target column
      // Uses the same absolute index, clamped to the target column's length
      const findSamePositionCard = (
        targetColIndex: number,
        currentCardIndex: number,
      ): number => {
        const targetCol = s.columns[targetColIndex];
        if (!targetCol || targetCol.cards.length === 0) return 0;
        // Keep the same index, or the last card if target column is shorter
        return Math.min(currentCardIndex, targetCol.cards.length - 1);
      };

      // Horizontal navigation - behavior depends on selection level
      if (input === "h" || key.leftArrow) {
        if (selectionLevel === "board") {
          // At board level, h/l does nothing (could navigate between boards in future)
          return s;
        }
        const newColIndex = Math.max(0, s.colIndex - 1);
        newState.colIndex = newColIndex;
        if (selectionLevel === "card") {
          // At card level, also update card index to same position in new column
          newState.cardIndex = findSamePositionCard(newColIndex, s.cardIndex);
        }
        // Stay at current selection level (column or card)
        setInOutlineMode(false);
        setSubIndex(0);
        clearSelection();
      } else if (input === "l" || key.rightArrow) {
        if (selectionLevel === "board") {
          // At board level, h/l does nothing
          return s;
        }
        const newColIndex = Math.min(s.columns.length - 1, s.colIndex + 1);
        newState.colIndex = newColIndex;
        if (selectionLevel === "card") {
          // At card level, also update card index to same position in new column
          newState.cardIndex = findSamePositionCard(newColIndex, s.cardIndex);
        }
        // Stay at current selection level (column or card)
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

      // Zoom in with 'o' - re-root at grandparent for context, select the item
      // For transcluded/symlinked items, follow the link to the original
      if (input === "o" && card) {
        const targetId = card.node.symlink_to || card.node.id;
        const targetNode = getNode(targetId);
        if (!targetNode) return s;

        // Find the best root: grandparent > parent > item itself
        // This gives context by showing siblings
        let rootId = targetId;
        const parentNode = targetNode.parent_id
          ? getNode(targetNode.parent_id)
          : null;
        const grandparentNode = parentNode?.parent_id
          ? getNode(parentNode.parent_id)
          : null;

        if (grandparentNode) {
          rootId = grandparentNode.id;
        } else if (parentNode) {
          rootId = parentNode.id;
        }

        const zoomed = buildBoardState(rootId);
        zoomed.zoomStack = [...s.zoomStack, s.rootId || ""];

        // Find the target item in the new board state to select it
        let foundCol = 0;
        let foundCard = 0;
        for (let cIdx = 0; cIdx < zoomed.columns.length; cIdx++) {
          const col = zoomed.columns[cIdx];
          if (!col) continue;
          for (let cardIdx = 0; cardIdx < col.cards.length; cardIdx++) {
            const c = col.cards[cardIdx];
            if (c && c.node.id === targetId) {
              foundCol = cIdx;
              foundCard = cardIdx;
              break;
            }
          }
        }
        zoomed.colIndex = foundCol;
        zoomed.cardIndex = foundCard;

        // Push current location to navigation history before navigating
        pushNavHistory(s.rootId, s.colIndex, s.cardIndex);

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

      // Status cycling in detail pane with Space key
      // For symlinked nodes (transclusions), apply status change to the TARGET node
      // This ensures the original task is updated, not just the symlink
      if (input === " ") {
        const card = state.columns[state.colIndex]?.cards[state.cardIndex];
        if (card) {
          // Resolve symlink target: if this is a symlink, operate on the target
          const targetId = card.node.symlink_to || card.node.id;
          const targetNode = card.node.symlink_to
            ? getNode(card.node.symlink_to)
            : card.node;
          const currentStatus = targetNode?.task_status || "open";
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
            target: targetId, // Target the original node, not the symlink
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
      // For symlinked nodes (transclusions), apply priority change to the TARGET node
      if (["1", "2", "3", "4", "5"].includes(input)) {
        const card = state.columns[state.colIndex]?.cards[state.cardIndex];
        if (card) {
          // Resolve symlink target: if this is a symlink, operate on the target
          const targetId = card.node.symlink_to || card.node.id;

          emit({
            type: "node_updated",
            actor: "user",
            target: targetId, // Target the original node, not the symlink
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
  // For symlinked nodes (transclusions), re-parent the TARGET node, not the symlink
  // This moves the original task to the new project
  const handleProjectSelect = (targetNode: Node) => {
    const card = state.columns[state.colIndex]?.cards[state.cardIndex];
    if (!card) {
      setShowProjectPicker(false);
      return;
    }

    // Resolve symlink target: if this is a symlink, operate on the target
    const nodeToMove = card.node.symlink_to || card.node.id;

    // Calculate sort order (add at end of target)
    const targetChildren = getChildren(targetNode.id);
    const lastChild = targetChildren[targetChildren.length - 1];
    const newSortOrder = lastChild ? lastChild.parent_idx + 1 : 0;

    // Update database - use direct SQL in memory mode, emit event in disk mode
    if (isMemoryMode()) {
      const db = getDb();
      db.run(
        "UPDATE nodes SET parent_id = ?, parent_idx = ?, updated_at = ? WHERE id = ?",
        [targetNode.id, newSortOrder, Date.now(), nodeToMove],
      );
    } else {
      emit({
        type: "node_moved",
        actor: "user",
        target: nodeToMove, // Target the original node, not the symlink
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

  // Build selected item path segments for colorized top bar
  // Shows full path from filesystem root to selected item based on selection level
  const selectedCol = state.columns[state.colIndex];
  const selectedCard = selectedCol?.cards[state.cardIndex];

  // Determine which node to show path to based on selection level
  const selectedPathSegments = (() => {
    if (selectionLevel === "board" || !selectedCol) {
      // At board level or no column - show path to board root
      return getPathSegments(state.rootId, state.rootId);
    } else if (selectionLevel === "column") {
      // At column level - show path to selected column
      return truncatePathSegments(
        getPathSegments(selectedCol.node.id, state.rootId),
        termWidth - 4,
      );
    } else if (selectedCard) {
      // At card level with a card selected - show path to card
      return truncatePathSegments(
        getPathSegments(selectedCard.node.id, state.rootId),
        termWidth - 4,
      );
    } else {
      // At card level but no card (empty column) - show path to column
      return truncatePathSegments(
        getPathSegments(selectedCol.node.id, state.rootId),
        termWidth - 4,
      );
    }
  })();

  // Calculate widths for split view
  const detailPaneWidth = showDetailPane ? Math.floor(termWidth * 0.4) : 0;
  const boardWidth = termWidth - detailPaneWidth;

  // Recalculate columns when detail pane is shown
  const effectiveMaxCols = showDetailPane
    ? Math.min(state.columns.length, Math.max(1, Math.floor(boardWidth / 35)))
    : maxCols;
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

  // Build top bar with consistent white background, bold black text
  // Make the separator at board boundary stand out with blue color
  // When at board/column level, highlight the selected segment with blue background
  const topBarContent = selectedPathSegments
    .map((seg, i) => {
      // Check if this is the boundary between board path and item path
      const prevSeg = i > 0 ? selectedPathSegments[i - 1] : null;
      const isBoardBoundary = prevSeg && !prevSeg.isWithinBoard && seg.isWithinBoard;
      const isLastSegment = i === selectedPathSegments.length - 1;
      // At board level, highlight non-within-board segments (the board path itself)
      const isBoardSelected = selectionLevel === "board" && !seg.isWithinBoard;
      // At column level, highlight the last segment (the column)
      const isColumnSelected = selectionLevel === "column" && isLastSegment;
      // Use blue for the boundary separator to make it stand out
      const sepPart = seg.sep
        ? isBoardBoundary
          ? chalk.bgWhite.blue.bold(` ${seg.sep} `)
          : chalk.bgWhite.gray(` ${seg.sep} `)
        : "";
      const namePart = (isBoardSelected || isColumnSelected)
        ? chalk.bgBlue.white.bold(seg.name)
        : chalk.bgWhite.black.bold(seg.name);
      return sepPart + namePart;
    })
    .join("");
  // Calculate visible length (without ANSI codes)
  const visibleLen =
    1 +
    selectedPathSegments.reduce(
      (acc, seg) => acc + seg.name.length + (seg.sep ? seg.sep.length + 2 : 0),
      0,
    );
  const padding = " ".repeat(Math.max(0, termWidth - visibleLen));

  return (
    <Box flexDirection="column" height={termHeight} minHeight={3}>
      {/* Top bar: full path from root to selected item, inverted full width */}
      <Box height={1} width={termWidth}>
        <Text>
          {chalk.bgWhite.black(" ") + topBarContent + chalk.bgWhite(padding)}
        </Text>
      </Box>
      <Box flexGrow={1} flexDirection="row" height={termHeight - 2}>
        {/* Cards, Columns, or List view */}
        {viewMode === "cards" ? (
          <Box flexDirection="row" width={boardWidth} height={termHeight - 2}>
            {/* Left scroll indicator - full height filled bar */}
            {effectiveScrollOffset > 0 && (
              <Box flexDirection="column" width={1} height={termHeight - 3}>
                {Array.from({ length: termHeight - 3 }).map((_, i) => (
                  <Text key={i} backgroundColor="gray" color="white">
                    {i === Math.floor((termHeight - 3) / 2) ? "‹" : " "}
                  </Text>
                ))}
              </Box>
            )}
            {effectiveVisibleColumns.map((col, i) => {
              const actualColIndex = effectiveScrollOffset + i;
              // Reduce column width if scroll indicators are shown
              const hasLeftIndicator = effectiveScrollOffset > 0;
              const hasRightIndicator =
                effectiveScrollOffset + effectiveMaxCols < state.columns.length;
              const indicatorWidth =
                (hasLeftIndicator ? 1 : 0) + (hasRightIndicator ? 1 : 0);
              const availableWidth = boardWidth - indicatorWidth;
              const baseColWidth = Math.floor(availableWidth / effectiveMaxCols);
              const remainder = availableWidth % effectiveMaxCols;
              // Distribute extra pixels to the first 'remainder' columns
              const adjustedColWidth = baseColWidth + (i < remainder ? 1 : 0);
              return (
                <Column
                  key={col.node.id}
                  column={col}
                  colIndex={actualColIndex}
                  isSelected={actualColIndex === state.colIndex}
                  isCollapsed={collapsedColumns.has(actualColIndex)}
                  selectedCardIndex={state.cardIndex}
                  selectedSubIndex={inOutlineMode ? subIndex : -1}
                  width={adjustedColWidth}
                  height={termHeight - 2}
                  maxOutlineDepth={maxOutlineDepth}
                  foldedNodes={foldedNodes}
                  onToggleFold={toggleFold}
                  multiSelected={multiSelected}
                  selectionLevel={selectionLevel}
                />
              );
            })}
            {/* Right scroll indicator - full height filled bar */}
            {effectiveScrollOffset + effectiveMaxCols <
              state.columns.length && (
              <Box flexDirection="column" width={1} height={termHeight - 3}>
                {Array.from({ length: termHeight - 3 }).map((_, i) => (
                  <Text key={i} backgroundColor="gray" color="white">
                    {i === Math.floor((termHeight - 3) / 2) ? "›" : " "}
                  </Text>
                ))}
              </Box>
            )}
          </Box>
        ) : viewMode === "columns" ? (
          <ColumnsView
            state={state}
            width={boardWidth}
            height={termHeight - 2}
            foldedNodes={foldedNodes}
            maxOutlineDepth={maxOutlineDepth}
            multiSelected={multiSelected}
            colIndex={state.colIndex}
            cardIndex={state.cardIndex}
            subIndex={subIndex}
            inOutlineMode={inOutlineMode}
            effectiveScrollOffset={effectiveScrollOffset}
            effectiveMaxCols={effectiveMaxCols}
            effectiveVisibleColumns={effectiveVisibleColumns}
            selectionLevel={selectionLevel}
          />
        ) : (
          <TreeView
            state={state}
            width={boardWidth}
            height={termHeight - 2}
            foldedNodes={foldedNodes}
            maxOutlineDepth={maxOutlineDepth}
            multiSelected={multiSelected}
            colIndex={state.colIndex}
            cardIndex={state.cardIndex}
            subIndex={subIndex}
            inOutlineMode={inOutlineMode}
            selectionLevel={selectionLevel}
          />
        )}
        {/* Detail pane */}
        {showDetailPane && selectedCard && (
          <DetailPane
            node={selectedCard.node}
            width={detailPaneWidth}
            height={termHeight - 2}
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
      {/* Bottom bar: indicators right-aligned */}
      <Box width={termWidth} justifyContent="flex-end" paddingX={1}>
        <Text>
          {showHelp && <Text color="cyan">{`[HELP ?] `}</Text>}
          {showProjectPicker && <Text color="green">{`[PROJECT] `}</Text>}
          {showDropNotification && droppedFiles.length > 0 && (
            <Text color="green">
              {`[Dropped: ${droppedFiles.map((f) => getFileInfo(f).name).join(", ")}] `}
            </Text>
          )}
          {isMouseDragging && mouseSelection && (
            <Text color="blue">{`[Select: ${mouseSelection.startY}-${mouseSelection.endY}] `}</Text>
          )}
          {multiSelected.size > 0 && (
            <Text color="yellow">{`[${multiSelected.size} sel] `}</Text>
          )}
          {inOutlineMode && <Text color="cyan">{`OUTLINE `}</Text>}
          {selectionLevel !== "card" && (
            <Text color="magenta">{`${selectionLevel.toUpperCase()} `}</Text>
          )}
          <Text inverse>{` ${viewMode.toUpperCase()} `}</Text>
        </Text>
      </Box>
    </Box>
  );
}

export function renderInkBoard(
  state: BoardState,
  initialViewMode?: ViewMode,
): void {
  void withFullScreen(
    <Board initialState={state} initialViewMode={initialViewMode} />,
    {
      exitOnCtrlC: true,
      patchConsole: true,
    },
  ).start();
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

  const selectedCol = initialState.columns[initialState.colIndex];
  const selectedCard = selectedCol?.cards[initialState.cardIndex];
  const selectedPathSegments = selectedCard
    ? truncatePathSegments(
        getPathSegments(selectedCard.node.id, initialState.rootId),
        termWidth - 4,
      )
    : getPathSegments(initialState.rootId, initialState.rootId);

  // Build top bar with consistent white background, varying foreground colors
  const testTopBarContent = selectedPathSegments
    .map((seg) => {
      const sepPart = seg.sep ? chalk.bgWhite.gray(` ${seg.sep} `) : "";
      const namePart = seg.isWithinBoard
        ? chalk.bgWhite.blue(seg.name)
        : chalk.bgWhite.black(seg.name);
      return sepPart + namePart;
    })
    .join("");
  const testVisibleLen =
    1 +
    selectedPathSegments.reduce(
      (acc, seg) => acc + seg.name.length + (seg.sep ? seg.sep.length + 2 : 0),
      0,
    );
  const testPadding = " ".repeat(Math.max(0, termWidth - testVisibleLen));

  return (
    <Box flexDirection="column" height={termHeight} minHeight={3}>
      {/* Top bar: full path */}
      <Box height={1} width={termWidth}>
        <Text>
          {chalk.bgWhite.black(" ") +
            testTopBarContent +
            chalk.bgWhite(testPadding)}
        </Text>
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
              height={termHeight - 2}
              maxOutlineDepth={maxOutlineDepth}
              foldedNodes={foldedNodes}
              onToggleFold={toggleFold}
              multiSelected={multiSelected}
              selectionLevel="card"
            />
          );
        })}
      </Box>
      {/* Bottom bar: indicators right-aligned */}
      <Box width={termWidth} justifyContent="flex-end" paddingX={1}>
        <Text>
          {initialState.columns.length > maxCols && (
            <Text dimColor>
              {`[cols ${colScrollOffset + 1}-${colScrollOffset + maxCols}/${initialState.columns.length}] `}
            </Text>
          )}
          <Text inverse>{" BOARD "}</Text>
        </Text>
      </Box>
    </Box>
  );
}
