/**
 * Shell Executor for km-sh
 *
 * Executes commands against a BoardState and produces output.
 * Supports both JSON and line (human-readable) output modes.
 */

import type { BoardState, BoardAction } from "./types.ts";
import { boardReducer } from "./boardReducer.ts";
import { parseCommand, getCommandHelp } from "./commandParser.ts";
import type { ShellCommand } from "./commandParser.ts";

/**
 * Output event types for JSON mode
 */
export type OutputEvent =
  | { event: "init"; state: SerializedState; ts: number }
  | { event: "action"; action: BoardAction; ts: number }
  | { event: "state"; state: SerializedState; ts: number }
  | { event: "error"; error: string; ts: number }
  | { event: "output"; text: string; ts: number };

/**
 * Serialized state (Sets converted to arrays for JSON)
 */
export interface SerializedState {
  rootId: string | null;
  rootPath: string | null;
  colIndex: number;
  cardIndex: number;
  selectedCards: string[];
  foldedCards: string[];
  collapsedColumns: number[];
  searchQuery: string;
  searchMode: boolean;
  helpMode: boolean;
  columnCount: number;
  cardCounts: number[];
}

/**
 * Shell execution context
 */
export interface ShellContext {
  state: BoardState;
  jsonMode: boolean;
  output: (event: OutputEvent | string) => void;
}

/**
 * Serialize BoardState for JSON output
 */
export function serializeState(state: BoardState): SerializedState {
  return {
    rootId: state.rootId,
    rootPath: state.rootPath,
    colIndex: state.colIndex,
    cardIndex: state.cardIndex,
    selectedCards: Array.from(state.selectedCards),
    foldedCards: Array.from(state.foldedCards),
    collapsedColumns: Array.from(state.collapsedColumns),
    searchQuery: state.searchQuery,
    searchMode: state.searchMode,
    helpMode: state.helpMode,
    columnCount: state.columns.length,
    cardCounts: state.columns.map((c) => c.cards.length),
  };
}

/**
 * Format state for human-readable output
 */
export function formatStateHuman(state: BoardState): string {
  const col = state.columns[state.colIndex];
  const card = col?.cards[state.cardIndex];
  const lines: string[] = [
    `position: col=${state.colIndex} card=${state.cardIndex}`,
    `column: ${col?.title ?? "(none)"} (${col?.cards.length ?? 0} cards)`,
    `card: ${card?.title ?? "(none)"}`,
  ];

  if (state.selectedCards.size > 0) {
    lines.push(`selected: ${state.selectedCards.size} cards`);
  }
  if (state.searchMode) {
    lines.push(`search: "${state.searchQuery}"`);
  }
  if (state.foldedCards.size > 0) {
    lines.push(`folded: ${state.foldedCards.size} cards`);
  }
  if (state.collapsedColumns.size > 0) {
    lines.push(`collapsed: ${state.collapsedColumns.size} columns`);
  }

  return lines.join("\n");
}

/**
 * Render a simple ASCII view of the board
 */
export function renderAsciiView(state: BoardState): string {
  const lines: string[] = [];

  // Header
  if (state.rootPath) {
    lines.push(`Path: ${state.rootPath}`);
    lines.push("");
  }

  // Columns as simple list
  for (let ci = 0; ci < state.columns.length; ci++) {
    const col = state.columns[ci];
    const isSelected = ci === state.colIndex;
    const colMarker = isSelected ? "▶" : " ";
    lines.push(`${colMarker} [${ci}] ${col.title} (${col.cards.length})`);

    // Cards in column
    for (let cardi = 0; cardi < col.cards.length; cardi++) {
      const card = col.cards[cardi];
      const isCardSelected = isSelected && cardi === state.cardIndex;
      const cardMarker = isCardSelected ? "→" : " ";
      const foldMarker = state.foldedCards.has(card.nodeId) ? "▸" : " ";
      const statusIcon = card.taskStatus
        ? { todo: "○", wip: "◐", blocked: "⊘", done: "✓", dropped: "∅" }[
            card.taskStatus
          ]
        : " ";

      lines.push(
        `  ${cardMarker}${foldMarker} ${statusIcon} ${card.title}${card.childCount > 0 ? ` (+${card.childCount})` : ""}`,
      );
    }

    if (state.collapsedColumns.has(ci)) {
      lines.push(`    (collapsed)`);
    }
  }

  return lines.join("\n");
}

/**
 * Execute a shell command (not a BoardAction)
 */
