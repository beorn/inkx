/**
 * Board Command - Boardliner TUI View
 *
 * A kanban-style board view where:
 * - The board root node defines the board
 * - Its children are columns
 * - Their children are cards
 * - Card children are shown as outlines inside cards
 *
 * Keybindings (vim/emacs style):
 * - h/l or C-b/C-f: Move between columns
 * - j/k or C-n/C-p: Move between cards in column
 * - Enter/o: Zoom into card (card becomes the board)
 * - Escape/q: Zoom out / quit
 * - Tab/S-Tab: Fold/unfold card content
 * - Space: Toggle selection
 * - v: Enter visual (multi-select) mode
 * - x: Mark done / cycle status
 * - 1-5: Set priority
 * - g/G: Go to first/last card
 * - H/L: Move card to prev/next column
 * - J/K: Move card up/down in column
 * - /: Search
 * - ?: Help
 */

import { Command } from "commander";
import chalk from "chalk";
import { getChildren, getNode } from "../../node/db.ts";
import { emit } from "../../node/emit.ts";
import type { Node, TaskStatus, TaskMark } from "../../node/types.ts";

// Board state
interface BoardState {
  rootId: string | null;
  columns: ColumnState[];
  colIndex: number;
  cardIndex: number;
  selectedCards: Set<string>;
  visualMode: boolean;
  foldedCards: Set<string>;
  searchQuery: string;
  searchMode: boolean;
  helpMode: boolean;
  zoomStack: string[]; // Stack of parent board IDs for zoom out
}

interface ColumnState {
  node: Node;
  cards: CardState[];
}

interface CardState {
  node: Node;
  children: Node[];
}

// Status cycle order
const STATUS_CYCLE: TaskStatus[] = [
  "open",
  "in_progress",
  "done",
  "blocked",
  "waiting",
  "cancelled",
];

// Task marks by status
const STATUS_MARKS: Record<TaskStatus, TaskMark> = {
  open: " ",
  in_progress: "/",
  done: "x",
  blocked: "-",
  waiting: "?",
  scheduled: "1",
  cancelled: "X",
};

export const boardCommand = new Command("board")
  .description("Display interactive boardliner TUI view")
  .argument("[root]", "Root node ID for board (default: find first board)")
  .option("--no-tui", "Non-interactive mode, just print board")
  .action(async (root, options) => {
    const state = initBoard(root);

    if (!state) {
      console.error(chalk.red("No board found. Create a board node first."));
      process.exit(1);
    }

    if (options.tui === false) {
      printBoardStatic(state);
      return;
    }

    await runBoardTUI(state);
  });

/**
 * Initialize board state from a root node
 */
function initBoard(rootId?: string): BoardState | null {
  let root: Node | null = null;

  if (rootId) {
    root = getNode(rootId);
    if (!root) {
      console.error(chalk.red(`Node not found: ${rootId}`));
      return null;
    }
  } else {
    // Find first board or folder with children
    const roots = getChildren(null);
    root = roots.find((n) => n.type === "board") ?? roots[0] ?? null;
    if (!root) {
      return null;
    }
  }

  return buildBoardState(root.id);
}

/**
 * Build board state from root ID
 */
function buildBoardState(rootId: string): BoardState {
  const columns: ColumnState[] = [];
  const columnNodes = getChildren(rootId);

  for (const colNode of columnNodes) {
    const cardNodes = getChildren(colNode.id);
    const cards: CardState[] = cardNodes.map((cardNode) => ({
      node: cardNode,
      children: getChildren(cardNode.id),
    }));
    columns.push({ node: colNode, cards });
  }

  return {
    rootId,
    columns,
    colIndex: 0,
    cardIndex: 0,
    selectedCards: new Set(),
    visualMode: false,
    foldedCards: new Set(),
    searchQuery: "",
    searchMode: false,
    helpMode: false,
    zoomStack: [],
  };
}

/**
 * Print static board (non-TUI mode)
 */
