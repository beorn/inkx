/**
 * Help Overlay Component
 *
 * Full-screen modal showing keyboard shortcuts.
 * Dismissable with Esc or ?
 */

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
      { key: "Enter", desc: "Zoom into card (make it new root)" },
      { key: "Backspace", desc: "Zoom out (back to previous root)" },
      { key: "o", desc: "Open source file in $EDITOR" },
      { key: "e", desc: "Edit current card at line in $EDITOR" },
      { key: "u", desc: "Go up to parent node" },
      { key: "[/]", desc: "History back/forward" },
      { key: "Esc", desc: "Clear selection / quit" },
    ],
  },
  {
    category: "Card Operations",
    keys: [
      { key: "Space", desc: "Cycle task status (todo→wip→done→dropped)" },
      { key: "x", desc: "Toggle done (quick done/todo toggle)" },
      { key: "d", desc: "Delete card" },
      { key: "Tab", desc: "Indent (make child of item above)" },
      { key: "Shift+Tab", desc: "Outdent (make sibling of parent)" },
      { key: "Alt+h/j/k/l", desc: "Move card (vim style)" },
      { key: "Alt+1-9", desc: "Move card to column 1-9" },
    ],
  },
  {
    category: "View Controls",
    keys: [
      { key: "v", desc: "Cycle view mode (cards/list/columns/tabs)" },
      { key: "i", desc: "Toggle detail pane (show card info)" },
      { key: "z/Z", desc: "Fold/unfold all cards in column" },
      { key: "c", desc: "Toggle column collapse" },
      { key: "</>", desc: "Decrease/increase outline depth" },
      { key: "+/-", desc: "Increase/decrease content lines" },
    ],
  },
  {
    category: "Selection",
    keys: [
      { key: "Shift+A", desc: "Select all (progressive: column→board)" },
      { key: "Shift+j/k", desc: "Extend selection up/down" },
    ],
  },
  {
    category: "General",
    keys: [
      { key: "?", desc: "Toggle this help" },
      { key: "/", desc: "Search mode" },
      { key: "p", desc: "Project picker" },
      { key: "q", desc: "Quit" },
    ],
  },
];

// Calculate max key width across all shortcuts
const maxKeyWidth = Math.max(
  ...shortcuts.flatMap((cat) => cat.keys.map((k) => k.key.length)),
);

export function HelpOverlay({ width, height }: HelpOverlayProps) {
  // Calculate content dimensions
  const contentLines = shortcuts.reduce(
    (acc, cat) => acc + cat.keys.length + 2, // category header + blank line
    4, // title + header padding + footer
  );
  const boxWidth = Math.min(70, width - 8);
  const boxHeight = Math.min(contentLines, height - 4);

  // Center the box
  const marginLeft = Math.floor((width - boxWidth) / 2);
  const marginTop = Math.floor((height - boxHeight) / 2);

  // Content width inside the border
  const contentWidth = boxWidth - 4;

  // Helper to pad text to full width
  const padLine = (text: string, indent: number = 1): string => {
    const prefix = " ".repeat(indent);
    const availableWidth = contentWidth - indent;
    const content =
      text.length <= availableWidth ? text : text.slice(0, availableWidth);
    return (
      prefix +
      content +
      " ".repeat(Math.max(0, availableWidth - content.length + 1))
    );
  };

  return (
    <box
      position="absolute"
      marginLeft={marginLeft}
      marginTop={marginTop}
      flexDirection="column"
      width={boxWidth}
      border
      borderStyle="double"
      borderColor="cyan"
      backgroundColor="black"
    >
      {/* Top padding */}
      <text backgroundColor="black">{padLine("", 0)}</text>

      {/* Header */}
      <text backgroundColor="black" color="cyan" bold>
        {padLine(
          "Keyboard Shortcuts"
            .padStart(Math.floor((contentWidth + 18) / 2))
            .padEnd(contentWidth),
          0,
        )}
      </text>
      <text backgroundColor="black">{padLine("", 0)}</text>

      {shortcuts.map((category) => (
        <box key={category.category} flexDirection="column">
          <text bold color="white" backgroundColor="black">
            {padLine(category.category)}
          </text>
          {category.keys.map((shortcut) => (
            <text key={shortcut.key} backgroundColor="black">
              <text color="yellow" backgroundColor="black">
                {"  "}
                {shortcut.key.padEnd(maxKeyWidth + 2)}
              </text>
              <text dimColor backgroundColor="black">
                {shortcut.desc.padEnd(
                  Math.max(0, contentWidth - maxKeyWidth - 4),
                )}
              </text>
            </text>
          ))}
          <text backgroundColor="black">{padLine("")}</text>
        </box>
      ))}

      <text backgroundColor="black" dimColor>
        {padLine(
          "Press ? or Esc to close"
            .padStart(Math.floor((contentWidth + 22) / 2))
            .padEnd(contentWidth),
          0,
        )}
      </text>

      {/* Bottom padding */}
      <text backgroundColor="black">{padLine("", 0)}</text>
    </box>
  );
}

export default HelpOverlay;