export function executeShellCommand(
  command: ShellCommand,
  ctx: ShellContext,
): { quit: boolean } {
  const ts = Date.now();

  switch (command.type) {
    case "STATE": {
      if (ctx.jsonMode) {
        ctx.output({ event: "state", state: serializeState(ctx.state), ts });
      } else {
        ctx.output(formatStateHuman(ctx.state));
      }
      return { quit: false };
    }

    case "VIEW": {
      const view = renderAsciiView(ctx.state);
      if (ctx.jsonMode) {
        ctx.output({ event: "output", text: view, ts });
      } else {
        ctx.output(view);
      }
      return { quit: false };
    }

    case "HELP": {
      const help = getCommandHelp(command.topic);
      if (ctx.jsonMode) {
        ctx.output({ event: "output", text: help, ts });
      } else {
        ctx.output(help);
      }
      return { quit: false };
    }

    case "QUIT":
      return { quit: true };
  }
}

/**
 * Execute a BoardAction
 */
export function executeBoardAction(
  action: BoardAction,
  ctx: ShellContext,
): BoardState {
  const ts = Date.now();

  // Log the action
  if (ctx.jsonMode) {
    ctx.output({ event: "action", action, ts });
  } else {
    ctx.output(`# ${action.type}`);
  }

  // Execute the action
  const newState = boardReducer(ctx.state, action);

  // Log state change if something changed
  const changed =
    newState.colIndex !== ctx.state.colIndex ||
    newState.cardIndex !== ctx.state.cardIndex ||
    newState.searchMode !== ctx.state.searchMode ||
    newState.helpMode !== ctx.state.helpMode ||
    newState.foldedCards.size !== ctx.state.foldedCards.size ||
    newState.collapsedColumns.size !== ctx.state.collapsedColumns.size ||
    newState.selectedCards.size !== ctx.state.selectedCards.size;

  if (changed) {
    if (ctx.jsonMode) {
      ctx.output({ event: "state", state: serializeState(newState), ts });
    } else {
      const col = newState.columns[newState.colIndex];
      ctx.output(
        `state: col=${newState.colIndex} card=${newState.cardIndex}${col ? ` "${col.title}"` : ""}`,
      );
    }
  }

  return newState;
}

/**
 * Execute a single command line
 * Returns new state and whether to quit
 */
export function executeCommand(
  line: string,
  ctx: ShellContext,
): { state: BoardState; quit: boolean } {
  const ts = Date.now();
  const result = parseCommand(line);

  if (!result.ok) {
    // Check for special KEY: marker
    if (result.error.startsWith("KEY:")) {
      const key = result.error.slice(4);
      // Map common keys to actions
      const keyMap: Record<string, BoardAction> = {
        j: { type: "MOVE_DOWN" },
        k: { type: "MOVE_UP" },
        h: { type: "MOVE_LEFT" },
        l: { type: "MOVE_RIGHT" },
        g: { type: "JUMP_TOP" },
        G: { type: "JUMP_BOTTOM" },
        Enter: { type: "MOVE_DOWN" }, // Simplified - real TUI would zoom in
        Escape: { type: "TOGGLE_SEARCH_MODE" },
        "/": { type: "TOGGLE_SEARCH_MODE" },
        "?": { type: "TOGGLE_HELP_MODE" },
      };

      const action = keyMap[key];
      if (action) {
        const newState = executeBoardAction(action, ctx);
        return { state: newState, quit: false };
      } else {
        if (ctx.jsonMode) {
          ctx.output({ event: "error", error: `Unknown key: ${key}`, ts });
        } else {
          ctx.output(`error: Unknown key: ${key}`);
        }
        return { state: ctx.state, quit: false };
      }
    }

    // Skip empty lines/comments silently
    if (result.error === "empty") {
      return { state: ctx.state, quit: false };
    }

    // Report error
    if (ctx.jsonMode) {
      ctx.output({ event: "error", error: result.error, ts });
    } else {
      ctx.output(`error: ${result.error}`);
    }
    return { state: ctx.state, quit: false };
  }

  // Execute shell command or board action
  if ("command" in result) {
    const { quit } = executeShellCommand(result.command, ctx);
    return { state: ctx.state, quit };
  } else {
    const newState = executeBoardAction(result.action, ctx);
    return { state: newState, quit: false };
  }
}

/**
 * Run shell with input lines
 * Returns final state
 */
export function runShell(
  lines: string[],
  initialState: BoardState,
  options: {
    jsonMode?: boolean;
    output?: (event: OutputEvent | string) => void;
  } = {},
): BoardState {
  const jsonMode = options.jsonMode ?? false;
  const output = options.output ?? ((e) => console.log(typeof e === "string" ? e : JSON.stringify(e)));

  // Initial state output
  const ts = Date.now();
  if (jsonMode) {
    output({ event: "init", state: serializeState(initialState), ts });
  }

  const ctx: ShellContext = {
    state: initialState,
    jsonMode,
    output,
  };

  for (const line of lines) {
    const { state, quit } = executeCommand(line, ctx);
    ctx.state = state;
    if (quit) break;
  }

  return ctx.state;
}
