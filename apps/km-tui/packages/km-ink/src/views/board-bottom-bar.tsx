/**
 * Board bottom bar - status display component
 */
import React from "react";
import { Box, Text } from "inkx";
import { getStore, getNodeCount } from "@km/storage";
import type { WatcherStatus } from "@km/storage";
import type { UIState } from "../ui-reducer.ts";
import type { BoardState, ViewMode } from "../types.ts";

interface BottomBarProps {
  ui: UIState;
  state: BoardState;
  termWidth: number;
}

/**
 * BottomBar component - displays storage mode, path, and status indicators
 */
export function BottomBar({
  ui,
  state,
  termWidth,
}: BottomBarProps): React.ReactElement {
  const store = getStore();
  const homeDir = process.env.HOME || "";

  // Shorten path: replace home directory with ~/
  let displayPath = store.rootPath || "";
  if (homeDir && displayPath.startsWith(homeDir)) {
    displayPath = "~" + displayPath.slice(homeDir.length);
  }

  // Build status parts (middle)
  const statusParts: string[] = [];
  if (ui.showHelp) statusParts.push("[?]");
  if (ui.showProjectPicker) statusParts.push("[PROJ]");
  if (ui.showNewItemDialog) statusParts.push("[NEW]");
  if (ui.showDropNotification && ui.droppedFiles.length > 0) {
    statusParts.push(`[Drop:${ui.droppedFiles.length}]`);
  }
  if (ui.isMouseDragging && ui.mouseSelection) {
    statusParts.push("[Sel]");
  }
  if (ui.multiSelected.size > 0) {
    statusParts.push(`[${ui.multiSelected.size}]`);
  }
  if (ui.inOutlineMode) statusParts.push("OUT");

  // Right side info (always visible)
  // DB/files/watcher status as one group (single space), other items with double space
  const dbCount = getNodeCount();
  const watcherInfo = ui.watcherStatus
    ? ` ${renderWatcherStatus(ui.watcherStatus)}`
    : "";
  // 📋 = clipboard for records/nodes, 📄 = file for watched files
  const dbFilesGroup = `📋${dbCount}${watcherInfo}`;

  const rightParts: string[] = [dbFilesGroup];
  // Show column position (only meaningful in columns view)
  if (ui.viewMode === "columns" && state.columns.length > 1) {
    rightParts.push(`col ${state.colIndex + 1}/${state.columns.length}`);
  }
  // Always show view mode with VIEW suffix
  const viewModeStr = (ui.viewMode?.toUpperCase() ?? "CARDS") + " VIEW";
  rightParts.push(viewModeStr);

  // Left side: storage mode + folder icon + path
  // 📁 = folder icon for vault/repo path
  const modeLabel = store.mode === "memory" ? "MEM" : "DISK";
  const left = `${modeLabel} 📁${displayPath}`;
  const middle = statusParts.join("  "); // Double space between status parts
  const right = ` ${rightParts.join("   ")} `; // Triple space between groups

  // Calculate widths: right side is fixed, left gets remaining space
  const rightWidth = right.length;
  const leftWidth = Math.max(1, termWidth - rightWidth);

  return (
    <Box flexDirection="row" flexShrink={0} width={termWidth}>
      <Box width={leftWidth} flexShrink={0}>
        <Text dimColor wrap="truncate-end">
          {middle ? ` ${left}   ${middle}` : ` ${left}`}
        </Text>
      </Box>
      <Box width={rightWidth} flexShrink={0}>
        <Text dimColor>{right}</Text>
      </Box>
    </Box>
  );
}

/**
 * Render watcher status indicator for bottom bar
 * Uses 📄 icon for files, always shows file count, plus current state if not idle
 */
export function renderWatcherStatus(status: WatcherStatus): string {
  const { state, pendingPaths, watchedPaths } = status;
  // 📄 = file icon for watched files
  const fileCount = watchedPaths ? `📄${watchedPaths}` : "📄0";

  switch (state) {
    case "starting":
      return `${fileCount} starting`;
    case "syncing":
      return pendingPaths > 0
        ? `${fileCount} sync:${pendingPaths}`
        : `${fileCount} syncing`;
    case "ready":
    case "idle":
      return fileCount;
    case "error":
      return `${fileCount} err`;
    case "stopped":
      return `${fileCount} off`;
    default:
      return fileCount;
  }
}
