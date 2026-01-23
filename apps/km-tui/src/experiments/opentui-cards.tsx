/**
 * OpenTUI Cards Prototype - Testing scrollbox and layout capabilities
 *
 * Run with: nix develop -c bun apps/km-cli/src/tui/experiments/opentui-cards.tsx
 *
 * Goals:
 * 1. Test if scrollbox handles overflow properly (clips from bottom, not top)
 * 2. Test if we can access scroll position for indicators
 * 3. Test column width distribution
 * 4. Compare code complexity to Ink implementation
 */

import { createCliRenderer, type ScrollBoxRenderable } from "@opentui/core";
import { createRoot, useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useState, useRef, useEffect } from "react";

// Mock card data - similar structure to our real cards
// Adding many more to test scrolling behavior
const mockCards = [
  { id: 1, title: "Implement user authentication flow", status: "todo" },
  { id: 2, title: "Fix database connection pooling issue", status: "todo" },
  { id: 3, title: "Add unit tests for payment module", status: "todo" },
  { id: 4, title: "Review PR #234 - API refactoring", status: "in_progress" },
  {
    id: 5,
    title: "Update documentation for new endpoints",
    status: "in_progress",
  },
  { id: 6, title: "Deploy staging environment", status: "done" },
  { id: 7, title: "Configure CI/CD pipeline", status: "done" },
  { id: 8, title: "Optimize image loading performance", status: "todo" },
  { id: 9, title: "Implement dark mode toggle", status: "todo" },
  { id: 10, title: "Add error boundary components", status: "in_progress" },
  { id: 11, title: "Write integration tests", status: "todo" },
  { id: 12, title: "Refactor legacy auth code", status: "todo" },
  // More cards to test scrolling
  { id: 13, title: "Set up monitoring dashboards", status: "todo" },
  { id: 14, title: "Implement rate limiting", status: "todo" },
  { id: 15, title: "Add Redis caching layer", status: "todo" },
  { id: 16, title: "Create admin panel UI", status: "todo" },
  { id: 17, title: "Migrate to PostgreSQL", status: "todo" },
  { id: 18, title: "Set up staging database", status: "todo" },
  { id: 19, title: "Write API documentation", status: "todo" },
  { id: 20, title: "Implement WebSocket support", status: "todo" },
  { id: 21, title: "Add file upload feature", status: "in_progress" },
  { id: 22, title: "Create email templates", status: "in_progress" },
  { id: 23, title: "Set up A/B testing", status: "done" },
  { id: 24, title: "Implement search functionality", status: "done" },
];

// Simple card component
function Card({ title, isSelected }: { title: string; isSelected: boolean }) {
  return (
    <box
      border
      borderStyle="single"
      borderColor={isSelected ? "cyan" : "white"}
      width="100%"
      paddingLeft={1}
      paddingRight={1}
    >
      <text color={isSelected ? "cyan" : "white"}>{title}</text>
    </box>
  );
}

// Estimated card height (border top + content + border bottom)
const CARD_HEIGHT = 3;

// Column with scrollbox - the key test!
function Column({
  title,
  cards,
  selectedIndex,
  isActive,
}: {
  title: string;
  cards: typeof mockCards;
  selectedIndex: number;
  isActive: boolean;
}) {
  const scrollboxRef = useRef<ScrollBoxRenderable>(null);

  // Scroll to keep selected card visible
  useEffect(() => {
    if (!isActive || !scrollboxRef.current) return;

    const scrollbox = scrollboxRef.current;
    const targetScrollTop = selectedIndex * CARD_HEIGHT;

    // Simple scroll-to: center the selected card
    scrollbox.scrollTo(targetScrollTop);
  }, [selectedIndex, isActive]);

  return (
    <box flexDirection="column" flexGrow={1} height="100%">
      {/* Header */}
      <box paddingLeft={1}>
        <text bold color={isActive ? "cyan" : "white"}>
          {title} ({cards.length})
        </text>
      </box>

      {/* Scrollable content with ref for programmatic scrolling */}
      <scrollbox ref={scrollboxRef} flexGrow={1}>
        {cards.map((card, i) => (
          <Card
            key={card.id}
            title={card.title}
            isSelected={isActive && i === selectedIndex}
          />
        ))}
      </scrollbox>
    </box>
  );
}

function App() {
  const { width, height } = useTerminalDimensions();
  const [selectedColumn, setSelectedColumn] = useState(0);
  const [selectedCard, setSelectedCard] = useState(0);

  // Group cards by status
  const columns = [
    { title: "Todo", cards: mockCards.filter((c) => c.status === "todo") },
    {
      title: "In Progress",
      cards: mockCards.filter((c) => c.status === "in_progress"),
    },
    { title: "Done", cards: mockCards.filter((c) => c.status === "done") },
  ];

  // Keyboard navigation
  useKeyboard(({ key, name }) => {
    if (name === "escape" || key === "q") {
      process.exit(0);
    }

    const currentColumn = columns[selectedColumn];

    if (name === "down" || key === "j") {
      setSelectedCard((prev) =>
        Math.min(prev + 1, currentColumn.cards.length - 1),
      );
    } else if (name === "up" || key === "k") {
      setSelectedCard((prev) => Math.max(prev - 1, 0));
    } else if (name === "right" || key === "l") {
      setSelectedColumn((prev) => {
        const newCol = Math.min(prev + 1, columns.length - 1);
        setSelectedCard(0); // Reset card selection when changing columns
        return newCol;
      });
    } else if (name === "left" || key === "h") {
      setSelectedColumn((prev) => {
        const newCol = Math.max(prev - 1, 0);
        setSelectedCard(0);
        return newCol;
      });
    }
  });

  return (
    <box flexDirection="column" width={width} height={height}>
      {/* Title bar */}
      <box paddingLeft={1} paddingBottom={1}>
        <text bold>OpenTUI Cards Prototype</text>
        <text color="gray"> | q to quit | hjkl to navigate</text>
      </box>

      {/* Columns container */}
      <box flexDirection="row" flexGrow={1}>
        {columns.map((col, i) => (
          <Column
            key={col.title}
            title={col.title}
            cards={col.cards}
            selectedIndex={selectedCard}
            isActive={i === selectedColumn}
          />
        ))}
      </box>

      {/* Status bar */}
      <box paddingLeft={1} paddingTop={1}>
        <text color="gray">
          Terminal: {width}x{height} | Column: {selectedColumn + 1}/
          {columns.length} | Card: {selectedCard + 1}/
          {columns[selectedColumn].cards.length}
        </text>
      </box>
    </box>
  );
}

const renderer = await createCliRenderer({
  exitOnCtrlC: true,
});
createRoot(renderer).render(<App />);
