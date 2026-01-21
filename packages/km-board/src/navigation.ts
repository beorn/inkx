/**
 * Visual-to-Structural Navigation Translation
 *
 * Translates visual directions (up/down/left/right) to structural tree operations
 * based on cursor depth. This replaces stored `selectionLevel` with a pure function.
 *
 * Key insight: The meaning of "down" depends on where the cursor is:
 * - At board level (depth 0): "down" enters the first column
 * - At column level (depth 1): "down" enters the first card
 * - At card level (depth 2+): "down" moves to next sibling card
 */

export type VisualDir = "up" | "down" | "left" | "right";

export type StructuralAction =
  | { action: "noop" }
  | { action: "enter_column"; target: number }
  | { action: "enter_card"; target: number }
  | { action: "exit_to_board" }
  | { action: "exit_to_column" }
  | { action: "prev_column" }
  | { action: "next_column" }
  | { action: "next_sibling" }
  | { action: "prev_sibling" };

/**
 * Translate visual direction to structural tree operation based on cursor depth.
 *
 * @param cursorDepth - Length of cursor path (0=board, 1=column, 2+=card)
 * @param visualDir - Visual direction from user input
 * @param context - Additional context for boundary checks
 * @returns The structural action to perform
 */
export function visualToStructural(
  cursorDepth: number,
  visualDir: VisualDir,
  context?: {
    cardIndex?: number;
    cardCount?: number;
    colIndex?: number;
    colCount?: number;
  },
): StructuralAction {
  if (cursorDepth === 0) {
    // Board level (no cursor on any node)
    if (visualDir === "down") return { action: "enter_column", target: 0 };
    return { action: "noop" };
  }

  if (cursorDepth === 1) {
    // Column level (cursor on column header)
    switch (visualDir) {
      case "down":
        return { action: "enter_card", target: 0 };
      case "up":
        return { action: "exit_to_board" };
      case "left":
        return { action: "prev_column" };
      case "right":
        return { action: "next_column" };
    }
  }

  // cursorDepth >= 2: Card level (cursor on card or deeper)
  switch (visualDir) {
    case "down":
      return { action: "next_sibling" };
    case "up":
      // At first card, exit to column level; otherwise prev sibling
      if (context?.cardIndex === 0) {
        return { action: "exit_to_column" };
      }
      return { action: "prev_sibling" };
    case "left":
      return { action: "prev_column" };
    case "right":
      return { action: "next_column" };
  }
}

/**
 * Check if a visual direction would be valid given current context.
 * Useful for determining if a key should beep or do nothing.
 */
export function canMove(
  cursorDepth: number,
  visualDir: VisualDir,
  context: {
    cardIndex: number;
    cardCount: number;
    colIndex: number;
    colCount: number;
  },
): boolean {
  const action = visualToStructural(cursorDepth, visualDir, context);

  switch (action.action) {
    case "noop":
      return false;
    case "enter_column":
      return context.colCount > 0;
    case "enter_card":
      return context.cardCount > 0;
    case "exit_to_board":
    case "exit_to_column":
      return true;
    case "prev_column":
      return context.colIndex > 0;
    case "next_column":
      return context.colIndex < context.colCount - 1;
    case "prev_sibling":
      return context.cardIndex > 0;
    case "next_sibling":
      return context.cardIndex < context.cardCount - 1;
  }
}
