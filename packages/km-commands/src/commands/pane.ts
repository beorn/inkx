import type { CommandDef } from "../types.ts"

const splitVertical = {
  id: "pane_split_vertical",
  name: "Split Vertical",
  description: "Split current pane vertically (side by side)",
  category: "Navigation",
  shortcuts: ["Ctrl+W v"],
  execute: () => ({ type: "PANE_SPLIT", direction: "vertical" }),
} satisfies CommandDef

const splitHorizontal = {
  id: "pane_split_horizontal",
  name: "Split Horizontal",
  description: "Split current pane horizontally (stacked)",
  category: "Navigation",
  shortcuts: ["Ctrl+W s"],
  execute: () => ({ type: "PANE_SPLIT", direction: "horizontal" }),
} satisfies CommandDef

const closePane = {
  id: "pane_close",
  name: "Close Pane",
  description: "Close the focused pane",
  category: "Navigation",
  shortcuts: ["Ctrl+W q"],
  execute: () => ({ type: "PANE_CLOSE" }),
} satisfies CommandDef

export const paneCommands: CommandDef[] = [splitVertical, splitHorizontal, closePane]
