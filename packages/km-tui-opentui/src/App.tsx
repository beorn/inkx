/**
 * TUI2 App Container
 *
 * Top-level component that:
 * - Connects to the store (side effects)
 * - Manages keyboard input
 * - Transforms state to view models
 * - Renders the appropriate view
 */

import { useState, useMemo } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useBoardState, createInitialBoardState } from "./hooks/index.ts";
import { toBoardViewModel } from "@km/tui-core";
import { CardsView } from "./views/index.ts";
import { Header, StatusBar } from "./components/index.ts";
import type { ViewMode, ColumnState } from "./types.ts";

interface AppProps {
  initialColumns: ColumnState[];
  rootId?: string | null;
  rootPath?: string | null;
  initialViewMode?: ViewMode;
}

const VIEW_MODES: ViewMode[] = ["cards", "list", "columns", "tabs"];

export function App({
  initialColumns,
  rootId = null,
  rootPath = null,
  initialViewMode = "cards",
}: AppProps) {
  const { width, height } = useTerminalDimensions();
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);

  // Initialize board state
  const initialState = useMemo(
    () => createInitialBoardState(initialColumns, rootId, rootPath),
    [], // Only compute once
  );

  const board = useBoardState(initialState);

  // Transform state to view model
  const viewModel = useMemo(
    () => toBoardViewModel(board.state, viewMode),
    [board.state, viewMode],
  );

  // Handle keyboard input
  useKeyboard(({ key, name }) => {
    // Quit
    if (name === "escape" || key === "q") {
      process.exit(0);
    }

    // Navigation
    if (name === "up" || key === "k") {
      board.dispatch({ type: "MOVE_UP" });
    } else if (name === "down" || key === "j") {
      board.dispatch({ type: "MOVE_DOWN" });
    } else if (name === "left" || key === "h") {
      board.dispatch({ type: "MOVE_LEFT" });
    } else if (name === "right" || key === "l") {
      board.dispatch({ type: "MOVE_RIGHT" });
    } else if (key === "g") {
      board.dispatch({ type: "JUMP_TOP" });
    } else if (key === "G") {
      board.dispatch({ type: "JUMP_BOTTOM" });
    }

    // View mode cycling
    else if (key === "v") {
      const currentIndex = VIEW_MODES.indexOf(viewMode);
      const nextIndex = (currentIndex + 1) % VIEW_MODES.length;
      setViewMode(VIEW_MODES[nextIndex]);
    }

    // Help
    else if (key === "?") {
      board.dispatch({ type: "TOGGLE_HELP_MODE" });
    }

    // Search
    else if (key === "/") {
      board.dispatch({ type: "TOGGLE_SEARCH_MODE" });
    }
  });

  // Current column for status bar
  const currentCol = board.currentColumn;

  return (
    <box flexDirection="column" width={width} height={height}>
      {/* Header */}
      <Header
        rootPath={viewModel.rootPath}
        viewMode={viewMode}
        searchQuery={viewModel.searchQuery}
        searchMode={viewModel.searchMode}
      />

      {/* Main view area */}
      {viewMode === "cards" && (
        <CardsView
          columns={viewModel.columns}
          selectedCol={viewModel.selectedCol}
          selectedCard={viewModel.selectedCard}
        />
      )}

      {/* Placeholder for other views */}
      {viewMode === "list" && (
        <box flexGrow={1}>
          <text color="yellow">ListView coming soon...</text>
        </box>
      )}
      {viewMode === "columns" && (
        <box flexGrow={1}>
          <text color="yellow">ColumnsView coming soon...</text>
        </box>
      )}
      {viewMode === "tabs" && (
        <box flexGrow={1}>
          <text color="yellow">TabsView coming soon...</text>
        </box>
      )}

      {/* Status bar */}
      <StatusBar
        width={width}
        height={height}
        colIndex={board.state.colIndex}
        colCount={board.state.columns.length}
        cardIndex={board.state.cardIndex}
        cardCount={currentCol?.cards.length ?? 0}
        viewMode={viewMode}
      />
    </box>
  );
}

export default App;
