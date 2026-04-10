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
import { Box, Text, CursorLine, useFocusManager, useEditContext, useModifierKeys } from "@silvery/ag-react"
import { getChordSuffixes, getCommand, locationLabel } from "@km/commands"
import type { ToastQueue } from "@km/core"
import type { WatcherStatus } from "@km/storage"
import { PaneUI } from "../state/ui-reducer.ts"
import { useSel } from "../state/ui-context.tsx"
import { useSignal } from "../hooks/use-signal.ts"
import type { UIState, LocalSearchState } from "../state/ui-reducer.ts"
import { useFlashOnChange, useLogToast, useSpinnerFrame } from "../hooks/use-status-animations.ts"

/** Minimum inner width of the command box (excluding border chars) */
export const CMD_BOX_WIDTH = 38

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
    // @ts-expect-error - React internal flag set by silvery test renderer
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
  success: "$success",
  warning: "$warning",
  error: "$error",
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
function FlashMessage({ message, color }: { message: string; color?: string }): React.ReactElement {
  const isFlash = useFlash(message)
  return (
    <Box
      flexDirection="row"
      borderStyle="round"
      borderColor={isFlash ? "$muted" : "$border"}
      backgroundColor="$popover-bg"
      paddingX={1}
      overflow="hidden"
    >
      <Text color={isFlash ? "$fg" : color} bold={isFlash} wrap="truncate" id="feedback-message">
        {message}
      </Text>
    </Box>
  )
}

/** Chord hints — shows available suffixes for the pending chord prefix.
 *  Yellow + bold when active (waiting for suffix), grey + dim after timeout fires. */