function printBoardStatic(state: BoardState): void {
  const { columns } = state;

  if (columns.length === 0) {
    console.log(chalk.dim("Empty board"));
    return;
  }

  // Calculate column width
  const termWidth = process.stdout.columns || 80;
  const colWidth = Math.max(20, Math.floor(termWidth / columns.length) - 2);

  // Print column headers
  const headers = columns.map((col) => {
    const name = getNodeName(col.node);
    const count = col.cards.length;
    const header = `${name} (${count})`;
    return header.padEnd(colWidth).slice(0, colWidth);
  });
  console.log(chalk.bold(headers.join("  ")));
  console.log(chalk.dim("─".repeat(termWidth)));

  // Find max cards in any column
  const maxCards = Math.max(...columns.map((c) => c.cards.length), 0);

  // Print cards row by row
  for (let i = 0; i < maxCards; i++) {
    const row = columns.map((col) => {
      const card = col.cards[i];
      if (!card) {
        return " ".repeat(colWidth);
      }
      return formatCardLine(card, colWidth);
    });
    console.log(row.join("  "));
  }
}

/**
 * Run interactive TUI
 */
async function runBoardTUI(state: BoardState): Promise<void> {
  const stdin = process.stdin;
  const stdout = process.stdout;

  // Check if we're in a TTY - if not, fall back to static mode
  if (!stdin.isTTY || !stdout.isTTY) {
    console.log(chalk.yellow("Not running in a TTY, using static mode"));
    printBoardStatic(state);
    return;
  }

  // Enable raw mode for keypress handling
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");

  // Hide cursor
  stdout.write("\x1B[?25l");

  // Handle terminal resize
  const handleResize = () => render();
  stdout.on("resize", handleResize);

  // Clear screen and render
  const render = () => {
    stdout.write("\x1B[2J\x1B[H"); // Clear screen, move to top
    renderBoard(state);
  };

  render();

  // Handle keypresses
  return new Promise<void>((resolve) => {
    const handleKey = (key: string) => {
      // Handle special keys
      if (key === "\x03") {
        // Ctrl+C
        cleanup();
        resolve();
        return;
      }

      if (state.helpMode) {
        state.helpMode = false;
        render();
        return;
      }

      if (state.searchMode) {
        handleSearchKey(state, key);
        render();
        return;
      }

      // Normal mode key handling
      const action = handleBoardKey(state, key);

      if (action === "quit") {
        cleanup();
        resolve();
        return;
      }

      if (action === "refresh" && state.rootId) {
        // Rebuild state from database
        const newState = buildBoardState(state.rootId);
        Object.assign(state, newState);
      }

      render();
    };

    const cleanup = () => {
      stdin.setRawMode(false);
      stdin.removeListener("data", handleKey);
      stdout.removeListener("resize", handleResize);
      stdout.write("\x1B[?25h"); // Show cursor
      stdout.write("\x1B[2J\x1B[H"); // Clear screen
    };

    stdin.on("data", handleKey);
  });
}

/**
 * Handle board keypress, returns action
 */
