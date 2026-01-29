/**
 * Board bottom bar - status display component
 */
import React, { useState, useEffect } from "react"
import { Box, Text } from "inkx"
import type { WatcherStatus } from "@km/storage"
import type { UIState } from "../ui-reducer.ts"
import type { TUIBoardState } from "../types.ts"

// Spinner frames (from @beorn/inkx-ui, copied to avoid React version mismatch)
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
const SPINNER_INTERVAL = 80

/** Hook for animated spinner frame - uses React from inkx to avoid version mismatch */
function useSpinnerFrame(enabled: boolean): string {
  const [frameIndex, setFrameIndex] = useState(0)

  useEffect(() => {
    // Only run animation when spinner is actually displayed
    if (!enabled) {
      return
    }
    // Skip animation during tests to avoid act() warnings
    // @ts-expect-error - React internal flag set by inkx test renderer
    if (globalThis.IS_REACT_ACT_ENVIRONMENT) {
      return
    }
    const timer = setInterval(() => {
      setFrameIndex((i) => (i + 1) % SPINNER_FRAMES.length)
    }, SPINNER_INTERVAL)
    return () => clearInterval(timer)
  }, [enabled])

  return SPINNER_FRAMES[frameIndex] ?? "⠋"
}

interface BottomBarProps {
  ui: UIState
  state: TUIBoardState
  layout: { colIndex: number; cardIndex: number }
  termWidth: number
  /** Storage mode: 'memory' (ephemeral) or 'disk' (persistent) */
  storageMode: "memory" | "disk"
  /** Total node count in database */
  nodeCount: number
  /** Move mode active (from board state) */
  moveMode: boolean
}

/**
 * BottomBar component - displays storage mode, path, and status indicators
 */
export function BottomBar({
  ui,
  state,
  layout,
  termWidth,
  storageMode,
  nodeCount,
  moveMode,
}: BottomBarProps): React.ReactElement {
  const homeDir = process.env.HOME || ""

  // Determine if we need spinner animation
  const isSyncing =
    ui.watcherStatus?.state === "syncing" ||
    ui.watcherStatus?.state === "starting"
  const isLoading = ui.isLoading || isSyncing
  // Only run spinner animation when actually displaying it
  const spinnerFrame = useSpinnerFrame(isLoading)

  // Shorten path: replace home directory with ~/
  let displayPath = state.rootPath || ""
  if (homeDir && displayPath.startsWith(homeDir)) {
    displayPath = "~" + displayPath.slice(homeDir.length)
  }

  // Build status parts (middle)
  const statusParts: string[] = []

  // Status message has priority - show it if present
  if (ui.status) {
    const icons = {
      info: "ℹ",
      success: "✓",
      warning: "⚠",
      error: "✗",
    } as const
    const icon = icons[ui.status.level]
    statusParts.push(`${icon} ${ui.status.message}`)
  } else {
    // Normal status indicators (only when no status message)
    if (moveMode) statusParts.push("[MOVE]")
    if (ui.showHelp) statusParts.push("[?]")
    if (ui.showProjectPicker) statusParts.push("[PROJ]")
    if (ui.showNewItemDialog) statusParts.push("[NEW]")
    if (ui.showDropNotification && ui.droppedFiles.length > 0) {
      statusParts.push(`[Drop:${ui.droppedFiles.length}]`)
    }
    if (ui.isMouseDragging && ui.mouseSelection) {
      statusParts.push("[Sel]")
    }
    if (ui.multiSelected.size > 0) {
      statusParts.push(`[${ui.multiSelected.size}]`)
    }
    if (ui.inOutlineMode) statusParts.push("OUT")
  }

  // Right side info (always visible)
  // DB/files/watcher status as one group (single space), other items with double space
  const dbCount = nodeCount
  // Show spinner when syncing/loading
  const spinnerPrefix = isLoading ? `${spinnerFrame} ` : ""
  const watcherInfo = ui.watcherStatus
    ? ` ${spinnerPrefix}${renderWatcherStatus(ui.watcherStatus)}`
    : ""
  // 📋 = clipboard for records/nodes, 📄 = file for watched files
  const dbFilesGroup = `📋${dbCount}${watcherInfo}`

  const rightParts: string[] = [dbFilesGroup]
  // Show column position (only meaningful in columns view)
  if (ui.viewMode === "columns" && state.columns.length > 1) {
    rightParts.push(`col ${layout.colIndex + 1}/${state.columns.length}`)
  }
  // Always show view mode with VIEW suffix
  const viewModeStr = (ui.viewMode?.toUpperCase() ?? "CARDS") + " VIEW"
  rightParts.push(viewModeStr)

  // Left side: storage mode + folder icon + path
  // 📁 = folder icon for repo path
  const modeLabel = storageMode === "memory" ? "MEM" : "DISK"
  const middle = statusParts.join("  ") // Double space between status parts
  const right = ` ${rightParts.join("   ")} ` // Triple space between groups

  // Calculate widths: right side is fixed, left gets remaining space
  const rightWidth = right.length
  const leftWidth = Math.max(1, termWidth - rightWidth)

  return (
    <Box
      flexDirection="row"
      flexShrink={0}
      width={termWidth}
      id="bottom-bar"
      data-status={ui.status?.level}
    >
      <Box width={leftWidth} flexShrink={0}>
        <Text dimColor wrap="truncate-end">
          {/* Storage mode indicator */}
          <Text id="storage-mode">{modeLabel}</Text>
          {" 📁"}
          <Text id="repo-path">{displayPath}</Text>
          {middle && (
            <>
              {"   "}
              <Text id="status-message">{middle}</Text>
            </>
          )}
        </Text>
      </Box>
      <Box width={rightWidth} flexShrink={0}>
        <Text dimColor>
          {" "}
          <Text id="node-count">📋{dbCount}</Text>
          {watcherInfo && <Text id="watcher-status">{watcherInfo}</Text>}
          {ui.viewMode === "columns" && state.columns.length > 1 && (
            <>
              {"   "}
              <Text id="column-position">
                {}
                col {layout.colIndex + 1}/{state.columns.length}
              </Text>
            </>
          )}
          {"   "}
          <Text id="view-mode">{viewModeStr}</Text>{" "}
        </Text>
      </Box>
    </Box>
  )
}

/**
 * Render watcher status indicator for bottom bar
 * Uses 📄 icon for files, always shows file count, plus current state if not idle
 */
function renderWatcherStatus(status: WatcherStatus): string {
  const { state, pendingPaths, watchedPaths } = status
  // 📄 = file icon for watched files
  const fileCount = watchedPaths ? `📄${watchedPaths}` : "📄0"

  switch (state) {
    case "starting":
      return `${fileCount} starting`
    case "syncing":
      return pendingPaths > 0
        ? `${fileCount} sync:${pendingPaths}`
        : `${fileCount} syncing`
    case "ready":
    case "idle":
      return fileCount
    case "error":
      return `${fileCount} err`
    case "stopped":
      return `${fileCount} off`
    default:
      return fileCount
  }
}
