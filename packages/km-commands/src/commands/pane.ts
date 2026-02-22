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

// Resize
const paneResizeGrow = {
  id: "pane_resize_grow",
  name: "Grow Pane",
  description: "Increase width of the focused pane",
  category: "Navigation",
  shortcuts: ["Ctrl+W >"],
  execute: () => ({ type: "PANE_RESIZE", delta: 0.05 }),
} satisfies CommandDef

const paneResizeShrink = {
  id: "pane_resize_shrink",
  name: "Shrink Pane",
  description: "Decrease width of the focused pane",
  category: "Navigation",
  shortcuts: ["Ctrl+W <"],
  execute: () => ({ type: "PANE_RESIZE", delta: -0.05 }),
} satisfies CommandDef

const paneResizeGrowVertical = {
  id: "pane_resize_grow_vertical",
  name: "Grow Pane Vertical",
  description: "Increase height of the focused pane",
  category: "Navigation",
  shortcuts: ["Ctrl+W +"],
  execute: () => ({ type: "PANE_RESIZE_VERTICAL", delta: 0.05 }),
} satisfies CommandDef

const paneResizeShrinkVertical = {
  id: "pane_resize_shrink_vertical",
  name: "Shrink Pane Vertical",
  description: "Decrease height of the focused pane",
  category: "Navigation",
  shortcuts: ["Ctrl+W -"],
  execute: () => ({ type: "PANE_RESIZE_VERTICAL", delta: -0.05 }),
} satisfies CommandDef

const paneEqualize = {
  id: "pane_equalize",
  name: "Equalize Panes",
  description: "Set all pane splits to equal sizes",
  category: "Navigation",
  shortcuts: ["Ctrl+W ="],
  execute: () => ({ type: "PANE_EQUALIZE" }),
} satisfies CommandDef

// Zoom/maximize toggle
const paneZoom = {
  id: "pane_zoom",
  name: "Zoom Pane",
  description: "Toggle maximize/restore the focused pane",
  category: "Navigation",
  shortcuts: ["Ctrl+W z"],
  execute: () => ({ type: "PANE_ZOOM" }),
} satisfies CommandDef

// Close all but focused
const paneOnly = {
  id: "pane_only",
  name: "Close Other Panes",
  description: "Close all panes except the focused one",
  category: "Navigation",
  shortcuts: ["Ctrl+W o"],
  execute: () => ({ type: "PANE_ONLY" }),
} satisfies CommandDef

// Swap positions
const paneSwapLeft = {
  id: "pane_swap_left",
  name: "Swap Pane Left",
  description: "Swap the focused pane with the pane to the left",
  category: "Navigation",
  shortcuts: ["Ctrl+W H"],
  execute: () => ({ type: "PANE_SWAP", direction: "left" }),
} satisfies CommandDef

const paneSwapDown = {
  id: "pane_swap_down",
  name: "Swap Pane Down",
  description: "Swap the focused pane with the pane below",
  category: "Navigation",
  shortcuts: ["Ctrl+W J"],
  execute: () => ({ type: "PANE_SWAP", direction: "down" }),
} satisfies CommandDef

const paneSwapUp = {
  id: "pane_swap_up",
  name: "Swap Pane Up",
  description: "Swap the focused pane with the pane above",
  category: "Navigation",
  shortcuts: ["Ctrl+W K"],
  execute: () => ({ type: "PANE_SWAP", direction: "up" }),
} satisfies CommandDef

const paneSwapRight = {
  id: "pane_swap_right",
  name: "Swap Pane Right",
  description: "Swap the focused pane with the pane to the right",
  category: "Navigation",
  shortcuts: ["Ctrl+W L"],
  execute: () => ({ type: "PANE_SWAP", direction: "right" }),
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
  paneResizeGrow,
  paneResizeShrink,
  paneResizeGrowVertical,
  paneResizeShrinkVertical,
  paneEqualize,
  paneZoom,
  paneOnly,
  paneSwapLeft,
  paneSwapDown,
  paneSwapUp,
  paneSwapRight,
]
