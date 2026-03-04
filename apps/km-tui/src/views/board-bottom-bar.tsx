/**
 * Board bottom bar - status display component
 */
/* oxlint-disable complexity/complexity -- React component — status bar with many indicator conditionals */

import React, { useState, useEffect } from "react"
import { Box, Text, useFocusManager } from "inkx"
import type { ToastQueue } from "@km/core"
import type { WatcherStatus } from "@km/storage"
import { type PaneUI, getEditMode } from "../ui-reducer.ts"
import type { ColumnView } from "../types.ts"
import { useNodeStore, useReactive } from "../reactive.ts"

// Spinner frames (from @beorn/inkx-ui, copied to avoid React version mismatch)
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
const SPINNER_INTERVAL = 80

const FLASH_DURATION = 3000

/** Hook for 3-second flash when a value changes */
function useFlashOnChange(value: number): boolean {
  const [flash, setFlash] = useState(false)
  const prevRef = React.useRef(value)

  useEffect(() => {
    if (value === prevRef.current) return
    prevRef.current = value
    if (value === 0) return
    setFlash(true)
    // Skip timer during tests
    // @ts-expect-error - React internal flag set by inkx test renderer
    if (globalThis.IS_REACT_ACT_ENVIRONMENT) return
    const timer = setTimeout(() => setFlash(false), FLASH_DURATION)
    return () => clearTimeout(timer)
  }, [value])

  return flash
}

/** Hook to fire a one-time toast when first console log arrives */
function useLogToast(total: number, toastQueue?: ToastQueue): void {
  const firedRef = React.useRef(false)

  useEffect(() => {
    if (firedRef.current || total === 0 || !toastQueue) return
    // @ts-expect-error - React internal flag set by inkx test renderer
    if (globalThis.IS_REACT_ACT_ENVIRONMENT) return
    firedRef.current = true
    toastQueue.info(`${total} log messages — press \` to see`)
  }, [total, toastQueue])
}

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
  ui: PaneUI
  rootPath: string | null
  columns: ColumnView[]
  termWidth: number
  /** Storage mode: 'memory' (ephemeral) or 'disk' (persistent) */
  storageMode: "memory" | "disk"
  /** Total node count in database */
  nodeCount: number
  /** Move mode active (from board state) */
  moveMode: boolean
  /** Console stats (only shown when total > 0) */
  consoleStats?: { total: number; errors: number; warnings: number }
  /** Toast queue instance (for log toast notifications) */
  toastQueue?: ToastQueue
}

/**
 * BottomBar component - displays storage mode, path, and status indicators
 */
