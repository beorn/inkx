/**
 * Board lifecycle effects - setup/teardown hooks
 */
import type { WriteStream } from "tty";
import type { Dispatch } from "react";
import { actions, type UIAction } from "../ui-reducer.ts";
import { createPasteHandler, supportsFileDrop } from "../paste-handler.ts";
import {
  createMouseHandler,
  supportsMouseMode,
  SelectionManager,
  type MouseEvent as TermMouseEvent,
} from "../mouse-handler.ts";
import { tuiEvents } from "../tui.ts";
import { buildTreeNodes } from "../board-adapter.ts";
import type { WatcherStatus } from "@km/storage";
import type { BoardAction } from "@km/board";
import type { SelectionRange } from "../mouse-handler.ts";

/**
 * Creates the terminal dimension sync effect
 * Polls for valid dimensions and handles resize events
 */
export function createSyncTerminalDimensions(
  stdout: WriteStream | undefined,
  dispatch: Dispatch<UIAction>,
): () => void | undefined {
  if (!stdout) return () => {};

  const handleResize = () => {
    dispatch(
      actions.setDimensions({ columns: stdout.columns, rows: stdout.rows }),
    );
  };

  // Check if stdout has valid dimensions (not undefined)
  const syncDimensions = () => {
    if (stdout.columns !== undefined && stdout.rows !== undefined) {
      dispatch(
        actions.setDimensions({ columns: stdout.columns, rows: stdout.rows }),
      );
      return true;
    }
    return false;
  };

  // Try to sync immediately, otherwise poll until dimensions are available
  if (!syncDimensions()) {
    const interval = setInterval(() => {
      if (syncDimensions()) {
        clearInterval(interval);
        // Delay before marking ready to ensure alternate buffer is stable
        setTimeout(() => dispatch(actions.setReady(true)), 50);
      }
    }, 10);
    stdout.on("resize", handleResize);
    return () => {
      clearInterval(interval);
      stdout.off("resize", handleResize);
    };
  }

  // Dimensions available immediately - still delay to avoid race condition
  const timeout = setTimeout(() => dispatch(actions.setReady(true)), 50);

  stdout.on("resize", handleResize);
  return () => {
    clearTimeout(timeout);
    stdout.off("resize", handleResize);
  };
}

/**
 * Creates the file drop handler effect
 * Handles bracketed paste for file drops
 */
export function createFileDropHandler(
  dispatch: Dispatch<UIAction>,
): () => void | undefined {
  if (!supportsFileDrop()) return () => {};

  const cleanup = createPasteHandler((files) => {
    dispatch(actions.setDroppedFiles(files));
    dispatch(actions.showDropNotification());
    // Auto-hide notification after 3 seconds
    setTimeout(() => dispatch(actions.hideDropNotification()), 3000);
  });

  return cleanup;
}

/**
 * Creates the mouse handler effect
 * Handles mouse drag-select and scroll wheel events
 */
export function createMouseHandler_(
  dispatch: Dispatch<UIAction>,
  dispatchBoard: Dispatch<BoardAction>,
  mouseSelection: SelectionRange | null,
): () => void | undefined {
  // TODO: Fix mouse integration - not working properly yet
  // Disable for now until scroll wheel and click-to-select work correctly
  return () => {};

  if (!supportsMouseMode()) return () => {};

  const selectionManager = new SelectionManager((range) => {
    dispatch(actions.setMouseSelection(range));
    dispatch(actions.setMouseDragging(range !== null));
  });

  const cleanup = createMouseHandler((event: TermMouseEvent) => {
    selectionManager.handleMouseEvent(event);

    // Handle scroll wheel events
    if (event.type === "scroll" && event.scrollDirection) {
      // Use boardReducer for cursor movement
      if (event.scrollDirection === "down") {
        dispatchBoard({ type: "CURSOR_MOVE", dir: "next" });
      } else {
        dispatchBoard({ type: "CURSOR_MOVE", dir: "prev" });
      }
      return;
    }

    // Handle double-click to drill in
    if (event.type === "down" && event.button === "left") {
      // TODO: Track double-click timing for drill-in
      // For now, single click just selects
    }

    // Convert screen coordinates to board items
    // This is a simplified version - full implementation would map
    // coordinates to specific cards/items in the board
    if (event.type === "up" && mouseSelection) {
      // Selection complete - could trigger multi-select of items
      // within the selection range
    }
  });

  return cleanup;
}

/**
 * Creates the refresh handler effect
 * Subscribes to external refresh events (filesystem changes)
 */
export function createRefreshHandler(
  rootIdRef: React.RefObject<string | null>,
  dispatchBoard: Dispatch<BoardAction>,
): () => void {
  const handleRefresh = () => {
    // Rebuild tree nodes from database (which was updated by sync manager)
    // Must use deep loading (true) to include children - shallow loading loses them!
    // Uses rootIdRef to get current rootId (avoids stale closure from useEffect deps)
    // Note: rootIdRef.current can be null for root-level view, which is valid
    const nodes = buildTreeNodes(rootIdRef.current, true);
    dispatchBoard({ type: "REFRESH", nodes });
  };

  tuiEvents.on("refresh", handleRefresh);
  return () => {
    tuiEvents.off("refresh", handleRefresh);
  };
}

/**
 * Creates the watcher status handler effect
 * Subscribes to watcher status updates for bottom bar display
 */
export function createWatcherStatusHandler(
  dispatch: Dispatch<UIAction>,
): () => void {
  const handleWatcherStatus = (status: WatcherStatus) => {
    dispatch(actions.setWatcherStatus(status));
  };

  tuiEvents.on("watcher-status", handleWatcherStatus);
  return () => {
    tuiEvents.off("watcher-status", handleWatcherStatus);
  };
}
