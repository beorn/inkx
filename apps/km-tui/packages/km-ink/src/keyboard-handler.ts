/**
 * Keyboard Input Handler for Board TUI
 *
 * This file handles TUI-specific keyboard shortcuts that are NOT part of
 * the @km/commands system. All navigation, selection, fold/collapse, and
 * view mode commands are handled by the command system in Board.tsx.
 *
 * TUI-specific handlers kept here:
 * - n: new item dialog
 * - q: quit
 * - p: project picker
 * - 1-9: favorites jump
 * - Shift+1-9: column jump
 * - Enter: open detail pane
 * - Meta+arrows/hjkl: move cards between columns
 * - Shift+Tab: indent/outdent nodes
 * - Escape: close dialogs/outline mode/quit
 */

import { actions } from "./ui-reducer.ts";
import { resolveNode } from "@km/storage";
import { buildBoardState } from "./state.ts";

// Re-export types for consumers
export type { KeyEvent, KeyboardContext } from "./keyboard-types.ts";
export { DEFAULT_FAVORITES, SHIFT_NUMBER_MAP } from "./keyboard-types.ts";

// Import helpers
import {
  pushNavHistoryEntry,
  clearSelection,
} from "./keyboard-helpers.ts";

// Import card operations
import {
  moveCardInColumn,
  moveCardToColumn,
  moveCardToColumnByIndex,
  outdentNode,
} from "./keyboard-card-ops.ts";

// Import types and constants for local use
import type { KeyEvent, KeyboardContext } from "./keyboard-types.ts";
import { DEFAULT_FAVORITES, SHIFT_NUMBER_MAP } from "./keyboard-types.ts";

// =============================================================================
// Main Keyboard Handler (TUI-specific keys only)
// =============================================================================

/**
 * Handle TUI-specific keyboard input.
 * Navigation, selection, and view commands are handled by @km/commands in Board.tsx.
 * Returns true if the input was handled, false otherwise.
 */
