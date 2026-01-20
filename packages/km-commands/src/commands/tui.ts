/**
 * TUI-specific commands
 *
 * Commands that are specific to the TUI application:
 * - Quit
 * - New item dialog
 * - Project picker
 * - Favorites (1-9)
 * - Column jump (Shift+1-9)
 * - Escape (contextual close/quit)
 * - Outdent
 */

import type { CommandDef, CommandAction } from "../types.ts";

export const tuiCommands: CommandDef[] = [
  // Quit
  {
    id: "quit",
    name: "Quit",
    description: "Exit the TUI",
    category: "View",
    shortcuts: ["q"],
    execute: (): CommandAction => ({ type: "QUIT" }),
  },

  // New item dialog
  {
    id: "new_item",
    name: "New Item",
    description: "Open new item dialog",
    category: "Edit",
    shortcuts: ["n"],
    execute: (): CommandAction => ({ type: "SHOW_NEW_ITEM_DIALOG" }),
  },

  // Project picker
  {
    id: "project_picker",
    name: "Project Picker",
    description: "Open project picker",
    category: "Navigation",
    shortcuts: ["p"],
    execute: (): CommandAction => ({ type: "SHOW_PROJECT_PICKER" }),
  },

  // Favorites (1-9)
  {
    id: "favorite_1",
    name: "Favorite 1",
    description: "Jump to favorite board 1",
    category: "Navigation",
    shortcuts: ["1"],
    execute: (): CommandAction => ({
      type: "JUMP_TO_FAVORITE",
      favoriteNumber: 1,
    }),
  },
  {
    id: "favorite_2",
    name: "Favorite 2",
    description: "Jump to favorite board 2",
    category: "Navigation",
    shortcuts: ["2"],
    execute: (): CommandAction => ({
      type: "JUMP_TO_FAVORITE",
      favoriteNumber: 2,
    }),
  },
  {
    id: "favorite_3",
    name: "Favorite 3",
    description: "Jump to favorite board 3",
    category: "Navigation",
    shortcuts: ["3"],
    execute: (): CommandAction => ({
      type: "JUMP_TO_FAVORITE",
      favoriteNumber: 3,
    }),
  },
  {
    id: "favorite_4",
    name: "Favorite 4",
    description: "Jump to favorite board 4",
    category: "Navigation",
    shortcuts: ["4"],
    execute: (): CommandAction => ({
      type: "JUMP_TO_FAVORITE",
      favoriteNumber: 4,
    }),
  },
  {
    id: "favorite_5",
    name: "Favorite 5",
    description: "Jump to favorite board 5",
    category: "Navigation",
    shortcuts: ["5"],
    execute: (): CommandAction => ({
      type: "JUMP_TO_FAVORITE",
      favoriteNumber: 5,
    }),
  },
  {
    id: "favorite_6",
    name: "Favorite 6",
    description: "Jump to favorite board 6",
    category: "Navigation",
    shortcuts: ["6"],
    execute: (): CommandAction => ({
      type: "JUMP_TO_FAVORITE",
      favoriteNumber: 6,
    }),
  },
  {
    id: "favorite_7",
    name: "Favorite 7",
    description: "Jump to favorite board 7",
    category: "Navigation",
    shortcuts: ["7"],
    execute: (): CommandAction => ({
      type: "JUMP_TO_FAVORITE",
      favoriteNumber: 7,
    }),
  },
  {
    id: "favorite_8",
    name: "Favorite 8",
    description: "Jump to favorite board 8",
    category: "Navigation",
    shortcuts: ["8"],
    execute: (): CommandAction => ({
      type: "JUMP_TO_FAVORITE",
      favoriteNumber: 8,
    }),
  },
  {
    id: "favorite_9",
    name: "Favorite 9",
    description: "Jump to favorite board 9",
    category: "Navigation",
    shortcuts: ["9"],
    execute: (): CommandAction => ({
      type: "JUMP_TO_FAVORITE",
      favoriteNumber: 9,
    }),
  },

  // Column jump (Shift+1-9)
  {
    id: "column_1",
    name: "Column 1",
    description: "Jump to column 1",
    category: "Navigation",
    shortcuts: ["!"],
    execute: (): CommandAction => ({ type: "JUMP_TO_COLUMN", columnNumber: 1 }),
  },
  {
    id: "column_2",
    name: "Column 2",
    description: "Jump to column 2",
    category: "Navigation",
    shortcuts: ["@"],
    execute: (): CommandAction => ({ type: "JUMP_TO_COLUMN", columnNumber: 2 }),
  },
  {
    id: "column_3",
    name: "Column 3",
    description: "Jump to column 3",
    category: "Navigation",
    shortcuts: ["#"],
    execute: (): CommandAction => ({ type: "JUMP_TO_COLUMN", columnNumber: 3 }),
  },
  {
    id: "column_4",
    name: "Column 4",
    description: "Jump to column 4",
    category: "Navigation",
    shortcuts: ["$"],
    execute: (): CommandAction => ({ type: "JUMP_TO_COLUMN", columnNumber: 4 }),
  },
  {
    id: "column_5",
    name: "Column 5",
    description: "Jump to column 5",
    category: "Navigation",
    shortcuts: ["%"],
    execute: (): CommandAction => ({ type: "JUMP_TO_COLUMN", columnNumber: 5 }),
  },
  {
    id: "column_6",
    name: "Column 6",
    description: "Jump to column 6",
    category: "Navigation",
    shortcuts: ["^"],
    execute: (): CommandAction => ({ type: "JUMP_TO_COLUMN", columnNumber: 6 }),
  },
  {
    id: "column_7",
    name: "Column 7",
    description: "Jump to column 7",
    category: "Navigation",
    shortcuts: ["&"],
    execute: (): CommandAction => ({ type: "JUMP_TO_COLUMN", columnNumber: 7 }),
  },
  {
    id: "column_8",
    name: "Column 8",
    description: "Jump to column 8",
    category: "Navigation",
    shortcuts: ["*"],
    execute: (): CommandAction => ({ type: "JUMP_TO_COLUMN", columnNumber: 8 }),
  },
  {
    id: "column_9",
    name: "Column 9",
    description: "Jump to column 9",
    category: "Navigation",
    shortcuts: ["("],
    execute: (): CommandAction => ({ type: "JUMP_TO_COLUMN", columnNumber: 9 }),
  },

  // Close/Quit (contextual Escape)
  {
    id: "close_or_quit",
    name: "Close/Quit",
    description: "Close current dialog/pane, or quit if nothing to close",
    category: "View",
    shortcuts: ["Escape"],
    execute: (): CommandAction => ({ type: "CLOSE_OR_QUIT" }),
  },

  // Outdent (Shift+Tab)
  {
    id: "outdent",
    name: "Outdent",
    description: "Move item to parent level",
    category: "Edit",
    shortcuts: ["Shift+Tab"],
    execute: (): CommandAction => ({ type: "OUTDENT_NODE" }),
  },
];