function handleBoardKey(
  state: BoardState,
  key: string
): "quit" | "refresh" | null {
  const { columns, colIndex, cardIndex } = state;
  const currentCol = columns[colIndex];
  const currentCard = currentCol?.cards[cardIndex];

  switch (key) {
    // Quit
    case "q":
    case "\x1B": // Escape
      if (state.zoomStack.length > 0) {
        // Zoom out
        const parentId = state.zoomStack.pop();
        if (parentId) {
          const newState = buildBoardState(parentId);
          newState.zoomStack = state.zoomStack;
          Object.assign(state, newState);
          return null;
        }
      }
      return "quit";

    // Help
    case "?":
      state.helpMode = true;
      return null;

    // Search
    case "/":
      state.searchMode = true;
      state.searchQuery = "";
      return null;

    // Navigation - left/right columns
    case "h":
    case "\x02": // Ctrl+B
      state.colIndex = Math.max(0, colIndex - 1);
      state.cardIndex = Math.min(
        state.cardIndex,
        (columns[state.colIndex]?.cards.length || 1) - 1
      );
      return null;

    case "l":
    case "\x06": // Ctrl+F
      state.colIndex = Math.min(columns.length - 1, colIndex + 1);
      state.cardIndex = Math.min(
        state.cardIndex,
        (columns[state.colIndex]?.cards.length || 1) - 1
      );
      return null;

    // Navigation - up/down cards
    case "k":
    case "\x10": // Ctrl+P
      if (currentCol) {
        state.cardIndex = Math.max(0, cardIndex - 1);
        if (state.visualMode && currentCard) {
          state.selectedCards.add(currentCol.cards[state.cardIndex]?.node.id);
        }
      }
      return null;

    case "j":
    case "\x0E": // Ctrl+N
      if (currentCol) {
        state.cardIndex = Math.min(currentCol.cards.length - 1, cardIndex + 1);
        if (state.visualMode && currentCard) {
          state.selectedCards.add(currentCol.cards[state.cardIndex]?.node.id);
        }
      }
      return null;

    // Jump to top/bottom
    case "g":
      state.cardIndex = 0;
      return null;

    case "G":
      if (currentCol) {
        state.cardIndex = Math.max(0, currentCol.cards.length - 1);
      }
      return null;

    // Zoom into card (Enter or o)
    case "\r": // Enter
    case "o":
      if (currentCard && currentCard.children.length > 0 && state.rootId) {
        state.zoomStack.push(state.rootId);
        const newState = buildBoardState(currentCard.node.id);
        newState.zoomStack = state.zoomStack;
        Object.assign(state, newState);
      }
      return null;

    // Fold/unfold
    case "\t": // Tab
      if (currentCard) {
        if (state.foldedCards.has(currentCard.node.id)) {
          state.foldedCards.delete(currentCard.node.id);
        } else {
          state.foldedCards.add(currentCard.node.id);
        }
      }
      return null;

    // Visual mode (multi-select)
    case "v":
      state.visualMode = !state.visualMode;
      if (state.visualMode && currentCard) {
        state.selectedCards.add(currentCard.node.id);
      } else {
        state.selectedCards.clear();
      }
      return null;

    // Toggle selection
    case " ":
      if (currentCard) {
        if (state.selectedCards.has(currentCard.node.id)) {
          state.selectedCards.delete(currentCard.node.id);
        } else {
          state.selectedCards.add(currentCard.node.id);
        }
      }
      return null;

    // Cycle status
    case "x":
      cycleStatus(state);
      return "refresh";

    // Priority 1-5
    case "1":
    case "2":
    case "3":
    case "4":
    case "5":
      setPriority(state, parseInt(key, 10));
      return "refresh";

    // Move card to previous column
    case "H":
      if (currentCard && colIndex > 0) {
        moveCardToColumn(state, colIndex - 1);
        return "refresh";
      }
      return null;

    // Move card to next column
    case "L":
      if (currentCard && colIndex < columns.length - 1) {
        moveCardToColumn(state, colIndex + 1);
        return "refresh";
      }
      return null;

    // Move card up in column
    case "K":
      if (currentCard && cardIndex > 0) {
        moveCardInColumn(state, cardIndex - 1);
        return "refresh";
      }
      return null;

    // Move card down in column
    case "J":
      if (currentCard && cardIndex < currentCol.cards.length - 1) {
        moveCardInColumn(state, cardIndex + 1);
        return "refresh";
      }
      return null;

    default:
      return null;
  }
}

/**
 * Handle search mode keypress
 */
function handleSearchKey(state: BoardState, key: string): void {
  if (key === "\x1B" || key === "\r") {
    // Escape or Enter exits search
    state.searchMode = false;
    // TODO: Jump to matching card
    return;
  }

  if (key === "\x7F") {
    // Backspace
    state.searchQuery = state.searchQuery.slice(0, -1);
    return;
  }

  if (key.length === 1 && key >= " ") {
    state.searchQuery += key;
  }
}

