/**
 * Keyboard Handler Types and Constants
 *
 * Shared types and constants for keyboard handling.
 */

import type { KNode } from "@km/core";
import type { BoardState, SelectionKey } from "./types.ts";
import type { UIState } from "./ui-reducer.ts";
import { actions } from "./ui-reducer.ts";

// =============================================================================
// Types
// =============================================================================

export interface KeyEvent {
  escape?: boolean;
  return?: boolean;
  ctrl?: boolean;
  upArrow?: boolean;
  downArrow?: boolean;
  leftArrow?: boolean;
  rightArrow?: boolean;
  tab?: boolean;
  backspace?: boolean;
  delete?: boolean;
  shift?: boolean;
  meta?: boolean;
}

export interface KeyboardContext {
  state: BoardState;
  ui: UIState;
  setState: React.Dispatch<React.SetStateAction<BoardState>>;
  dispatch: React.Dispatch<ReturnType<(typeof actions)[keyof typeof actions]>>;
  exit: () => void;
  countVisibleDescendants: (
    node: KNode,
    depth: number,
    maxDepth: number,
    foldedNodes: Set<string>,
  ) => number;
}

// =============================================================================
// Constants
// =============================================================================

/** Default favorites: common boards accessed via 1-9 keys */
export const DEFAULT_FAVORITES: Record<string, string> = {
  "1": "@inbox",
  "2": "@next",
  "3": "@waiting",
  "4": "@someday",
  "5": "@projects",
  "6": "@areas",
  "7": "@archive",
  "8": "@reference",
  "9": "@goals",
};

/** Terminal sends these characters for Shift+1-9 */
export const SHIFT_NUMBER_MAP: Record<string, number> = {
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
