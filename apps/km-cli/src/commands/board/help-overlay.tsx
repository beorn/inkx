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
      { key: "1-9", desc: "Jump to column 1-9" },
      { key: "g/G", desc: "Go to first/last card" },
      { key: "Tab", desc: "Enter outline mode (navigate within card)" },
      { key: "Enter", desc: "Open detail pane" },
      { key: "o", desc: "Zoom into card (show children as columns)" },
      { key: "u or Esc", desc: "Go back / close pane / exit mode" },
    ],
  },
  {
    category: "Card Operations",
    keys: [
      { key: "Opt+1-9", desc: "Move card to top of column 1-9" },
      { key: "Opt+hjkl", desc: "Move card (vim style)" },
      { key: "Opt + ↑/↓/←/→", desc: "Move card directly" },
      { key: "m + hjkl", desc: "Move card (enter move mode, then direction)" },
      { key: "p", desc: "Open project picker (move to project)" },
      { key: "s or x", desc: "Cycle task status" },
      { key: "1-5", desc: "Set priority (in detail pane)" },
    ],
  },
  {
    category: "View Controls",
    keys: [
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

export function HelpOverlay({ width, height }: HelpOverlayProps) {
  // Calculate content dimensions
  const boxWidth = Math.min(60, width - 4);
  const boxHeight = Math.min(
    shortcuts.reduce((acc, cat) => acc + cat.keys.length + 2, 2),
    height - 4,
  );

  // Center the box
  const marginLeft = Math.floor((width - boxWidth) / 2);
  const marginTop = Math.floor((height - boxHeight) / 2);

  return (
    <Box
      position="absolute"
      marginLeft={marginLeft}
      marginTop={marginTop}
      flexDirection="column"
      width={boxWidth}
      borderStyle="double"
      borderColor="cyan"
      paddingX={1}
    >
      <Box justifyContent="center" marginBottom={1}>
        <Text bold color="cyan">
          Keyboard Shortcuts
        </Text>
      </Box>

      {shortcuts.map((category) => (
        <Box key={category.category} flexDirection="column" marginBottom={1}>
          <Text bold underline>
            {category.category}
          </Text>
          {category.keys.map((shortcut) => (
            <Box key={shortcut.key}>
              <Box width={20}>
                <Text color="yellow">{shortcut.key}</Text>
              </Box>
              <Text dimColor>{shortcut.desc}</Text>
            </Box>
          ))}
        </Box>
      ))}

      <Box justifyContent="center" marginTop={1}>
        <Text dimColor>Press ? or Esc to close</Text>
      </Box>
    </Box>
  );
}