function ChordHints({ prefix, dimmed }: { prefix: string; dimmed: boolean }): React.ReactElement | null {
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
      borderColor={dimmed ? "$disabled-fg" : "$border"}
      backgroundColor="$popover-bg"
      paddingX={1}
      paddingY={1}
      overflow="hidden"
    >
      {entries.map((entry) => (
        <Text key={entry.key} dimColor={dimmed}>
          <Text color={dimmed ? "$disabled-fg" : "$primary"} bold={!dimmed}>
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
function CommandFeedback({
  ui,
  localSearch,
}: {
  ui: PaneUI
  localSearch?: LocalSearchState | null
}): React.ReactElement | null {
  // Priority 1: chord hints (yellow = active, grey = timed out)
  if (ui.pendingChord) {
    return <ChordHints prefix={ui.pendingChord} dimmed={ui.chordTimedOut} />
  }

  // Priority 2: local search — absorbs bell/status to show a single message
  if (localSearch && localSearch.query.length > 0) {
    // Bell during search (e.g. "can't find") overrides the match count
    if (ui.bellState) {
      return <FlashMessage message={ui.bellState} color="$error" />
    }
    const noMatches = localSearch.matchCount === 0
    const text = noMatches ? "No matches" : `${localSearch.matchIndex + 1} of ${localSearch.matchCount}`
    return <FlashMessage message={text} color={noMatches ? "$error" : "$primary"} />
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
  NORMAL: "$success",
  INSERT: "$warning",
  VISUAL: "$selection-bg",
  MOVE: "magenta",
  FIND: "$primary",
}

// ---------------------------------------------------------------------------
// CommandBox — main export
// ---------------------------------------------------------------------------

export interface CommandBoxProps {
  ui: PaneUI
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
  termWidth: _termWidth,
  storageMode: _storageMode,
  rootPath: _rootPath,
  nodeCount: _nodeCount,
  moveMode,
  consoleStats,
  toastQueue,
  localSearch,
  onQueryChange,
}: CommandBoxProps): React.ReactElement | null {
  const sel = useSel()
  // Subscribe reactively to sel.text so mode label updates on enter/exit edit mode.
  // Without useSignal, React wouldn't re-render when the underlying alien-signals
  // computed changes (same sel ref, no zustand update).
  const textEdit = useSignal(sel.text)
  const isTextEditing = textEdit !== null

  // Toast when first console log arrives
  const logTotal = consoleStats?.total ?? 0
  useLogToast(logTotal, toastQueue)

  // Derive mode label
  const editMode = PaneUI.editMode(ui, isTextEditing)
  let modeLabel: string
  if (moveMode) {
    modeLabel = "MOVE"
  } else if (false /* visual mode removed */) {
    modeLabel = "VISUAL"
  } else if (localSearch) {
    modeLabel = "FIND"
  } else if (editMode === "text") {
    modeLabel = "INSERT"
  } else {
    modeLabel = "NORMAL"
  }
  const modeColor = MODE_COLORS[modeLabel] ?? "$success"

  // Pane indicator
  const { activeId: focusedActiveId } = useFocusManager()
  const paneLabel = focusedActiveId === "detail-pane" ? "detail" : ""

  // Chord prefix (only when pending). Yellow = active, dim = timed out.
  const chordSuffix = ui.pendingChord ? `${ui.pendingChord}\u2026` : ""
  const chordActive = ui.pendingChord !== null && !ui.chordTimedOut

  // Multi-selection count
  const selIds = sel.node.ids()
  const multiSuffix = selIds.length > 1 ? `[${selIds.length}]` : ""

  // Command bar is "active" when the user is typing into it (omnibox, find input, search-replace)
  const isCommandInput = !!(ui.showOmnibox || localSearch?.isInputActive || ui.searchReplace)

  // Feedback and command independently decide visibility
  const hasFeedback = !!(ui.pendingChord || ui.bellState || ui.status || (localSearch && localSearch.query.length > 0))
  const hasCommand = modeLabel !== "NORMAL" || isCommandInput || multiSuffix !== ""

  // Nothing to show
  if (!hasFeedback && !hasCommand) return null

  // Border color: focus ring when input-focused, text otherwise
  const borderColor = isCommandInput ? "$focusborder" : "$fg"

  return (
    <Box
      flexDirection="column"
      width={CMD_BOX_WIDTH + 2} // +2 for border
      userSelect="none"
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
          backgroundColor="$popover-bg"
          overflow="hidden"
        >
          <Text color={modeColor} bold id="mode-label">
            {modeLabel}
          </Text>
          <Text dimColor> </Text>
          {localSearch ? (
            <Box
              id="find-bar"
              flexGrow={1}
              flexShrink={1}
              flexDirection="row"
              overflow="hidden"
              data-query={localSearch.query}
              data-match-count={localSearch.matchCount}
              data-match-index={localSearch.matchIndex}
              data-input-active={localSearch.isInputActive || undefined}
            >
              <Text color={localSearch.isInputActive ? undefined : "$primary"}>/</Text>
              <Box flexGrow={1} flexShrink={1} overflow="hidden">
                {localSearch.isInputActive && onQueryChange ? (
                  <FindInput query={localSearch.query} onQueryChange={onQueryChange} />
                ) : (
                  <Text color="$primary">{localSearch.query}</Text>
                )}
              </Box>
            </Box>
          ) : (
            <Box flexGrow={1} flexShrink={1} flexDirection="row" overflow="hidden">
              {chordSuffix && (
                <Text
                  color={chordActive ? "$primary" : undefined}
                  dimColor={!chordActive}
                  bold={chordActive}
                  id="chord-prefix"
                >
                  {chordSuffix}
                </Text>
              )}
              {paneLabel && !chordSuffix && (
                <Text dimColor id="pane-label">
                  {paneLabel}
                </Text>
              )}
              {multiSuffix && (
                <Text color="$selection-bg" id="multi-count">
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
  // Pause spinner animation when terminal is blurred (saves CPU/battery)
  const spinnerFrame = useSpinnerFrame(isLoading && ui.terminalFocused)

  // Elapsed time counter for long operations (pauses when terminal blurred)
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!ui.loadingStartTime || !ui.terminalFocused) {
      if (!ui.loadingStartTime) setElapsed(0)
      return
    }
    const tick = () => setElapsed(Math.floor((Date.now() - (ui.loadingStartTime ?? 0)) / 1000))
    tick()
    // @ts-expect-error - React internal flag set by silvery test renderer
    if (globalThis.IS_REACT_ACT_ENVIRONMENT) return
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [ui.loadingStartTime, ui.terminalFocused])

  const logTotal = consoleStats?.total ?? 0
  const hasWarnings = (consoleStats?.errors ?? 0) > 0 || (consoleStats?.warnings ?? 0) > 0
  const logFlash = useFlashOnChange(logTotal)
  const nodeFlash = useFlashOnChange(nodeCount)
  const fileFlash = useFlashOnChange(ui.watcherStatus?.watchedPaths ?? 0)

  const watcherInfo = ui.watcherStatus
    ? ` ${isLoading ? `${spinnerFrame} ` : ""}${renderWatcherStatus(ui.watcherStatus)}`
    : ""

  // Held modifier keys (shown as emoji sigils)
  const mods = useModifierKeys()
  const modParts: string[] = []
  if (mods.super) modParts.push("⌘")
  if (mods.ctrl) modParts.push("⌃")
  if (mods.alt) modParts.push("⌥")
  if (mods.shift) modParts.push("⇧")
  const modSuffix = modParts.length > 0 ? ` ${modParts.join("")}` : ""

  return (
    <Box flexDirection="row" flexShrink={0}>
      {modSuffix && (
        <Text dimColor id="modifier-keys">
          {modSuffix}{" "}
        </Text>
      )}
      <Text dimColor id="storage-path">
        {storageMode === "memory" ? "MEM" : "DISK"} {shortenPath(rootPath)}
      </Text>
      {/* Loading spinner + elapsed time counter */}
      {isLoading && (
        <Text dimColor id="loading-indicator">
          {" "}
          {spinnerFrame}
          {elapsed > 1 ? ` ${elapsed}s` : ""}
        </Text>
      )}
      {logTotal > 0 && (
        <Text dimColor={!logFlash} id="console-indicator">
          {" "}
          {hasWarnings ? "\u26A0" : "💬"}
          {logTotal}
        </Text>
      )}
      <Text dimColor={!nodeFlash} id="node-count">
        {" "}
        📋{nodeCount}
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
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const debouncedChange = useRef((value: string) => {
    clearTimeout(timerRef.current)
    // @ts-expect-error - React internal flag set by silvery test renderer
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

  return <CursorLine beforeCursor={beforeCursor} afterCursor={afterCursor} />
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
