/**
 * Context-sensitive key hint bar.
 *
 * Shows mode-specific keyboard shortcut hints in a compact single-line format.
 * Adapts to current editing mode: NODE, TEXT, VISUAL, or PANE.
 */

import React from "react"
import { Box, Strong, Text, useFocusManager } from "@silvery/react"
import { type PaneUI, getEditMode } from "../ui-reducer.ts"
import { isDetailPaneId } from "../board-types.ts"

/** A single key hint: key label + action description */
interface KeyHint {
  key: string
  action: string
}

/** Display mode for the key bar */
type KeyBarMode = "NODE" | "TEXT" | "VISUAL" | "PANE"

const NODE_HINTS: KeyHint[] = [
  { key: "j/k", action: "\u2195" },
  { key: "h/l", action: "\u2194" },
  { key: "i", action: "edit" },
  { key: "o", action: "new" },
  { key: "d", action: "cut" },
  { key: "x", action: "done" },
  { key: "Space", action: "sel" },
  { key: "?", action: "help" },
]

const TEXT_HINTS: KeyHint[] = [
  { key: "Esc", action: "exit" },
  { key: "C-a", action: "start" },
  { key: "C-e", action: "end" },
  { key: "C-k", action: "kill" },
  { key: "@ # [[", action: "auto" },
]

const VISUAL_HINTS: KeyHint[] = [
  { key: "j/k", action: "extend" },
  { key: "d", action: "cut" },
  { key: "y", action: "copy" },
  { key: "m·a", action: "archive" },
  { key: "Esc", action: "cancel" },
]

const PANE_HINTS: KeyHint[] = [
  { key: "j/k", action: "\u2195" },
  { key: "Enter", action: "edit" },
  { key: "Space", action: "sel" },
  { key: "D", action: "close" },
  { key: "t\u2026", action: "task" },
  { key: "?", action: "help" },
]

/** Multi-selection hints override normal NODE hints */
const MULTI_HINTS: KeyHint[] = [
  { key: "d", action: "cut" },
  { key: "y", action: "copy" },
  { key: "m·a", action: "archive" },
  { key: "x", action: "done" },
  { key: "Space", action: "toggle" },
  { key: "Esc", action: "clear" },
]

function getKeyBarMode(ui: PaneUI, isDetailPaneFocused: boolean): KeyBarMode {
  const editMode = getEditMode(ui)
  if (editMode === "text") return "TEXT"
  if (ui.visualMode) return "VISUAL"
  if (isDetailPaneFocused) return "PANE"
  return "NODE"
}

function getHints(mode: KeyBarMode, hasMultiSelection: boolean): KeyHint[] {
  if (mode === "NODE" && hasMultiSelection) return MULTI_HINTS
  switch (mode) {
    case "TEXT":
      return TEXT_HINTS
    case "VISUAL":
      return VISUAL_HINTS
    case "PANE":
      return PANE_HINTS
    default:
      return NODE_HINTS
  }
}

interface KeyBarProps {
  ui: PaneUI
  termWidth: number
}

export function KeyBar({ ui, termWidth }: KeyBarProps): React.ReactElement {
  const { activeScopeId } = useFocusManager()
  const mode = getKeyBarMode(ui, activeScopeId !== null && isDetailPaneId(activeScopeId))
  const hints = getHints(mode, ui.multiSelected.size > 0)

  return (
    <Box flexDirection="row" flexShrink={0} width={termWidth} id="key-bar">
      {/* Mode indicator */}
      <Text dimColor>{"\u2500\u2500 "}</Text>
      <Strong id="key-bar-mode">{mode}</Strong>
      <Text dimColor>{" \u2500\u2500\u2500\u2500 "}</Text>
      {/* Key hints */}
      {hints.map((hint, i) => (
        <React.Fragment key={hint.key}>
          {i > 0 && <Text dimColor>{"  "}</Text>}
          <Text dimColor>{hint.key}</Text>
          <Text> {hint.action}</Text>
        </React.Fragment>
      ))}
    </Box>
  )
}
