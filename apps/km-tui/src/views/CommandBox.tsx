/**
 * CommandBox — compact floating command/status box at bottom-left.
 *
 * Contains both the command feedback (chord hints, flash messages) stacked
 * above the mode pill. Both share the same container width via flex.
 *
 * Hidden in NORMAL mode unless there's feedback, input, or multi-selection.
 * Outline: white by default, light blue when input-focused (find/omnibox).
 */
/* oxlint-disable complexity/complexity -- React component with many indicator conditionals */

import React, { useState, useEffect, useRef } from "react"
import { Box, Text, useFocusManager, useEditContext, useInterval } from "inkx"
import { getChordSuffixes, getCommand, locationLabel } from "@km/commands"
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

/** Minimum inner width of the command box (excluding border chars) */
export const CMD_BOX_WIDTH = 38

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** Hook for 3-second flash when a value changes */
function useFlashOnChange(value: number): boolean {
  const [flash, setFlash] = useState(false)
  const prevRef = React.useRef(value)

  useEffect(() => {
    if (value === prevRef.current) return
    prevRef.current = value
    if (value === 0) return
    setFlash(true)
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

const FLASH_MS = 300

/** Flash white on new message, then fade to normal color */
function useFlash(message: string | undefined): boolean {
  const [flash, setFlash] = useState(true)
  const prevRef = useRef(message)

  useEffect(() => {
    if (message !== prevRef.current) {
      prevRef.current = message
      setFlash(true)
    }
    if (!message) return
    // @ts-expect-error - React internal flag set by inkx test renderer
    if (globalThis.IS_REACT_ACT_ENVIRONMENT) return
    const timer = setTimeout(() => setFlash(false), FLASH_MS)
    return () => clearTimeout(timer)
  }, [message])

  return flash
}

// ---------------------------------------------------------------------------
// Feedback sub-components (rendered inside the CommandBox container)
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, string | undefined> = {
  info: undefined,
  success: "green",
  warning: "yellow",
  error: "red",
}

/** Get display label for a chord suffix entry */
function getLabel(commandId: string, targetId?: string): string {
  if (targetId) return locationLabel(targetId)
  if (commandId === "noop") return "..."
  const cmd = getCommand(commandId)
  if (!cmd) return commandId
  return cmd.shortLabel ?? cmd.name
}

/** Flash message — shows status/bell text with a brief white flash */
function FlashMessage({ message, color }: {
  message: string
  color?: string
}): React.ReactElement {
  const isFlash = useFlash(message)
  return (
    <Box
      flexDirection="row"
      borderStyle="round"
      borderColor={isFlash ? "white" : "gray"}
      backgroundColor="black"
      paddingX={1}
      overflow="hidden"
    >
      <Text color={isFlash ? "white" : color} bold={isFlash} wrap="truncate" id="feedback-message">{message}</Text>
    </Box>
  )
}

/** Chord hints — shows available suffixes for the pending chord prefix */
function ChordHints({ prefix }: { prefix: string }): React.ReactElement | null {
  const suffixes = getChordSuffixes(prefix)
  if (suffixes.length === 0) return null

  const entries = suffixes.map((s) => ({
    key: s.key,
    label: getLabel(s.commandId, s.targetId),
  }))

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="gray"
      backgroundColor="black"
      paddingX={1}
      paddingY={1}
      overflow="hidden"
    >
      {entries.map((entry) => (
        <Text key={entry.key}>
          <Text color="yellow" bold>
            {entry.key}
          </Text>{" "}
          <Text dimColor>{entry.label}</Text>
        </Text>
      ))}
    </Box>
  )
}

/** Feedback area — chord hints, bell/status flash, or search match count.
 *  When local search is active, search feedback absorbs bell/status to avoid overlap. */
function CommandFeedback({ ui, localSearch }: {
  ui: UIState
  localSearch?: LocalSearchState | null
}): React.ReactElement | null {
  // Priority 1: chord hints
  if (ui.pendingChord) {
    return <ChordHints prefix={ui.pendingChord} />
  }

  // Priority 2: local search — absorbs bell/status to show a single message
  if (localSearch && localSearch.query.length > 0) {
    // Bell during search (e.g. "can't find") overrides the match count
    if (ui.bellState) {
      return <FlashMessage message={ui.bellState} color="red" />
    }
    const noMatches = localSearch.matchCount === 0
    const text = noMatches ? "No matches" : `${localSearch.matchIndex + 1} of ${localSearch.matchCount}`
    return <FlashMessage message={text} color={noMatches ? "red" : "yellow"} />
  }

  // Priority 3: bell/status feedback (only when NOT in local search)
  if (ui.bellState || ui.status) {
    const message = ui.status?.message ?? ui.bellState ?? ""
    const color = ui.bellState ? undefined : ui.status ? STATUS_COLORS[ui.status.level] : undefined
    return <FlashMessage message={message} color={color} />
  }

  return null
}

// ---------------------------------------------------------------------------
// Mode colors
// ---------------------------------------------------------------------------

const MODE_COLORS: Record<string, string> = {
  NORMAL: "green",
  INSERT: "yellow",
  VISUAL: "cyan",
  MOVE: "magenta",
  FIND: "yellow",
}

// ---------------------------------------------------------------------------
// CommandBox — main export
// ---------------------------------------------------------------------------

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
}: CommandBoxProps): React.ReactElement | null {
  // Toast when first console log arrives
  const logTotal = consoleStats?.total ?? 0
  useLogToast(logTotal, toastQueue)

  // Derive mode label
  const editMode = getEditMode(ui)
  let modeLabel: string
  if (moveMode) {
    modeLabel = "MOVE"
  } else if (ui.visualMode) {
    modeLabel = "VISUAL"
  } else if (localSearch) {
    modeLabel = "FIND"
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

  // Command bar is "active" when the user is typing into it (omnibox, find input, search-replace)
  const isCommandInput = !!(ui.showOmnibox || localSearch?.isInputActive || ui.searchReplace)

  // Feedback and command independently decide visibility
  const hasFeedback = !!(ui.pendingChord || ui.bellState || ui.status || (localSearch && localSearch.query.length > 0))
  const hasCommand =
    modeLabel !== "NORMAL" ||
    isCommandInput ||
    multiSuffix !== ""

  // Nothing to show
  if (!hasFeedback && !hasCommand) return null

  // Border color: light blue when input-focused, white otherwise
  const borderColor = isCommandInput ? "#5599dd" : "white"

  return (
    <Box
      flexDirection="column"
      width={CMD_BOX_WIDTH + 2} // +2 for border
      id="bottom-bar"
      data-status={ui.status?.level}
    >
      {/* Stack: feedback on top, command on bottom.
          If no command, feedback falls to the bottom position. */}
      {hasFeedback && <CommandFeedback ui={ui} localSearch={localSearch} />}
      {hasCommand && (
        <Box
          flexDirection="row"
          borderStyle="round"
          borderColor={borderColor}
          backgroundColor="black"
          overflow="hidden"
        >
          <Text color={modeColor} bold id="mode-label">
            {modeLabel}
          </Text>
          <Text dimColor> </Text>
          {localSearch ? (
            <Box id="find-bar" flexGrow={1} flexShrink={1} flexDirection="row" overflow="hidden">
              <Text color={localSearch.isInputActive ? undefined : "yellow"}>/</Text>
              <Box flexGrow={1} flexShrink={1} overflow="hidden">
                {localSearch.isInputActive && onQueryChange ? (
                  <FindInput query={localSearch.query} onQueryChange={onQueryChange} />
                ) : (
                  <Text color="yellow">{localSearch.query}</Text>
                )}
              </Box>
            </Box>
          ) : (
            <Box flexGrow={1} flexShrink={1} flexDirection="row" overflow="hidden">
              {chordSuffix && (
                <Text dimColor id="chord-prefix">
                  {chordSuffix}
                </Text>
              )}
              {paneLabel && !chordSuffix && (
                <Text dimColor id="pane-label">
                  {paneLabel}
                </Text>
              )}
              {multiSuffix && (
                <Text color="cyan" id="multi-count">
                  {multiSuffix}
                </Text>
              )}
            </Box>
          )}
        </Box>
      )}
    </Box>
  )
}

// ---------------------------------------------------------------------------
// StatusCounters — bottom-right status line (separate from CommandBox)
// ---------------------------------------------------------------------------

/** Shorten a path by replacing the home directory prefix with ~ */
function shortenPath(path: string | null): string {
  if (!path) return ""
  const home = process.env.HOME ?? process.env.USERPROFILE ?? ""
  if (home && path.startsWith(home)) return "~" + path.slice(home.length)
  return path
}

export function StatusCounters({
  ui,
  storageMode,
  rootPath,
  nodeCount,
  consoleStats,
}: {
  ui: UIState
  storageMode: "memory" | "disk"
  rootPath: string | null
  nodeCount: number
  consoleStats?: { total: number; errors: number; warnings: number }
}): React.ReactElement {
  const isSyncing = ui.watcherStatus?.state === "syncing" || ui.watcherStatus?.state === "starting"
  const isLoading = ui.isLoading || ui.backgroundParsing || isSyncing
  const spinnerFrame = useSpinnerFrame(isLoading)

  const logTotal = consoleStats?.total ?? 0
  const hasWarnings = (consoleStats?.errors ?? 0) > 0 || (consoleStats?.warnings ?? 0) > 0
  const logFlash = useFlashOnChange(logTotal)
  const nodeFlash = useFlashOnChange(nodeCount)
  const fileFlash = useFlashOnChange(ui.watcherStatus?.watchedPaths ?? 0)

  const watcherInfo = ui.watcherStatus
    ? ` ${isLoading ? `${spinnerFrame} ` : ""}${renderWatcherStatus(ui.watcherStatus)}`
    : ""

  return (
    <Box flexDirection="row" flexShrink={0}>
      <Text dimColor id="storage-path">
        {storageMode === "memory" ? "MEM" : "DISK"} {shortenPath(rootPath)}
      </Text>
      {logTotal > 0 && (
        <Text dimColor={!logFlash} id="console-indicator">
          {" "}
          {hasWarnings ? "\u26A0" : "💬"}
          {logTotal}
        </Text>
      )}
      <Text dimColor={!nodeFlash} id="node-count">
        {" "}📋{nodeCount}
      </Text>
      {watcherInfo && (
        <Text dimColor={!fileFlash} id="watcher-status">
          {watcherInfo}
        </Text>
      )}
    </Box>
  )
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const FIND_DEBOUNCE_MS = 150

/** Inline text input for the find query (uses EditContext for cursor/key routing) */
function FindInput({
  query,
  onQueryChange,
}: {
  query: string
  onQueryChange: (query: string) => void
}): React.ReactElement {
  // Debounce propagation to avoid full board re-render on every keystroke
  const timerRef = useRef<ReturnType<typeof setTimeout>>()
  const debouncedChange = useRef((value: string) => {
    clearTimeout(timerRef.current)
    // @ts-expect-error - React internal flag set by inkx test renderer
    if (globalThis.IS_REACT_ACT_ENVIRONMENT) {
      onQueryChange(value)
    } else {
      timerRef.current = setTimeout(() => onQueryChange(value), FIND_DEBOUNCE_MS)
    }
  }).current

  const { beforeCursor, afterCursor } = useEditContext({
    initialValue: query,
    onConfirm: () => {},
    onCancel: () => {},
    onChange: debouncedChange,
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
