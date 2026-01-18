/**
 * Board Rendering
 *
 * Pure functions that render board state to strings - fully testable.
 *
 * Uses the text layer (text/index.ts) for:
 * - Content rendering: renderRich() for markdown-aware styling
 * - Status icons: renderStatusIcon() with colorize()
 *
 * Uses chalk directly for UI chrome only:
 * - Headers, borders, status bars
 * - Selection/current highlighting (bgBlue, bgYellow)
 */

import chalk from "chalk";
import type { TaskStatus } from "@km/core";
import type { BoardState, CardState, RenderOptions } from "./types.ts";
import { getNodeDisplayName } from "./state.ts";
import { getNode } from "@km/storage";
import {
  getStatusIcon as getStatusIconBase,
  renderRich,
  colorize,
} from "./text/index.ts";

/**
 * Default render options
 */
export function defaultRenderOptions(): RenderOptions {
  return {
    width: process.stdout.columns || 80,
    height: process.stdout.rows || 24,
    useColor: true,
  };
}

/**
 * Render the entire board to a string
 */
export function renderBoard(state: BoardState, opts: RenderOptions): string {
  const lines: string[] = [];
  const { width, height } = opts;

  // Help overlay
  if (state.helpMode) {
    return renderHelp(width);
  }

  // Get root node for title
  const root = state.rootId ? getNode(state.rootId) : null;
  const title = root ? getNodeDisplayName(root) : "Board";

  // Header
  lines.push(chalk.bold.inverse(` ${title} `.padEnd(width)));

  if (state.columns.length === 0) {
    lines.push(chalk.dim("\n  Empty board - no columns found"));
    lines.push(chalk.dim("  Add child nodes to create columns\n"));
    lines.push(renderStatusBar(state, width));
    return lines.join("\n");
  }

  // Calculate column dimensions
  const colWidth = Math.max(20, Math.floor((width - 2) / state.columns.length));
  const cardHeight = height - 5;

  // Column headers
  const headers = state.columns.map((col, i) => {
    const name = getNodeDisplayName(col.node);
    const count = col.cards.length;
    const header = ` ${name} (${count}) `;
    const isSelected = i === state.colIndex;
    const padded = header.padEnd(colWidth - 1).slice(0, colWidth - 1);
    return isSelected ? chalk.bold.bgBlue.white(padded) : chalk.bold(padded);
  });
  lines.push(headers.join(" "));
  lines.push(chalk.dim("─".repeat(width)));

  // Render cards
  const maxCardsVisible = Math.max(Math.floor(cardHeight / 4), 3);

  for (let row = 0; row < maxCardsVisible; row++) {
    const cardLines = state.columns.map((col, ci) => {
      const card = col.cards[row];
      if (!card) {
        return " ".repeat(colWidth - 1);
      }

      const isCurrentCard = ci === state.colIndex && row === state.cardIndex;
      const isSelected = state.selectedCards.has(card.node.id);
      const isFolded = state.foldedCards.has(card.node.id);

      return renderCard(
        card,
        colWidth - 1,
        isCurrentCard,
        isSelected,
        isFolded,
      );
    });

    // Cards can be multi-line
    const lineArrays = cardLines.map((l) => l.split("\n"));
    const maxLines = Math.max(...lineArrays.map((a) => a.length));

    for (let li = 0; li < maxLines; li++) {
      const line = lineArrays
        .map((cardLineArray) => (cardLineArray[li] || "").padEnd(colWidth - 1))
        .join(" ");
      lines.push(line);
    }
  }

  // Show "..." if more cards
  const moreIndicators = state.columns.map((col) => {
    if (col.cards.length > maxCardsVisible) {
      return chalk
        .dim(`  ... +${col.cards.length - maxCardsVisible} more`)
        .padEnd(colWidth - 1);
    }
    return " ".repeat(colWidth - 1);
  });
  lines.push(moreIndicators.join(" "));

  // Status bar
  lines.push(renderStatusBar(state, width));

  // Search bar
  if (state.searchMode) {
    lines.push(chalk.inverse(` /${state.searchQuery}█ `.padEnd(width)));
  }

  return lines.join("\n");
}

/**
 * Render a single card
 * Format: "○ Content" with 2-space indent for children (greyed out)
 */
