/**
 * Board keyboard input handlers
 *
 * These are handler functions (not hooks) that are called from useInput.
 * They're extracted here for organization, but the actual useInput calls
 * remain in Board.tsx since they need access to component-level state.
 */
import type { Key } from "inkx";
import type { Dispatch } from "react";
import { actions, type UIAction } from "../ui-reducer.ts";
import type { BoardAction } from "@km/board";
import type { TUIContext } from "../tui-context.ts";
import {
  processKeyWithContext,
  ensureCommandSystemInitialized,
} from "../command-bridge.ts";
import { handleCommandAction } from "../board-actions.ts";

// Re-export for convenience
export { ensureCommandSystemInitialized };

/**
 * Handle main keyboard input through command system
 * Returns true if key was handled
 */
export function handleBoardKeyInput(
  input: string,
  key: Key,
  tuiContext: TUIContext,
  ui: {
    showNewItemDialog: boolean;
    showProjectPicker: boolean;
    showHelp: boolean;
  },
  dispatch: Dispatch<UIAction>,
  exit: () => void,
): boolean {
  // Dialog modes have their own input handling via dialog components
  if (ui.showNewItemDialog || ui.showProjectPicker) {
    return false;
  }

  // Help overlay blocks most keys - only allow dismiss keys
  if (ui.showHelp) {
    if (input === "?" || key.escape) {
      dispatch(actions.hideHelp());
      return true;
    } else if (input === "q") {
      exit();
      return true;
    }
    // All other keys are blocked while help is showing
    return true;
  }

  // Route ALL keys through the command system
  const result = processKeyWithContext(input, key, tuiContext);

  if (result.handled && result.actions) {
    const actionList = Array.isArray(result.actions)
      ? result.actions
      : [result.actions];
    for (const action of actionList) {
      handleCommandAction(tuiContext, action);
    }
    return true;
  }

  // Unhandled keys are silently ignored
  return false;
}

/**
 * Handle detail pane keyboard input
 * Limited navigation: j/k/arrows for cards, h/Esc to close, q to quit
 */
export function handleDetailPaneKeyInput(
  input: string,
  key: Key,
  state: {
    colIndex: number;
    cardIndex: number;
    columns: Array<{ cards: unknown[] }>;
  },
  dispatch: Dispatch<UIAction>,
  dispatchBoard: Dispatch<BoardAction>,
  exit: () => void,
): void {
  if (input === "h" || key.escape) {
    dispatch(actions.setDetailPane(false));
    return;
  }
  if (input === "q") {
    exit();
    return;
  }
  const col = state.columns[state.colIndex];
  if (input === "j" || key.downArrow) {
    if (col && state.cardIndex < col.cards.length - 1) {
      dispatchBoard({ type: "CURSOR_MOVE", dir: "next" });
    }
    return;
  }
  if (input === "k" || key.upArrow) {
    if (state.cardIndex > 0) {
      dispatchBoard({ type: "CURSOR_MOVE", dir: "prev" });
    }
    return;
  }
}
