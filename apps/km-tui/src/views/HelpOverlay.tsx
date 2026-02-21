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
      { key: "J / K", desc: "Block navigation (auto-unfolds)" },
      { key: "g / G", desc: "Go to first / last card" },
      { key: "i / Enter", desc: "Edit inline (i at start, Enter at end)" },
      { key: "z / Z", desc: "Zoom in / out one level" },
      { key: "P", desc: "Smart pane toggle (open/focus/close)" },
      { key: "⌃Enter", desc: "Follow embedded link" },
      { key: "{ / }", desc: "History back / forward" },
      { key: "⌃J / ⌃K", desc: "Navigate to sibling board" },
      { key: "⌃D / ⌃U", desc: "Page down / up (half page)" },
      { key: "/", desc: "Search items" },
      { key: ":", desc: "Command palette" },
      { key: "1-9", desc: "Jump to favorite board" },
      { key: "Esc", desc: "Close pane / exit mode / quit" },
    ],
  },
  {
    category: "Editing",
    keys: [
      { key: "o / O", desc: "Insert item below / above" },
      { key: "d", desc: "Cut (yank + delete)" },
      { key: "y", desc: "Copy (yank)" },
      { key: "p", desc: "Paste" },
      { key: "Backspace / Del", desc: "Delete item" },
      { key: "x / X", desc: "Toggle done / cycle status" },
      { key: "e", desc: "Archive" },
      { key: "c / C", desc: "Capture to inbox / with dialog" },
      { key: "u / U", desc: "Undo / redo" },
      { key: "mm", desc: "Enter move mode (Enter to confirm)" },
      { key: "⌘hjkl / ⌥↑↓←→", desc: "Shift item" },
      { key: "Tab / ⇧Tab", desc: "Indent / outdent" },
    ],
  },
  {
    category: "Chords",
    keys: [
      { key: "g…", desc: "Go-to (gi inbox, gj today, gh home, ge archive)" },
      { key: "go / gO", desc: "Open in system / terminal" },
      { key: "gp / gn", desc: "Project picker / new item dialog" },
      { key: "gc / gC", desc: "Collapse column / show ignored" },
      { key: "m…", desc: "Move-to (mi inbox, mj today, mh home, mp picker)" },
      { key: "t…", desc: "Task (td due, ts start, t! pri, to owner, tl label)" },
    ],
  },
  {
    category: "View",
    keys: [
      { key: "V", desc: "Cycle icon style" },
      { key: "H / L", desc: "Fold / unfold subtree" },
      { key: "< / >", desc: "Fold all / unfold all" },
      { key: "+ / -", desc: "Increase / decrease content lines" },
      { key: "D", desc: "Toggle hide done" },
      { key: "⌃/", desc: "Filter items" },
      { key: ",", desc: "Settings" },
      { key: "`", desc: "Toggle console" },
    ],
  },
  {
    category: "Selection",
    keys: [
      { key: "Space", desc: "Toggle selection" },
      { key: "v", desc: "Enter visual mode (hjkl to extend)" },
      { key: "⇧A / ⌃A", desc: "Select all (progressive / instant)" },
      { key: "⇧↑↓←→", desc: "Extend selection" },
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
        borderColor="white"
        data-dialog="help"
      >
        <Text color="white">Terminal too small</Text>
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
      <ModalDialog width={boxWidth} title="Keyboard Shortcuts" footer="Press ? or Esc to close">
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
