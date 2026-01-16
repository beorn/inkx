/**
 * OpenTUI Real Data Prototype
 *
 * Tests OpenTUI with actual km-store data to evaluate production viability.
 *
 * Run with: nix develop -c bun apps/km-cli/src/tui/experiments/opentui-real.tsx -r <vault> [file]
 */

import { createCliRenderer, type ScrollBoxRenderable } from "@opentui/core";
import { createRoot, useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useState, useRef, useEffect } from "react";
import { parseArgs } from "util";

// Import km-store functions
import { ensureState, getStore } from "@km/store";
import {
  initBoardState,
  buildBoardState,
  getNodeDisplayName,
} from "../state.ts";
import type { BoardState, ColumnState, CardState } from "../types.ts";

// Parse CLI args
const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    root: { type: "string", short: "r" },
  },
  allowPositionals: true,
});

const vaultPath = values.root;
const targetFile = positionals[0];

if (!vaultPath) {
  console.error("Usage: bun opentui-real.tsx -r <vault-path> [file]");
  process.exit(1);
}

// Initialize store
console.log(`Loading vault: ${vaultPath}`);
ensureState(vaultPath, false);
const store = getStore();
console.log(`Store loaded in ${store.mode} mode: ${store.rootPath}`);

// Initialize board state
const initialState = targetFile ? initBoardState(targetFile) : initBoardState();

if (!initialState) {
  console.error("Could not initialize board state");
  process.exit(1);
}

console.log(`Board initialized with ${initialState.columns.length} columns`);

// Card component using real data
function Card({ card, isSelected }: { card: CardState; isSelected: boolean }) {
  const title = getNodeDisplayName(card.node);
  const childCount = card.children.length;

  return (
    <box
      border
      borderStyle="single"
      borderColor={isSelected ? "cyan" : "white"}
      width="100%"
      paddingLeft={1}
      paddingRight={1}
    >
      <text color={isSelected ? "cyan" : "white"}>
        {title}
        {childCount > 0 ? ` (${childCount})` : ""}
      </text>
    </box>
  );
}

// Estimated card height
const CARD_HEIGHT = 3;

// Column with scrollbox
function Column({
  column,
  selectedIndex,
  isActive,
}: {
  column: ColumnState;
  selectedIndex: number;
  isActive: boolean;
}) {
  const scrollboxRef = useRef<ScrollBoxRenderable>(null);
  const title = getNodeDisplayName(column.node);
  const count = column.cards.length;
  const wipLimit = column.wipLimit;

  // Scroll to keep selected card visible
  useEffect(() => {
    if (!isActive || !scrollboxRef.current) return;
    const scrollbox = scrollboxRef.current;
    const targetScrollTop = selectedIndex * CARD_HEIGHT;
    scrollbox.scrollTo(targetScrollTop);
  }, [selectedIndex, isActive]);

  return (
    <box flexDirection="column" flexGrow={1} height="100%">
      {/* Header with WIP indicator */}
      <box paddingLeft={1}>
        <text bold color={isActive ? "cyan" : "white"}>
          {title} ({count}
          {wipLimit ? `/${wipLimit}` : ""})
        </text>
      </box>

      {/* Scrollable cards */}
      <scrollbox ref={scrollboxRef} flexGrow={1}>
        {column.cards.map((card, i) => (
          <Card
            key={card.node.id}
            card={card}
            isSelected={isActive && i === selectedIndex}
          />
        ))}
      </scrollbox>
    </box>
  );
}

function App({ initialState }: { initialState: BoardState }) {
  const { width, height } = useTerminalDimensions();
  const [state, setState] = useState(initialState);

  // Keyboard navigation
  useKeyboard(({ name, key }) => {
    if (name === "escape" || key === "q") {
      process.exit(0);
    }

    const currentColumn = state.columns[state.colIndex];
    if (!currentColumn) return;

    if (name === "down" || key === "j") {
      setState((s) => ({
        ...s,
        cardIndex: Math.min(s.cardIndex + 1, currentColumn.cards.length - 1),
      }));
    } else if (name === "up" || key === "k") {
      setState((s) => ({
        ...s,
        cardIndex: Math.max(s.cardIndex - 1, 0),
      }));
    } else if (name === "right" || key === "l") {
      setState((s) => ({
        ...s,
        colIndex: Math.min(s.colIndex + 1, s.columns.length - 1),
        cardIndex: 0,
      }));
    } else if (name === "left" || key === "h") {
      setState((s) => ({
        ...s,
        colIndex: Math.max(s.colIndex - 1, 0),
        cardIndex: 0,
      }));
    } else if (key === "g") {
      // Jump to top
      setState((s) => ({ ...s, cardIndex: 0 }));
    } else if (key === "G") {
      // Jump to bottom
      setState((s) => ({
        ...s,
        cardIndex: Math.max(0, currentColumn.cards.length - 1),
      }));
    }
  });

  const currentCol = state.columns[state.colIndex];

  return (
    <box flexDirection="column" width={width} height={height}>
      {/* Title bar */}
      <box paddingLeft={1}>
        <text bold>OpenTUI Real Data</text>
        <text color="gray">
          {" "}
          | {state.rootPath || "root"} | q to quit | hjkl/gG to navigate
        </text>
      </box>

      {/* Columns container */}
      <box flexDirection="row" flexGrow={1}>
        {state.columns.map((col, i) => (
          <Column
            key={col.node.id}
            column={col}
            selectedIndex={state.cardIndex}
            isActive={i === state.colIndex}
          />
        ))}
      </box>

      {/* Status bar */}
      <box paddingLeft={1}>
        <text color="gray">
          {width}x{height} | Col {state.colIndex + 1}/{state.columns.length} |
          Card {state.cardIndex + 1}/{currentCol?.cards.length || 0}
        </text>
      </box>
    </box>
  );
}

// Start the app
const renderer = await createCliRenderer({
  exitOnCtrlC: true,
});
createRoot(renderer).render(<App initialState={initialState} />);
