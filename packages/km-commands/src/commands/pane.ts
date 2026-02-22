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

// Spatial navigation (Ctrl+W chord)
const paneFocusLeft = {
  id: "pane_focus_left",
  name: "Focus Left Pane",
  description: "Move focus to the pane on the left",
  category: "Navigation",
  shortcuts: ["Ctrl+W h"],
  execute: () => ({ type: "PANE_FOCUS", direction: "left" }),
} satisfies CommandDef

const paneFocusDown = {
  id: "pane_focus_down",
  name: "Focus Down Pane",
  description: "Move focus to the pane below",
  category: "Navigation",
  shortcuts: ["Ctrl+W j"],
  execute: () => ({ type: "PANE_FOCUS", direction: "down" }),
} satisfies CommandDef

const paneFocusUp = {
  id: "pane_focus_up",
  name: "Focus Up Pane",
  description: "Move focus to the pane above",
  category: "Navigation",
  shortcuts: ["Ctrl+W k"],
  execute: () => ({ type: "PANE_FOCUS", direction: "up" }),
} satisfies CommandDef

const paneFocusRight = {
  id: "pane_focus_right",
  name: "Focus Right Pane",
  description: "Move focus to the pane on the right",
  category: "Navigation",
  shortcuts: ["Ctrl+W l"],
  execute: () => ({ type: "PANE_FOCUS", direction: "right" }),
} satisfies CommandDef

// Previous pane toggle
const paneFocusPrevious = {
  id: "pane_focus_previous",
  name: "Previous Pane",
  description: "Toggle between last two focused panes",
  category: "Navigation",
  shortcuts: ["Ctrl+W p"],
  execute: () => ({ type: "PANE_FOCUS_PREVIOUS" }),
} satisfies CommandDef

// Tab cycling
const paneFocusNext = {
  id: "pane_focus_next",
  name: "Next Pane",
  description: "Cycle focus to next pane",
  category: "Navigation",
  shortcuts: ["Ctrl+W Tab"],
  execute: () => ({ type: "PANE_FOCUS_CYCLE", direction: "next" }),
} satisfies CommandDef

const paneFocusPrev = {
  id: "pane_focus_prev",
  name: "Prev Pane",
  description: "Cycle focus to previous pane",
  category: "Navigation",
  shortcuts: ["Ctrl+W Shift+Tab"],
  execute: () => ({ type: "PANE_FOCUS_CYCLE", direction: "prev" }),
} satisfies CommandDef

export const paneCommands: CommandDef[] = [
  splitVertical,
  splitHorizontal,
  closePane,
  paneFocusLeft,
  paneFocusDown,
  paneFocusUp,
  paneFocusRight,
  paneFocusPrevious,
  paneFocusNext,
  paneFocusPrev,
]
