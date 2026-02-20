/**
 * Text Editing Commands
 *
 * Commands for text input fields (inline edit, search).
 * Dispatched to the active TextEditTarget via the command system.
 * All use when: textInputFocused predicate in keybindings.
 */

import type { CommandDef, CommandAction } from "../types.ts"

export const textEditingCommands: CommandDef[] = [
  {
    id: "text.delete_backward",
    name: "Delete Backward",
    description: "Delete character before cursor",
    category: "TextEdit",
    execute: (): CommandAction => ({ type: "TEXT_DELETE_BACKWARD" }),
  },
  {
    id: "text.delete_forward",
    name: "Delete Forward",
    description: "Delete character after cursor",
    category: "TextEdit",
    execute: (): CommandAction => ({ type: "TEXT_DELETE_FORWARD" }),
  },
  {
    id: "text.cursor_left",
    name: "Cursor Left",
    description: "Move cursor left",
    category: "TextEdit",
    execute: (): CommandAction => ({ type: "TEXT_CURSOR_LEFT" }),
  },
  {
    id: "text.cursor_right",
    name: "Cursor Right",
    description: "Move cursor right",
    category: "TextEdit",
    execute: (): CommandAction => ({ type: "TEXT_CURSOR_RIGHT" }),
  },
  {
    id: "text.cursor_start",
    name: "Cursor to Start",
    description: "Move cursor to beginning of line",
    category: "TextEdit",
    execute: (): CommandAction => ({ type: "TEXT_CURSOR_START" }),
  },
  {
    id: "text.cursor_end",
    name: "Cursor to End",
    description: "Move cursor to end of line",
    category: "TextEdit",
    execute: (): CommandAction => ({ type: "TEXT_CURSOR_END" }),
  },
  {
    id: "text.cursor_up",
    name: "Cursor Up",
    description: "Move cursor up one visual line, or navigate to previous block",
    category: "TextEdit",
    execute: (): CommandAction => ({ type: "TEXT_CURSOR_UP" }),
  },
  {
    id: "text.cursor_down",
    name: "Cursor Down",
    description: "Move cursor down one visual line, or navigate to next block",
    category: "TextEdit",
    execute: (): CommandAction => ({ type: "TEXT_CURSOR_DOWN" }),
  },
  {
    id: "text.delete_word",
    name: "Delete Word",
    description: "Delete word backwards",
    category: "TextEdit",
    execute: (): CommandAction => ({ type: "TEXT_DELETE_WORD" }),
  },
  {
    id: "text.delete_to_start",
    name: "Delete to Start",
    description: "Delete from cursor to beginning of line",
    category: "TextEdit",
    execute: (): CommandAction => ({ type: "TEXT_DELETE_TO_START" }),
  },
  {
    id: "text.delete_to_end",
    name: "Delete to End",
    description: "Delete from cursor to end of line",
    category: "TextEdit",
    execute: (): CommandAction => ({ type: "TEXT_DELETE_TO_END" }),
  },
  {
    id: "text.confirm",
    name: "Confirm",
    description: "Confirm text input",
    category: "TextEdit",
    execute: (): CommandAction => ({ type: "TEXT_CONFIRM" }),
  },
  {
    id: "text.exit_edit",
    name: "Exit Edit",
    description: "Save and exit text editing mode",
    category: "TextEdit",
    execute: (): CommandAction => ({ type: "TEXT_EXIT_EDIT" }),
  },
  {
    id: "text.yank",
    name: "Yank (Paste Kill)",
    description: "Paste killed text (emacs yank)",
    category: "TextEdit",
    execute: (): CommandAction => ({ type: "TEXT_YANK" }),
  },
]

/**
 * Detail pane commands.
 * h/Esc close detail pane via when: isInDetailPane predicate.
 */
export const detailPaneCommands: CommandDef[] = [
  {
    id: "detail_pane.close",
    name: "Close Detail Pane",
    description: "Close the detail pane",
    category: "View",
    execute: (): CommandAction => ({ type: "DETAIL_PANE_CLOSE" }),
  },
  {
    id: "detail_pane.scroll_down",
    name: "Scroll Detail Down",
    description: "Scroll the detail pane content down",
    category: "View",
    execute: (): CommandAction => ({ type: "DETAIL_PANE_SCROLL_DOWN" }),
  },
  {
    id: "detail_pane.scroll_up",
    name: "Scroll Detail Up",
    description: "Scroll the detail pane content up",
    category: "View",
    execute: (): CommandAction => ({ type: "DETAIL_PANE_SCROLL_UP" }),
  },
]
