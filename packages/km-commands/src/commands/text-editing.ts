/**
 * Text Editing Commands
 *
 * Commands for text input fields (inline edit, search).
 * Dispatched to the active TextEditTarget via the command system.
 * All use when: textInputFocused predicate in keybindings.
 */

import type { CommandDef, KmOp } from "../types.ts"

/** Create a tag-only text editing command (dispatches a single action type) */
function textCmd<T extends string>(id: string, name: string, description: string, type: T): CommandDef {
  return {
    id,
    name,
    description,
    category: "TextEdit",
    execute: (): KmOp => ({ type }) as KmOp,
  }
}

export const textEditingCommands: CommandDef[] = [
  textCmd("text.delete_backward", "Delete Backward", "Delete character before cursor", "TEXT_DELETE_BACKWARD"),
  textCmd("text.delete_forward", "Delete Forward", "Delete character after cursor", "TEXT_DELETE_FORWARD"),
  textCmd("text.cursor_left", "Cursor Left", "Move cursor left", "TEXT_CURSOR_LEFT"),
  textCmd("text.cursor_right", "Cursor Right", "Move cursor right", "TEXT_CURSOR_RIGHT"),
  textCmd("text.cursor_start", "Cursor to Start", "Move cursor to beginning of line", "TEXT_CURSOR_START"),
  textCmd("text.cursor_end", "Cursor to End", "Move cursor to end of line", "TEXT_CURSOR_END"),
  textCmd(
    "text.cursor_up",
    "Cursor Up",
    "Move cursor up one visual line, or navigate to previous block",
    "TEXT_CURSOR_UP",
  ),
  textCmd(
    "text.cursor_down",
    "Cursor Down",
    "Move cursor down one visual line, or navigate to next block",
    "TEXT_CURSOR_DOWN",
  ),
  textCmd("text.delete_word", "Delete Word", "Delete word backwards", "TEXT_DELETE_WORD"),
  textCmd("text.delete_to_start", "Delete to Start", "Delete from cursor to beginning of line", "TEXT_DELETE_TO_START"),
  textCmd("text.delete_to_end", "Delete to End", "Delete from cursor to end of line", "TEXT_DELETE_TO_END"),
  textCmd("text.confirm", "Confirm", "Confirm text input", "TEXT_CONFIRM"),
  textCmd("text.exit_edit", "Exit Edit", "Save and exit text editing mode", "TEXT_EXIT_EDIT"),
  textCmd("text.yank", "Yank (Paste Kill)", "Paste killed text (emacs yank)", "TEXT_YANK"),
  textCmd("text.linebreak_split", "Split at Cursor", "Split node at cursor position", "TEXT_LINEBREAK_SPLIT"),
  textCmd("text.linebreak_before", "Insert Before", "Insert new node before current", "TEXT_LINEBREAK_BEFORE"),
  textCmd("text.linebreak_child", "Insert Child", "Insert new child node", "TEXT_LINEBREAK_CHILD"),
  textCmd("text.linebreak_after", "Insert After", "Insert new node after current", "TEXT_LINEBREAK_AFTER"),
  textCmd("text.child_block", "Insert Child Block", "Insert new child node (Shift+Enter)", "TEXT_CHILD_BLOCK"),
  textCmd("text.bold", "Bold", "Toggle bold formatting on selection (Cmd+B)", "TEXT_BOLD"),
  textCmd("text.italic", "Italic", "Toggle italic formatting on selection (Cmd+I)", "TEXT_ITALIC"),
]
