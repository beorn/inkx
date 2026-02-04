/**
 * Help Overlay Component
 *
 * Displays keyboard shortcuts for the board TUI
 */
import React from "react"
import { Box, Text } from "inkx"
import { ModalDialog } from "./shared-components.tsx"

interface HelpOverlayProps {
  width: number
  height: number
}

// Keyboard shortcuts organized by category
const shortcuts = [
  {
    category: "Navigation",
    keys: [
      { key: "h/l or ←/→", desc: "Move between columns" },
      { key: "j/k or ↓/↑", desc: "Move between cards" },
      { key: "g/G", desc: "Go to first/last card" },
      { key: "Enter", desc: "Open detail pane" },
      { key: "o", desc: "Zoom to item (focus on node)" },
      { key: "i", desc: "Zoom inwards (one level closer)" },
      { key: "u", desc: "Zoom outwards (to parent)" },
      { key: "[/]", desc: "History back/forward" },
      { key: "Ctrl+J/K", desc: "Navigate to sibling board" },
      { key: "Ctrl+D/U", desc: "Page down/up (half page)" },
      { key: "Shift+1-9", desc: "Jump to column 1-9" },
      { key: "1-9", desc: "Jump to favorite board" },
      { key: "/", desc: "Search items" },
      { key: "p", desc: "Open project picker" },
      { key: "n", desc: "New item dialog" },
      { key: "Esc", desc: "Close pane / exit mode / quit" },
    ],
  },
  {
    category: "Editing",
    keys: [
      { key: "Opt+hjkl", desc: "Move card (vim style)" },
      { key: "Opt+↑/↓/←/→", desc: "Move card (arrows)" },
      { key: "Tab", desc: "Indent (make child of item above)" },
      { key: "Shift+Tab", desc: "Outdent (make sibling of parent)" },
      { key: "D", desc: "Delete card" },
      { key: "Ctrl+Z", desc: "Undo" },
      { key: "Ctrl+Shift+Z", desc: "Redo" },
    ],
  },
  {
    category: "Tasks",
    keys: [{ key: "Space", desc: "Cycle task status (todo→wip→done→dropped)" }],
  },
  {
    category: "View",
    keys: [
      { key: "v", desc: "Cycle view mode (cards/columns/list/tabs)" },
      { key: "</>", desc: "Decrease/increase outline depth" },
      { key: "+/-", desc: "Increase/decrease content lines" },
      { key: "z", desc: "Fold/unfold current card" },
      { key: "Z", desc: "Fold all cards in column" },
      { key: "Shift+Z", desc: "Unfold all cards in column" },
      { key: "c", desc: "Toggle column collapse" },
    ],
  },
  {
    category: "Selection",
    keys: [
      { key: "Shift+A", desc: "Select all (progressive: card→column→board)" },
      { key: "Shift+hjkl", desc: "Extend selection" },
      { key: "Shift+arrows", desc: "Extend selection" },
    ],
  },
  {
    category: "General",
    keys: [
      { key: "?", desc: "Toggle this help" },
      { key: "q", desc: "Quit" },
    ],
  },
]

// Calculate max key width across all shortcuts
const maxKeyWidth = Math.max(
  ...shortcuts.flatMap((cat) => cat.keys.map((k) => k.key.length)),
)

// Minimum dimensions to render the overlay
const MIN_WIDTH = 30
const MIN_HEIGHT = 10

export function HelpOverlay({ width, height }: HelpOverlayProps) {
  // Guard against invalid dimensions - render fallback if too small
  if (width < MIN_WIDTH || height < MIN_HEIGHT) {
    return (
      <Box
        position="absolute"
        marginLeft={Math.max(0, Math.floor((width - 20) / 2))}
        marginTop={Math.max(0, Math.floor((height - 3) / 2))}
        flexDirection="column"
        borderStyle="single"
        borderColor="cyan"
        data-dialog="help"
      >
        <Text color="cyan">Terminal too small</Text>
        <Text dimColor>Press ? or Esc</Text>
      </Box>
    )
  }

  // Calculate content dimensions - more padding around the box
  // Use Math.max to ensure positive values
  const boxWidth = Math.max(MIN_WIDTH, Math.min(70, width - 8))
  const boxHeight = Math.max(
    MIN_HEIGHT,
    Math.min(
      shortcuts.reduce((acc, cat) => acc + cat.keys.length + 3, 4), // Extra lines for internal padding
      height - 6,
    ),
  )

  // Center the box - ensure non-negative margins
  const marginLeft = Math.max(0, Math.floor((width - boxWidth) / 2))
  const marginTop = Math.max(0, Math.floor((height - boxHeight) / 2))

  return (
    <Box
      position="absolute"
      marginLeft={marginLeft}
      marginTop={marginTop}
      data-dialog="help"
    >
      <ModalDialog
        borderColor="cyan"
        width={boxWidth}
        title="Keyboard Shortcuts"
        footer="Press ? or Esc to close"
      >
        {shortcuts.map((category) => (
          <Box key={category.category} flexDirection="column">
            <Text bold color="white">
              {category.category}
            </Text>
            {category.keys.map((shortcut) => (
              <Text key={shortcut.key}>
                <Text color="yellow">
                  {"  "}
                  {shortcut.key.padEnd(maxKeyWidth + 2)}
                </Text>
                <Text dimColor>{shortcut.desc}</Text>
              </Text>
            ))}
            <Text> </Text>
          </Box>
        ))}
      </ModalDialog>
    </Box>
  )
}
