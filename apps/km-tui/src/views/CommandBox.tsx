/**
 * CommandBox — compact status/input area at the bottom of the board.
 *
 * Replaces the old KeyBar + BottomBar combo with a single-line chrome:
 *   [MODE] > chord/status                              counters · view
 *
 * States:
 * - Idle: mode pill + prompt
 * - Chord in progress: mode pill + pending chord prefix
 * - Feedback: status message (auto-clears)
 * - Loading: spinner
 */
/* oxlint-disable complexity/complexity -- React component — status bar with many indicator conditionals */

import React, { useState, useEffect } from "react"
import { Box, Text, useFocusManager, useEditContext, useInterval } from "inkx"
import type { ToastQueue } from "@km/core"
import type { WatcherStatus } from "@km/storage"
import { getEditMode } from "../ui-reducer.ts"
import type { UIState, LocalSearchState } from "../ui-reducer.ts"

// Spinner frames (braille unicode dots animation)
const SPINNER_FRAMES = [
  "\u280B",
  "\u2819",
  "\u2839",
  "\u2838",
  "\u283C",
  "\u2834",
  "\u2826",
  "\u2827",
  "\u2807",
  "\u280F",
]
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
    toastQueue.info(`${total} log messages \u2014 press \` to see`)
  }, [total, toastQueue])
}

/** Hook for animated spinner frame - uses inkx useInterval (Dan Abramov's ref pattern) */
function useSpinnerFrame(enabled: boolean): string {
  const [frameIndex, setFrameIndex] = useState(0)

  useInterval(() => setFrameIndex((i) => (i + 1) % SPINNER_FRAMES.length), SPINNER_INTERVAL, enabled)

  return SPINNER_FRAMES[frameIndex] ?? "\u280B"
}

/** Mode colors for the mode pill */
const MODE_COLORS: Record<string, string> = {
  NORMAL: "green",
  INSERT: "yellow",
  VISUAL: "cyan",
  MOVE: "magenta",
}

export interface CommandBoxProps {
  ui: UIState
  termWidth: number
  /** Storage mode: 'memory' (ephemeral) or 'disk' (persistent) */
  storageMode: "memory" | "disk"
  /** Root path of the current board (null for in-memory) */
  rootPath: string | null
  /** Total node count in database */
  nodeCount: number
  /** Move mode active (from board state) */
  moveMode: boolean
  /** Console stats (only shown when total > 0) */
  consoleStats?: { total: number; errors: number; warnings: number }
  /** Toast queue instance (for log toast notifications) */
  toastQueue?: ToastQueue
  /** Local search state (find bar inline) */
  localSearch?: LocalSearchState | null
  /** Callback when find query changes */
  onQueryChange?: (query: string) => void
}

/**
 * CommandBox component - mode pill + prompt + status + counters
 *
 * Layout: [MODE] > status/chord                    counters · view
 */
/** Shorten a path by replacing the home directory prefix with ~ */
function shortenPath(path: string | null): string {
  if (!path) return ""
  const home = process.env.HOME ?? process.env.USERPROFILE ?? ""
  if (home && path.startsWith(home)) return "~" + path.slice(home.length)
  return path
}