/**
 * Cycle task status for selected cards
 */
function cycleStatus(state: BoardState): void {
  const targets = getTargetCards(state);

  for (const card of targets) {
    const currentStatus = card.node.task_status || "open";
    const currentIndex = STATUS_CYCLE.indexOf(currentStatus);
    const nextIndex = (currentIndex + 1) % STATUS_CYCLE.length;
    const nextStatus = STATUS_CYCLE[nextIndex];
    const nextMark = STATUS_MARKS[nextStatus];

    emit({
      type: "node_updated",
      actor: "user",
      target: card.node.id,
      data: {
        task_status: nextStatus,
        task_mark: nextMark,
      },
    });
  }
}

/**
 * Set priority for selected cards
 */
function setPriority(state: BoardState, priority: number): void {
  const targets = getTargetCards(state);

  for (const card of targets) {
    emit({
      type: "node_updated",
      actor: "user",
      target: card.node.id,
      data: { priority },
    });
  }
}

/**
 * Move card to a different column
 */
function moveCardToColumn(state: BoardState, targetColIndex: number): void {
  const { columns, colIndex, cardIndex } = state;
  const sourceCol = columns[colIndex];
  const targetCol = columns[targetColIndex];
  const card = sourceCol?.cards[cardIndex];

  if (!card || !targetCol) return;

  // Calculate sort_order at end of target column
  const lastCard = targetCol.cards[targetCol.cards.length - 1];
  const sortOrder = lastCard ? lastCard.node.sort_order + 1 : 0;

  emit({
    type: "node_moved",
    actor: "user",
    target: card.node.id,
    data: {
      parent_id: targetCol.node.id,
      sort_order: sortOrder,
    },
  });

  // Update local state
  state.colIndex = targetColIndex;
  state.cardIndex = targetCol.cards.length; // Will be at the end
}

/**
 * Move card up/down within column
 */
function moveCardInColumn(state: BoardState, targetIndex: number): void {
  const { columns, colIndex, cardIndex } = state;
  const col = columns[colIndex];
  const card = col?.cards[cardIndex];

  if (!card || !col) return;

  // Calculate new sort_order
  let sortOrder: number;
  if (targetIndex === 0) {
    const first = col.cards[0];
    sortOrder = first ? first.node.sort_order - 1 : 0;
  } else if (targetIndex >= col.cards.length - 1) {
    const last = col.cards[col.cards.length - 1];
    sortOrder = last ? last.node.sort_order + 1 : 0;
  } else {
    const prev = col.cards[targetIndex - 1];
    const next = col.cards[targetIndex];
    sortOrder = (prev.node.sort_order + next.node.sort_order) / 2;
  }

  emit({
    type: "node_moved",
    actor: "user",
    target: card.node.id,
    data: {
      parent_id: col.node.id,
      sort_order: sortOrder,
    },
  });

  state.cardIndex = targetIndex;
}

/**
 * Get cards to operate on (selected or current)
 */
function getTargetCards(state: BoardState): CardState[] {
  const { columns, colIndex, cardIndex, selectedCards } = state;

  if (selectedCards.size > 0) {
    const targets: CardState[] = [];
    for (const col of columns) {
      for (const card of col.cards) {
        if (selectedCards.has(card.node.id)) {
          targets.push(card);
        }
      }
    }
    return targets;
  }

  const currentCard = columns[colIndex]?.cards[cardIndex];
  return currentCard ? [currentCard] : [];
}

/**
 * Render the board to stdout
 */
