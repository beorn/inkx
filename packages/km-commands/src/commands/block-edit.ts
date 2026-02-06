/**
 * Block editing commands
 *
 * Navigate between editable blocks (title + body paragraphs) within a node.
 * Up/Down move between blocks, auto-saving the current block.
 */

import type { CommandDef } from "../types.ts"

const navigateUp = {
  id: "edit_block.navigate_up",
  name: "Block Up",
  description: "Save current block and move to previous block",
  category: "TextEdit",
  execute: () => ({ type: "EDIT_BLOCK_NAVIGATE", direction: "up" }),
} satisfies CommandDef

const navigateDown = {
  id: "edit_block.navigate_down",
  name: "Block Down",
  description: "Save current block and move to next block",
  category: "TextEdit",
  execute: () => ({ type: "EDIT_BLOCK_NAVIGATE", direction: "down" }),
} satisfies CommandDef

export const blockEditCommands: CommandDef[] = [navigateUp, navigateDown]