export function CommandBox({
  ui,
  termWidth,
  storageMode,
  rootPath,
  nodeCount,
  moveMode,
  consoleStats,
  toastQueue,
  localSearch,
  onQueryChange,
}: CommandBoxProps): React.ReactElement {
  // Determine if we need spinner animation
  const isSyncing = ui.watcherStatus?.state === "syncing" || ui.watcherStatus?.state === "starting"
  const isLoading = ui.isLoading || ui.backgroundParsing || isSyncing
  const spinnerFrame = useSpinnerFrame(isLoading)

  // Elapsed time counter for long operations
  const [elapsed, setElapsed] = useState(0)
  const tick = () => setElapsed(Math.floor((Date.now() - (ui.loadingStartTime ?? 0)) / 1000))

  // Reset to 0 when not loading; compute initial value on mount
  useEffect(() => {
    if (!ui.loadingStartTime) {
      setElapsed(0)
      return
    }
    tick()
  }, [ui.loadingStartTime])

  // Tick every second while loading (useInterval skips the initial call)
  useInterval(tick, 1000, !!ui.loadingStartTime)

  // Flash white for 3s when any counter changes
  const logTotal = consoleStats?.total ?? 0
  const hasWarnings = (consoleStats?.errors ?? 0) > 0 || (consoleStats?.warnings ?? 0) > 0
  const logFlash = useFlashOnChange(logTotal)
  const nodeFlash = useFlashOnChange(nodeCount)
  const fileFlash = useFlashOnChange(ui.watcherStatus?.watchedPaths ?? 0)

  // Toast notification when new logs arrive
  useLogToast(logTotal, toastQueue)

  // Derive mode label
  const editMode = getEditMode(ui)
  let modeLabel: string
  if (moveMode) {
    modeLabel = "MOVE"
  } else if (ui.visualMode) {
    modeLabel = "VISUAL"
  } else if (editMode === "text") {
    modeLabel = "INSERT"
  } else {
    modeLabel = "NORMAL"
  }
  const modeColor = MODE_COLORS[modeLabel] ?? "green"

  // Pane indicator
  const { activeId: focusedActiveId } = useFocusManager()
  const paneLabel = focusedActiveId === "detail-pane" ? "detail" : ""

  // Chord prefix (only when pending)
  const chordSuffix = ui.pendingChord ? `${ui.pendingChord}\u2026` : ""

  // Multi-selection count
  const multiSuffix = ui.multiSelected.size > 0 ? `[${ui.multiSelected.size}]` : ""

  // Status message
  let statusMessage = ""
  let statusColor: string | undefined
  if (ui.status) {
    const icons = {
      info: "i:",
      success: "ok:",
      warning: "!:",
      error: "ERR:",
    } as const
    const colors = {
      info: undefined,
      success: "green",
      warning: "yellow",
      error: "red",
    } as const
    const icon = icons[ui.status.level]
    statusColor = colors[ui.status.level]
    statusMessage = `${icon} ${ui.status.message}`
  } else {
    const parts: string[] = []
    if (ui.showDropNotification && ui.droppedFiles.length > 0) {
      parts.push(`[Drop:${ui.droppedFiles.length}]`)
    }
    if (ui.isMouseDragging && ui.mouseSelection) {
      parts.push("[Sel]")
    }
    statusMessage = parts.join("  ")
  }

  // Right side info
  const watcherInfo = ui.watcherStatus
    ? ` ${isLoading ? `${spinnerFrame} ` : ""}${renderWatcherStatus(ui.watcherStatus)}`
    : ""
  // Command bar is "active" when the user is typing into it (omnibox, find, search-replace)
  const isCommandInput = !!(ui.showOmnibox || ui.localSearch || ui.searchReplace)

  return (
    <Box
      flexDirection="row"
      flexShrink={0}
      width={termWidth}
      id="bottom-bar"
      data-status={ui.status?.level}
      backgroundColor={ui.bellState ? "red" : isCommandInput ? "#1a3a5c" : undefined}
    >
      {/* Left side: mode pill + prompt + find/status */}
      <Box flexGrow={1} flexShrink={1} flexDirection="row" overflow="hidden">
        {/* Mode indicator */}
        <Text color={modeColor} bold id="mode-label">
          {modeLabel}
        </Text>
        <Text dimColor> {">"} </Text>
        {localSearch ? (
          /* Inline find: /query */
          <Box id="find-bar" flexGrow={1} flexShrink={1} flexDirection="row" overflow="hidden">
            <Text>{" / "}</Text>
            <Box flexGrow={1} flexShrink={1} overflow="hidden">
              {localSearch.isInputActive && onQueryChange ? (
                <FindInput query={localSearch.query} onQueryChange={onQueryChange} />
              ) : (
                <Text>{localSearch.query}</Text>
              )}
            </Box>
          </Box>
        ) : (
          /* Normal mode: chord/spinner/status */
          <>
            {/* Chord prefix */}
            {chordSuffix && (
              <Text dimColor id="chord-prefix">
                {chordSuffix}{" "}
              </Text>
            )}
            {/* Loading spinner */}
            {isLoading && !chordSuffix && (
              <Text dimColor>
                {spinnerFrame}
                {elapsed > 1 ? ` ${elapsed}s ` : " "}
              </Text>
            )}
            {/* Pane indicator (only when in detail pane) */}
            {paneLabel && (
              <Text dimColor id="pane-label">
                {paneLabel}{" "}
              </Text>
            )}
            {/* Multi-selection count */}
            {multiSuffix && (
              <Text color="cyan" id="multi-count">
                {multiSuffix}{" "}
              </Text>
            )}
            {/* Status message */}
            {statusMessage && (
              <Text dimColor={!statusColor} color={statusColor} id="status-message">
                {statusMessage}
              </Text>
            )}
          </>
        )}
      </Box>
      {/* Right side: storage path + counters */}
      <Box flexGrow={0} flexShrink={0} flexDirection="row">
        {/* Storage mode + path */}
        <Text dimColor id="storage-path">
          {storageMode === "memory" ? "MEM" : "DISK"} {shortenPath(rootPath)}{"  "}
        </Text>
        {/* Log counter (only when logs exist) */}
        {logTotal > 0 && (
          <Text dimColor={!logFlash} id="console-indicator">
            {" "}
            {hasWarnings ? "\u26A0" : "💬"}
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
      </Box>
    </Box>
  )
}

/** Inline text input for the find query (uses EditContext for cursor/key routing) */
function FindInput({
  query,
  onQueryChange,
}: {
  query: string
  onQueryChange: (query: string) => void
}): React.ReactElement {
  const { beforeCursor, afterCursor } = useEditContext({
    initialValue: query,
    onConfirm: () => {},
    onCancel: () => {},
    onSave: (value: string) => onQueryChange(value),
    onChange: (value: string) => onQueryChange(value),
  })

  const cursorChar = afterCursor.length > 0 ? afterCursor[0] : " "
  const restAfterCursor = afterCursor.length > 1 ? afterCursor.slice(1) : ""

  return (
    <Text>
      {beforeCursor}
      <Text inverse>{cursorChar}</Text>
      {restAfterCursor}
    </Text>
  )
}

/**
 * Render watcher status indicator
 */
function renderWatcherStatus(status: WatcherStatus): string {
  const { state, pendingPaths, watchedPaths } = status
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