export function renderCard(
  card: CardState,
  width: number,
  isCurrent: boolean,
  isSelected: boolean,
  isFolded: boolean,
): string {
  const lines: string[] = [];
  const { node, children } = card;

  // Status icon and content - compact format: "○ Content"
  const statusIcon = renderStatusIcon(node.task_status);
  const rawContent = (node.content || getNodeDisplayName(node)).slice(
    0,
    width - 3,
  );

  // Apply markdown styling via renderRich, then dim+strikethrough for done/dropped
  const isDoneOrDropped =
    node.task_status === "done" || node.task_status === "dropped";
  const styledContent = renderRich(rawContent);
  const content = isDoneOrDropped
    ? chalk.dim.strikethrough(styledContent)
    : styledContent;
  let firstLine = `${statusIcon} ${content}`;

  // Apply styling
  if (isCurrent) {
    firstLine = chalk.bgBlue.white(firstLine.padEnd(width).slice(0, width));
  } else if (isSelected) {
    firstLine = chalk.bgYellow.black(firstLine.padEnd(width).slice(0, width));
  } else {
    firstLine = firstLine.padEnd(width).slice(0, width);
  }
  lines.push(firstLine);

  // Children (outline) - greyed out, same indent level as parent
  if (!isFolded && children.length > 0) {
    const maxChildren = 3;
    const visibleChildren = children.slice(0, maxChildren);
    for (const child of visibleChildren) {
      const childIcon = renderStatusIcon(child.task_status);
      const childRaw = (child.content || "").slice(0, width - 3);
      const childContent = renderRich(childRaw);
      lines.push(
        chalk.dim(`${childIcon} ${childContent}`).padEnd(width).slice(0, width),
      );
    }
    if (children.length > maxChildren) {
      lines.push(
        chalk
          .dim(`  +${children.length - maxChildren} more`)
          .padEnd(width)
          .slice(0, width),
      );
    }
  } else if (children.length > 0) {
    lines.push(
      chalk.dim(`  ▶ ${children.length}`).padEnd(width).slice(0, width),
    );
  }

  // Card border bottom
  lines.push(chalk.dim("─".repeat(width)));

  return lines.join("\n");
}

/**
 * Render status bar
 */
export function renderStatusBar(state: BoardState, width: number): string {
  const parts: string[] = [];

  if (state.visualMode) {
    parts.push(chalk.bgYellow.black(" VISUAL "));
  }

  if (state.selectedCards.size > 0) {
    parts.push(chalk.yellow(`${state.selectedCards.size} selected`));
  }

  if (state.zoomStack.length > 0) {
    parts.push(chalk.cyan(`depth: ${state.zoomStack.length}`));
  }

  const left = parts.join(" ");
  const right = "h/l:cols j/k:cards x:status Tab:fold ?:help q:quit";

  const padding = width - left.length - right.length - 2;
  return chalk.inverse(` ${left}${" ".repeat(Math.max(1, padding))}${right} `);
}

/**
 * Render help overlay
 */
export function renderHelp(width: number): string {
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
  x               Cycle status (todo → wip → blocked → done → ...)
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

  const lines: string[] = [];
  lines.push(chalk.bgBlue.white(" ".repeat(width)));
  for (const line of help.split("\n")) {
    lines.push(line.padEnd(width).slice(0, width));
  }
  return lines.join("\n");
}

/**
 * Render static board (non-TUI mode)
 * Displays columns vertically, one after another
 */
export function renderBoardStatic(state: BoardState, width: number): string {
  const { columns } = state;
  const lines: string[] = [];

  if (columns.length === 0) {
    return chalk.dim("Empty board");
  }

  // Show each column with its cards
  for (const col of columns) {
    const name = getNodeDisplayName(col.node);
    const count = col.cards.length;

    // Column header
    lines.push("");
    lines.push(chalk.bold(`${name}`) + chalk.dim(` (${count})`));

    // Cards under this column
    if (col.cards.length === 0) {
      lines.push(chalk.dim("  (empty)"));
    } else {
      const maxCards = 10; // Limit cards shown per column
      const visibleCards = col.cards.slice(0, maxCards);
      for (const card of visibleCards) {
        const statusIcon = renderStatusIcon(card.node.task_status);
        const rawContent = card.node.content || getNodeDisplayName(card.node);
        const firstLine = rawContent.split("\n")[0] ?? rawContent;
        const truncContent = firstLine.slice(0, width - 4);
        // Apply markdown styling, then dim+strikethrough for done/dropped
        const isDoneOrDropped =
          card.node.task_status === "done" ||
          card.node.task_status === "dropped";
        const styledContent = renderRich(truncContent);
        const content = isDoneOrDropped
          ? chalk.dim.strikethrough(styledContent)
          : styledContent;
        lines.push(`${statusIcon} ${content}`);

        // Show children (greyed out, indented)
        if (card.children.length > 0) {
          const maxChildren = 3;
          const visibleChildren = card.children.slice(0, maxChildren);
          for (const child of visibleChildren) {
            const childIcon = renderStatusIcon(child.task_status);
            const childRaw = child.content || "";
            const childLine = childRaw.split("\n")[0] ?? childRaw;
            const childContent = renderRich(childLine.slice(0, width - 6));
            lines.push(chalk.dim(`  ${childIcon} ${childContent}`));
          }
          if (card.children.length > maxChildren) {
            lines.push(
              chalk.dim(`    +${card.children.length - maxChildren} more`),
            );
          }
        }
      }
      if (col.cards.length > maxCards) {
        lines.push(chalk.dim(`  +${col.cards.length - maxCards} more cards`));
      }
    }
  }

  return lines.join("\n");
}

/**
 * Render status icon with coloring for CLI/TUI output.
 * Wraps the base getStatusIcon from icons.ts and applies colors via colorize().
 */
export function renderStatusIcon(status?: TaskStatus): string {
  const icon = getStatusIconBase(status);
  // Handle custom markers with background color (inverted display)
  if (icon.backgroundColor) {
    return chalk.bgWhite.black(icon.char);
  }
  // Map icon color to colorize-compatible color
  // Note: "blue" in icon.color maps to "cyan" for visibility
  const colorMap: Record<string, string> = {
    blue: "cyan",
  };
  const color = colorMap[icon.color ?? ""] ?? icon.color;
  return colorize(icon.char, color);
}