function renderBoard(state: BoardState): void {
  const { columns, colIndex, cardIndex, helpMode, searchMode, searchQuery } =
    state;
  const termWidth = process.stdout.columns || 80;
  const termHeight = process.stdout.rows || 24;

  // Help overlay
  if (helpMode) {
    renderHelp(termWidth, termHeight);
    return;
  }

  // Get root node for title
  const root = state.rootId ? getNode(state.rootId) : null;
  const title = root ? getNodeName(root) : "Board";

  // Header
  console.log(chalk.bold.inverse(` ${title} `.padEnd(termWidth)));

  if (columns.length === 0) {
    console.log(chalk.dim("\n  Empty board - no columns found"));
    console.log(chalk.dim("  Add child nodes to create columns\n"));
    renderStatusBar(state, termWidth);
    return;
  }

  // Calculate column dimensions
  const colWidth = Math.max(20, Math.floor((termWidth - 2) / columns.length));
  const cardHeight = termHeight - 5; // Header + status bar + padding

  // Column headers
  const headers = columns.map((col, i) => {
    const name = getNodeName(col.node);
    const count = col.cards.length;
    const header = ` ${name} (${count}) `;
    const isSelected = i === colIndex;
    const padded = header.padEnd(colWidth - 1).slice(0, colWidth - 1);
    return isSelected ? chalk.bold.bgBlue.white(padded) : chalk.bold(padded);
  });
  console.log(headers.join(" "));
  console.log(chalk.dim("─".repeat(termWidth)));

  // Render cards
  const maxCardsVisible = Math.max(
    Math.floor(cardHeight / 4),
    3
  ); // Approximate cards that fit

  for (let row = 0; row < maxCardsVisible; row++) {
    const cardLines = columns.map((col, ci) => {
      const card = col.cards[row];
      if (!card) {
        return " ".repeat(colWidth - 1);
      }

      const isCurrentCard = ci === colIndex && row === cardIndex;
      const isSelected = state.selectedCards.has(card.node.id);
      const isFolded = state.foldedCards.has(card.node.id);

      return renderCard(card, colWidth - 1, isCurrentCard, isSelected, isFolded);
    });

    // Cards can be multi-line, so split and print
    const lineArrays = cardLines.map((l) => l.split("\n"));
    const maxLines = Math.max(...lineArrays.map((a) => a.length));

    for (let li = 0; li < maxLines; li++) {
      const line = lineArrays
        .map((lines) => (lines[li] || "").padEnd(colWidth - 1))
        .join(" ");
      console.log(line);
    }
  }

  // Show "..." if more cards
  const moreIndicators = columns.map((col) => {
    if (col.cards.length > maxCardsVisible) {
      return chalk.dim(`  ... +${col.cards.length - maxCardsVisible} more`).padEnd(colWidth - 1);
    }
    return " ".repeat(colWidth - 1);
  });
  console.log(moreIndicators.join(" "));

  // Status bar
  renderStatusBar(state, termWidth);

  // Search bar
  if (searchMode) {
    console.log(chalk.inverse(` /${searchQuery}█ `.padEnd(termWidth)));
  }
}

/**
 * Render a single card
 */
function renderCard(
  card: CardState,
  width: number,
  isCurrent: boolean,
  isSelected: boolean,
  isFolded: boolean
): string {
  const lines: string[] = [];
  const { node, children } = card;

  // Status indicator
  const mark = node.task_mark || " ";
  const statusIcon = getStatusIcon(node.task_status);
  const priority = node.priority ? chalk.yellow(`P${node.priority}`) : "";

  // First line: checkbox + content
  const content = (node.content || getNodeName(node)).slice(0, width - 8);
  let firstLine = `${statusIcon}[${mark}] ${content}`;
  if (priority) {
    firstLine = `${priority} ${firstLine}`;
  }

  // Apply styling
  if (isCurrent) {
    firstLine = chalk.bgBlue.white(firstLine.padEnd(width).slice(0, width));
  } else if (isSelected) {
    firstLine = chalk.bgYellow.black(firstLine.padEnd(width).slice(0, width));
  } else {
    firstLine = firstLine.padEnd(width).slice(0, width);
  }
  lines.push(firstLine);

  // Children (outline) if not folded
  if (!isFolded && children.length > 0) {
    const maxChildren = 3;
    for (let i = 0; i < Math.min(children.length, maxChildren); i++) {
      const child = children[i];
      const childMark = child.task_mark || "·";
      const childContent = (child.content || "").slice(0, width - 6);
      lines.push(chalk.dim(`  ${childMark} ${childContent}`).padEnd(width).slice(0, width));
    }
    if (children.length > maxChildren) {
      lines.push(chalk.dim(`  ... +${children.length - maxChildren}`).padEnd(width).slice(0, width));
    }
  } else if (children.length > 0) {
    lines.push(chalk.dim(`  ▶ ${children.length} items`).padEnd(width).slice(0, width));
  }

  // Card border bottom
  lines.push(chalk.dim("─".repeat(width)));

  return lines.join("\n");
}