export function handleKeyboardInput(
  ctx: KeyboardContext,
  input: string,
  key: KeyEvent,
): boolean {
  const col = ctx.state.columns[ctx.state.colIndex];
  const card = col?.cards[ctx.state.cardIndex];

  // Open new item dialog with 'n' key
  if (input === "n") {
    ctx.dispatch(actions.showNewItemDialog());
    ctx.dispatch(actions.exitOutlineMode());
    ctx.dispatch(actions.setSubIndex(0));
    clearSelection(ctx);
    ctx.dispatch(actions.setDetailPane(false));
    return true;
  }

  // Shift+1-9: jump cursor to column
  const shiftColIndex = SHIFT_NUMBER_MAP[input];
  if (
    shiftColIndex !== undefined &&
    !ctx.ui.showDetailPane &&
    !ctx.ui.inOutlineMode &&
    shiftColIndex < ctx.state.columns.length
  ) {
    ctx.setState((s) => ({
      ...s,
      colIndex: shiftColIndex,
      cardIndex: Math.min(
        s.cardIndex,
        Math.max(0, (s.columns[shiftColIndex]?.cards.length ?? 1) - 1),
      ),
    }));
    clearSelection(ctx);
    ctx.dispatch(actions.setSelectAllLevel(0));
    return true;
  }

  // Plain 1-9: jump to favorite boards
  if (
    /^[1-9]$/.test(input) &&
    !ctx.ui.showDetailPane &&
    !ctx.ui.inOutlineMode &&
    !key.meta
  ) {
    const favoriteRef = DEFAULT_FAVORITES[input];
    if (favoriteRef) {
      const resolved = resolveNode(favoriteRef);
      if (resolved) {
        const zoomed = buildBoardState(resolved.id);
        zoomed.zoomStack = [...ctx.state.zoomStack, ctx.state.rootId || ""];
        pushNavHistoryEntry(
          ctx.dispatch,
          ctx.state.rootId,
          ctx.state.colIndex,
          ctx.state.cardIndex,
          ctx.ui.subIndex,
          ctx.ui.multiSelected,
          ctx.ui.inOutlineMode,
        );
        ctx.dispatch(actions.exitOutlineMode());
        ctx.dispatch(actions.setSubIndex(0));
        clearSelection(ctx);
        ctx.dispatch(actions.setDetailPane(false));
        ctx.setState(zoomed);
      } else {
        process.stdout.write("\x07");
      }
    }
    return true;
  }

  // Quit
  if (input === "q") {
    ctx.exit();
    return true;
  }

  // Alt/Opt + key for moving items
  if (key.meta && card) {
    if (key.upArrow) {
      moveCardInColumn(ctx, card, "up");
      return true;
    }
    if (key.downArrow) {
      moveCardInColumn(ctx, card, "down");
      return true;
    }
    if (key.leftArrow) {
      moveCardToColumn(ctx, card, "left");
      return true;
    }
    if (key.rightArrow) {
      moveCardToColumn(ctx, card, "right");
      return true;
    }
    if (input === "k") {
      moveCardInColumn(ctx, card, "up");
      return true;
    }
    if (input === "j") {
      moveCardInColumn(ctx, card, "down");
      return true;
    }
    if (input === "h") {
      moveCardToColumn(ctx, card, "left");
      return true;
    }
    if (input === "l") {
      moveCardToColumn(ctx, card, "right");
      return true;
    }
    if (/^[1-9]$/.test(input) && !ctx.ui.showDetailPane) {
      const targetCol = parseInt(input, 10) - 1;
      if (targetCol < ctx.state.columns.length) {
        moveCardToColumnByIndex(ctx, card, targetCol);
      }
      return true;
    }
  }

  // Escape: close UI elements progressively, then quit
  if (key.escape) {
    if (ctx.ui.showDetailPane) {
      ctx.dispatch(actions.setDetailPane(false));
      return true;
    }
    if (ctx.ui.inOutlineMode) {
      ctx.dispatch(actions.exitOutlineMode());
      ctx.dispatch(actions.setSubIndex(0));
      clearSelection(ctx);
      return true;
    }
    ctx.exit();
    return true;
  }

  // Shift+Tab: outdent (Tab without shift is fold, handled by commands)
  if (key.tab && key.shift && card) {
    outdentNode(ctx, card);
    return true;
  }

  // Tab without shift for indent (commands handle fold via TOGGLE_FOLD)
  // Actually indent is also Tab, so we need to handle Tab here for indent
  // But wait - the command system has Tab mapped to TOGGLE_FOLD
  // We need Tab to do fold, Shift+Tab to do outdent
  // Let me check - if Tab is in isTuiSpecificKey only when shift is pressed,
  // then Tab alone goes to commands for fold. Good.

  // Enter opens detail pane
  if (key.return && card) {
    ctx.dispatch(actions.setDetailPane(true));
    ctx.dispatch(actions.exitOutlineMode());
    ctx.dispatch(actions.setSubIndex(0));
    clearSelection(ctx);
    return true;
  }

  // Open project picker with 'p' key
  if (input === "p" && card) {
    ctx.dispatch(actions.showProjectPicker());
    ctx.dispatch(actions.exitOutlineMode());
    ctx.dispatch(actions.setSubIndex(0));
    clearSelection(ctx);
    ctx.dispatch(actions.setDetailPane(false));
    return true;
  }

  return false;
}

// =============================================================================
// Detail Pane Keyboard Handler
// =============================================================================

/**
 * Handle keyboard input when detail pane is active.
 * Returns true if the input was handled.
 */
export function handleDetailPaneInput(
  ctx: KeyboardContext,
  input: string,
  key: KeyEvent,
): boolean {
  if (!ctx.ui.showDetailPane) return false;

  const col = ctx.state.columns[ctx.state.colIndex];

  // Close detail pane with 'h' key
  if (input === "h") {
    ctx.dispatch(actions.setDetailPane(false));
    return true;
  }

  // Navigate cards while detail pane is open
  if (input === "j" || key.downArrow) {
    if (col && ctx.state.cardIndex < col.cards.length - 1) {
      ctx.setState((s) => ({ ...s, cardIndex: s.cardIndex + 1 }));
    }
    return true;
  }
  if (input === "k" || key.upArrow) {
    if (ctx.state.cardIndex > 0) {
      ctx.setState((s) => ({ ...s, cardIndex: s.cardIndex - 1 }));
    }
    return true;
  }

  // Quit from detail pane
  if (input === "q") {
    ctx.exit();
    return true;
  }

  return false;
}
