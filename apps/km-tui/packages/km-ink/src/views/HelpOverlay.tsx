/**
 * Help Overlay Component
 *
 * Displays keyboard shortcuts for the board TUI
 */
import React from "react";
import { Box, Text } from "ink";

interface HelpOverlayProps {
  width: number;
  height: number;
}

// Keyboard shortcuts organized by category
const shortcuts = [
  {
    category: "Navigation",
    keys: [
      { key: "h/l or ←/→", desc: "Move between columns" },
      { key: "j/k or ↓/↑", desc: "Move between cards" },
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
      { key: "1-5", desc: "Set priority (in detail pane)" },
      { key: "D", desc: "Delete card (symlinks: remove from board only)" },
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
];

// Calculate max key width across all shortcuts
const maxKeyWidth = Math.max(
  ...shortcuts.flatMap((cat) => cat.keys.map((k) => k.key.length)),
);

export function HelpOverlay({ width, height }: HelpOverlayProps) {
  // Calculate content dimensions - more padding around the box
  const boxWidth = Math.min(70, width - 8);
  const boxHeight = Math.min(
    shortcuts.reduce((acc, cat) => acc + cat.keys.length + 3, 4), // Extra lines for internal padding
    height - 6,
  );

  // Center the box
  const marginLeft = Math.floor((width - boxWidth) / 2);
  const marginTop = Math.floor((height - boxHeight) / 2);

  // Content width inside the border (with internal padding)
  const contentWidth = boxWidth - 4; // Account for border + internal padding

  // Create full-width line with black background
  const bgLine = (text: string, indent = 1) => {
    const w = contentWidth - indent;
    const content = text.slice(0, w);
    return " ".repeat(indent) + content.padEnd(w + 1);
  };

  // Center text within contentWidth
  const centerText = (text: string) =>
    text.padStart((contentWidth + text.length) / 2).padEnd(contentWidth);

  return (
    <Box
      position="absolute"
      marginLeft={marginLeft}
      marginTop={marginTop}
      flexDirection="column"
      width={boxWidth}
      borderStyle="double"
      borderColor="cyan"
    >
      {/* Top padding */}
      <Text backgroundColor="black">{bgLine("", 0)}</Text>

      {/* Header */}
      <Text backgroundColor="black" color="cyan" bold>
        {bgLine(
          "Keyboard Shortcuts"
            .padStart(Math.floor((contentWidth + 18) / 2))
            .padEnd(contentWidth),
          0,
        )}
      </Text>
      <Text backgroundColor="black">{bgLine("", 0)}</Text>

      {shortcuts.map((category) => (
        <Box key={category.category} flexDirection="column">
          <Text bold color="white" backgroundColor="black">
            {bgLine(category.category)}
          </Text>
          {category.keys.map((shortcut) => {
            return (
              <Text key={shortcut.key} backgroundColor="black">
                <Text color="yellow" backgroundColor="black">
                  {"  "}
                  {shortcut.key.padEnd(maxKeyWidth + 2)}
                </Text>
                <Text dimColor backgroundColor="black">
                  {shortcut.desc.padEnd(
                    Math.max(0, contentWidth - maxKeyWidth - 4),
                  )}
                </Text>
              </Text>
            );
          })}
          <Text backgroundColor="black">{bgLine("")}</Text>
        </Box>
      ))}

      <Text backgroundColor="black" dimColor>
        {bgLine(
          "Press ? or Esc to close"
            .padStart(Math.floor((contentWidth + 22) / 2))
            .padEnd(contentWidth),
          0,
        )}
      </Text>

      {/* Bottom padding */}
      <Text backgroundColor="black">{bgLine("", 0)}</Text>
    </Box>
  );
}