/**
 * Render status bar
 */
function renderStatusBar(state: BoardState, width: number): void {
  const { visualMode, selectedCards, zoomStack } = state;

  const parts: string[] = [];

  if (visualMode) {
    parts.push(chalk.bgYellow.black(" VISUAL "));
  }

  if (selectedCards.size > 0) {
    parts.push(chalk.yellow(`${selectedCards.size} selected`));
  }

  if (zoomStack.length > 0) {
    parts.push(chalk.cyan(`depth: ${zoomStack.length}`));
  }

  const left = parts.join(" ");
  const right = "h/l:cols j/k:cards x:status Tab:fold ?:help q:quit";

  const padding = width - left.length - right.length - 2;
  console.log(
    chalk.inverse(` ${left}${" ".repeat(Math.max(1, padding))}${right} `)
  );
}

/**
 * Render help overlay
 */
function renderHelp(width: number, _height: number): void {
  const help = `
${chalk.bold("BOARDLINER - Keyboard Reference")}

${chalk.yellow("Navigation")}
  h / Ctrl+B      Move to left column
  l / Ctrl+F      Move to right column
  j / Ctrl+N      Move to next card
  k / Ctrl+P      Move to previous card
  g               Jump to first card
  G               Jump to last card
  Enter / o       Zoom into card
  Escape / q      Zoom out / Quit

${chalk.yellow("Selection")}
  Space           Toggle card selection
  v               Visual mode (multi-select)

${chalk.yellow("Actions")}
  x               Cycle status (open → in_progress → done → ...)
  1-5             Set priority
  Tab             Fold/unfold card outline

${chalk.yellow("Card Movement")}
  H               Move card to previous column
  L               Move card to next column
  K               Move card up in column
  J               Move card down in column

${chalk.yellow("Other")}
  /               Search
  ?               This help
  q               Quit

${chalk.dim("Press any key to close")}
`;

  console.log(chalk.bgBlue.white(" ".repeat(width)));
  for (const line of help.split("\n")) {
    console.log(line.padEnd(width).slice(0, width));
  }
}

/**
 * Get display name for a node
 */
function getNodeName(node: Node): string {
  if (node.data?.name) {
    return node.data.name as string;
  }
  if (node.content) {
    return node.content.split("\n")[0].slice(0, 50);
  }
  if (node.fs_path) {
    return node.fs_path.split("/").pop() || node.id.slice(0, 8);
  }
  return node.id.slice(0, 8);
}

/**
 * Get status icon
 */
function getStatusIcon(status?: TaskStatus): string {
  switch (status) {
    case "done":
      return chalk.green("✓");
    case "in_progress":
      return chalk.yellow("◐");
    case "blocked":
      return chalk.red("⊘");
    case "waiting":
      return chalk.cyan("◷");
    case "cancelled":
      return chalk.dim("✗");
    default:
      return chalk.dim("○");
  }
}

/**
 * Format a card for static display
 */
function formatCardLine(card: CardState, width: number): string {
  const { node } = card;
  const mark = node.task_mark || " ";
  const content = (node.content || getNodeName(node)).slice(0, width - 6);
  const statusIcon = getStatusIcon(node.task_status);
  return `${statusIcon}[${mark}] ${content}`.padEnd(width).slice(0, width);
}
