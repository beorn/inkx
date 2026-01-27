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
      { key: "/", desc: "Search items (by content or #tags)" },
      { key: "Shift+1-9", desc: "Jump to column 1-9" },
      { key: "1-9", desc: "Jump to favorite (@inbox, @next, ...)" },
      { key: "g/G", desc: "Go to first/last card" },
      { key: "Enter", desc: "Open detail pane" },
      { key: "o", desc: "Open item in context (grandparent view)" },
      { key: "u", desc: "Go up to parent node" },
      { key: "[/]", desc: "History back/forward" },
      { key: "Esc", desc: "Close pane / exit mode / quit" },
    ],
  },
  {
    category: "Card Operations",
    keys: [
      { key: "Opt+hjkl", desc: "Move card (vim style)" },
      { key: "Opt+↑/↓/←/→", desc: "Move card (arrows)" },
      { key: "Opt+1-9", desc: "Move card to top of column 1-9" },
      { key: "Tab", desc: "Indent (make child of item above)" },
      { key: "Shift+Tab", desc: "Outdent (make sibling of parent)" },
      { key: "p", desc: "Open project picker (move to project)" },
      { key: "Space", desc: "Cycle task status" },
      { key: "D", desc: "Delete card (links: remove from board only)" },
    ],
  },
  {
    category: "View Controls",
    keys: [
      { key: "v", desc: "Cycle view mode (cards/columns/list/tabs)" },
      { key: "+/-", desc: "Increase/decrease outline depth" },
      { key: "z/Z", desc: "Fold all / unfold all cards in column" },
      { key: "c", desc: "Toggle column collapse" },
    ],
  },
  {
    category: "Selection",
    keys: [
      { key: "Shift+A", desc: "Select all (progressive: card→column→board)" },
      { key: "Shift + j/k", desc: "Extend selection up/down" },
      { key: "Shift + h/l", desc: "Extend selection across columns" },
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

  // Content width inside the border (with 2-space padding)
  const contentWidth = Math.max(10, boxWidth - 8) // Account for border + paddingX(2)

  // Center text within contentWidth
  const centerText = (text: string) => {
    const paddedLen = Math.max(0, Math.floor((contentWidth + text.length) / 2))
    return text.padStart(paddedLen).padEnd(Math.max(paddedLen, contentWidth))
  }

  return (
    <Box position="absolute" marginLeft={marginLeft} marginTop={marginTop}>
      <ModalDialog borderColor="cyan" width={boxWidth}>
        {/* Header */}
        <Text> </Text>
        <Text color="cyan" bold>
          {centerText("Keyboard Shortcuts")}
        </Text>
        <Text> </Text>

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

        <Text dimColor>{centerText("Press ? or Esc to close")}</Text>
        <Text> </Text>
      </ModalDialog>
    </Box>
  )
}
