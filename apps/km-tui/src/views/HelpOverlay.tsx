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
// NOTE: Keep in sync with packages/km-commands/src/keybindings.ts
// Key format: macOS modifier icons (⌃ ⇧ ⌥), dim "/" separators
const shortcuts = [
  {
    category: "Navigation",
    keys: [
      { key: "h / l (← / →)", desc: "Move between columns" },
      { key: "j / k (↓ / ↑)", desc: "Move between cards" },
      { key: "gg / G", desc: "Go to first / last card" },
      { key: "Enter", desc: "Edit title inline (↑↓ to move blocks)" },
      { key: "e / i / u", desc: "Zoom to / in / out" },
      { key: "P / ⌃Enter", desc: "Follow embedded link" },
      { key: "o / O", desc: "Open / open in terminal" },
      { key: "[ / ]", desc: "History back / forward" },
      { key: "⌃J / ⌃K", desc: "Navigate to sibling board" },
      { key: "⌃D / ⌃U", desc: "Page down / up (half page)" },
      { key: "/", desc: "Search items" },
      { key: "gp", desc: "Project picker" },
      { key: "gn", desc: "New item dialog" },
      { key: "⇧1-9", desc: "Jump to column 1-9" },
      { key: "1-9", desc: "Jump to favorite board" },
      { key: "Esc", desc: "Close pane / exit mode / quit" },
    ],
  },
  {
    category: "Editing",
    keys: [
      { key: "n / p", desc: "Insert item below / above" },
      { key: "d", desc: "Duplicate item" },
      { key: "Backspace / Del", desc: "Delete item" },
      { key: "x", desc: "Cycle task status" },
      { key: "m", desc: "Enter move mode (Enter to confirm)" },
      { key: "⌥hjkl / ⌥↑↓←→", desc: "Shift item" },
      { key: "Tab / ⇧Tab", desc: "Indent / outdent" },
      { key: "⌃Z / ⌃⇧Z", desc: "Undo / redo" },
      { key: "td / ts / tr", desc: "Date due / start / recur" },
      { key: "sp", desc: "Cycle priority (P1-P4)" },
      { key: "sr", desc: "Rename node" },
      { key: "sl / sa", desc: "Set label / assignee" },
    ],
  },
  {
    category: "View",
    keys: [
      { key: "v / V", desc: "Cycle view / cycle icon style" },
      { key: "Space / ⌃I", desc: "Toggle detail pane" },
      { key: "< / >", desc: "Decrease / increase outline depth" },
      { key: "+ / -", desc: "Increase / decrease content lines" },
      { key: "za / z / Z", desc: "Toggle fold / fold all / unfold all" },
      { key: "c", desc: "Collapse column" },
      { key: "C", desc: "Ignore node" },
      { key: "gC", desc: "Reveal ignored nodes" },
      { key: "\\", desc: "Filter items" },
      { key: "`", desc: "Toggle console" },
    ],
  },
  {
    category: "Selection & General",
    keys: [
      { key: "⇧A / ⌃A", desc: "Select all (progressive / instant)" },
      { key: "⇧hjkl / ⇧↑↓←→", desc: "Extend selection" },
      { key: "?", desc: "Toggle this help" },
      { key: "q", desc: "Quit" },
    ],
  },
]

/**
 * Render key text with dimmed "/" separators for visual clarity.
 * Keys are yellow, " / " separators (space-slash-space) are dim.
 * A bare "/" key (e.g., for search) renders yellow, not as a separator.
 */
function KeyText({ text, width }: { text: string; width: number }) {
  const padded = text.padEnd(width)
  // Split on " / " (space-slash-space) to distinguish separators from "/" as a key
  const parts = padded.split(" / ")
  if (parts.length === 1) {
    return <Text color="yellow">{padded}</Text>
  }
  return (
    <>
      {parts.map((part, i) => (
        <React.Fragment key={i}>
          {i > 0 && (
            <>
              <Text color="yellow"> </Text>
              <Text dimColor>/</Text>
              <Text color="yellow"> </Text>
            </>
          )}
          <Text color="yellow">{part}</Text>
        </React.Fragment>
      ))}
    </>
  )
}

// Calculate max key width across all shortcuts
const maxKeyWidth = Math.max(...shortcuts.flatMap((cat) => cat.keys.map((k) => k.key.length)))

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
    <Box position="absolute" marginLeft={marginLeft} marginTop={marginTop} data-dialog="help">
      <ModalDialog borderColor="cyan" width={boxWidth} title="Keyboard Shortcuts" footer="Press ? or Esc to close">
        {shortcuts.map((category) => (
          <Box key={category.category} flexDirection="column">
            <Text bold color="white">
              {category.category}
            </Text>
            {category.keys.map((shortcut) => (
              <Text key={shortcut.key}>
                {"  "}
                <KeyText text={shortcut.key} width={maxKeyWidth + 2} />
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