export function BottomBar({
  ui,
  rootPath,
  columns,
  termWidth,
  storageMode,
  nodeCount,
  moveMode,
  consoleStats,
  toastQueue,
}: BottomBarProps): React.ReactElement {
  const nodeStore = useNodeStore()
  const cursorColumnNodeId = useReactive(nodeStore.cursorColumnNodeId)
  const colIndex = columns.findIndex((c) => c.node.id === cursorColumnNodeId)
  const layout = {
    colIndex: colIndex >= 0 ? colIndex : 0,
  }
  const homeDir = process.env.HOME || ""

  // Determine if we need spinner animation
  const isSyncing = ui.watcherStatus?.state === "syncing" || ui.watcherStatus?.state === "starting"
  const isLoading = ui.isLoading || ui.backgroundParsing || isSyncing
  // Only run spinner animation when actually displaying it
  const spinnerFrame = useSpinnerFrame(isLoading)

  // Flash white for 3s when any counter changes
  const logTotal = consoleStats?.total ?? 0
  const hasWarnings = (consoleStats?.errors ?? 0) > 0 || (consoleStats?.warnings ?? 0) > 0
  const logFlash = useFlashOnChange(logTotal)
  const nodeFlash = useFlashOnChange(nodeCount)
  const fileFlash = useFlashOnChange(ui.watcherStatus?.watchedPaths ?? 0)

  // Toast notification when new logs arrive (debounced by console subscription)
  useLogToast(logTotal, toastQueue)

  // Shorten path: replace home directory with ~/
  let displayPath = rootPath || ""
  if (homeDir && displayPath.startsWith(homeDir)) {
    displayPath = "~" + displayPath.slice(homeDir.length)
  }

  // Build mode/pane context (middle section)
  const editMode = getEditMode(ui)

  // Mode label: MOVE > VISUAL > TEXT > NODE (priority order)
  let modeLabel: string
  let modeColor: string | undefined
  let modeBold = false
  if (moveMode) {
    modeLabel = "MOVE"
    modeColor = "magenta"
  } else if (ui.visualMode) {
    modeLabel = "VISUAL"
    modeColor = "$primary"
  } else if (editMode === "text") {
    modeLabel = "TEXT"
    modeColor = "$warning"
    modeBold = true
  } else {
    modeLabel = "NODE"
    modeColor = undefined // default/dim
  }

  // Pane: board or detail (from focus tree)
  const { activeId: focusedActiveId } = useFocusManager()
  const paneLabel = focusedActiveId === "detail-pane" ? "detail" : "board"

  // Chord prefix (only when pending)
  const chordSuffix = ui.pendingChord ? ` ${ui.pendingChord}…` : ""

  // Multi-selection count
  const multiSuffix = ui.multiSelected.size > 0 ? ` [${ui.multiSelected.size}]` : ""

  // Status message (shown after mode/pane context)
  const statusParts: string[] = []
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
    // Additional indicators only when no status message
    if (ui.showDropNotification && ui.droppedFiles.length > 0) {
      statusParts.push(`[Drop:${ui.droppedFiles.length}]`)
    }
    if (ui.isMouseDragging && ui.mouseSelection) {
      statusParts.push("[Sel]")
    }
  }

  // Right side info
  const watcherInfo = ui.watcherStatus
    ? ` ${isLoading ? `${spinnerFrame} ` : ""}${renderWatcherStatus(ui.watcherStatus)}`
    : ""
  const viewModeStr = (ui.viewMode?.toUpperCase() ?? "CARDS") + " VIEW"
  const showColPosition = ui.viewMode === "columns" && columns.length > 1

  // Left side info
  const storageLabel = storageMode === "memory" ? "MEM" : "DISK"
  const statusMessage = statusParts.join("  ")
  return (
    <Box
      flexDirection="row"
      flexShrink={0}
      width={termWidth}
      id="bottom-bar"
      data-status={ui.status?.level}
      backgroundColor={ui.bellState ? "$error" : undefined}
    >
      {/* Left side: fills remaining space, truncates overflow */}
      <Box flexGrow={1} flexShrink={1} flexDirection="row" overflow="hidden">
        <Text dimColor id="storage-mode">
          {storageLabel}
        </Text>
        <Text dimColor>{" 📁 "}</Text>
        <Text dimColor id="repo-path">
          {displayPath}
        </Text>
        {/* Mode/pane context */}
        <Text dimColor>{"   "}</Text>
        <Text color={modeColor} bold={modeBold} id="mode-label">
          {modeLabel}
        </Text>
        <Text dimColor> </Text>
        <Text dimColor id="pane-label">
          {paneLabel}
        </Text>
        {chordSuffix && (
          <Text dimColor id="chord-prefix">
            {chordSuffix}
          </Text>
        )}
        {multiSuffix && (
          <Text dimColor id="multi-count">
            {multiSuffix}
          </Text>
        )}
        {statusMessage && (
          <>
            <Text dimColor>{"   "}</Text>
            <Text dimColor id="status-message">
              {statusMessage}
            </Text>
          </>
        )}
      </Box>
      {/* Right side: counters group + view info — each section is a separate
          layout element to prevent width miscalculation from merging inline text */}
      <Box flexGrow={0} flexShrink={0} flexDirection="row">
        {/* Log counter (only when logs exist) */}
        {logTotal > 0 && (
          <Text dimColor={!logFlash} id="console-indicator">
            {" "}
            {hasWarnings ? "⚠" : "💬"}
            {logTotal}
          </Text>
        )}
        {/* Node counter */}
        <Text dimColor={!nodeFlash} id="node-count">
          {" "}
          📋{nodeCount}
        </Text>
        {/* Watcher/file counter */}
        {watcherInfo && (
          <Text dimColor={!fileFlash} id="watcher-status">
            {watcherInfo}
          </Text>
        )}
        {showColPosition && (
          <Text dimColor id="column-position">
            {"   "}col {layout.colIndex + 1}/{columns.length}
          </Text>
        )}
        {/* Filter indicator moved to top bar */}
        {/* View mode label */}
        <Text dimColor id="view-mode">
          {"   "}
          {viewModeStr}{" "}
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
      return pendingPaths > 0 ? `${fileCount} sync:${pendingPaths}` : `${fileCount} syncing`
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
