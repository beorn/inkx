/**
 * Omnibox — Universal Command Palette
 *
 * Accessible via `:` (node mode), `Ctrl+k` (both modes).
 * Full-screen overlay with fuzzy search across:
 * - All registered commands (with keybinding hints)
 * - Go-to locations (inbox, journal, home, archive)
 *
 * Uses useDialogInput for text editing (Enter/Escape/Arrow routing).
 */
import React from "react"
import { Box, Text } from "inkx"
import { ModalDialog, InputBox } from "./shared-components.tsx"
import { useDialogInput } from "../hooks/use-dialog-input.ts"
import {
  getAllCommands,
  getAllKeybindings,
  fuzzyMatch,
  type CommandDef,
  type Keybinding,
} from "@km/commands"

// =============================================================================
// Types
// =============================================================================

export interface OmniboxResult {
  /** Unique key for React rendering */
  key: string
  /** Result type for categorization and icon display */
  type: "command" | "goto"
  /** Display label */
  label: string
  /** Secondary description text */
  description: string
  /** Keyboard shortcut hint (e.g., "⌃K", "gi") */
  shortcutHint?: string
  /** Command ID to execute when selected */
  commandId: string
}

// =============================================================================
// Result Sources
// =============================================================================

/** Format a keybinding as a human-readable hint string */
function formatKeybinding(binding: Keybinding): string {
  const parts: string[] = []
  if (binding.chord) parts.push(binding.chord)
  if (binding.super) parts.push("⌘")
  if (binding.ctrl) parts.push("⌃")
  if (binding.alt || binding.meta) parts.push("⌥")
  if (binding.shift) parts.push("⇧")
  parts.push(binding.key)
  return parts.join("")
}

/** Commands that should be hidden from the palette (internal/text-editing) */
const HIDDEN_CATEGORIES = new Set(["TextEdit"])
const HIDDEN_COMMAND_IDS = new Set([
  "noop",
  "command_palette", // Don't show "open command palette" inside the palette
  "text.insert",
  "text.delete_backward",
  "text.delete_forward",
  "text.cursor_left",
  "text.cursor_right",
  "text.cursor_up",
  "text.cursor_down",
  "text.cursor_start",
  "text.cursor_end",
  "text.delete_word",
  "text.delete_to_start",
  "text.delete_to_end",
  "text.confirm",
  "text.exit_edit",
  "text.yank",
  "help.dismiss",
  "delete_confirm.confirm",
  "delete_confirm.cancel",
  "console.close",
  "toast.dismiss",
  "dialog.cancel",
  "dialog.confirm",
  "dialog.nav_up",
  "dialog.nav_down",
  "dialog.toggle_search_scope",
  "filter.nav_left",
  "filter.nav_right",
  "filter.clear_all",
  "detail_pane.close",
  "dev.test_toast",
])

/** Build the static go-to location results */
function buildGotoResults(): OmniboxResult[] {
  return [
    {
      key: "goto:inbox",
      type: "goto",
      label: "Go to Inbox",
      description: "Navigate to inbox",
      shortcutHint: "gi",
      commandId: "goto_inbox",
    },
    {
      key: "goto:journal",
      type: "goto",
      label: "Go to Journal",
      description: "Navigate to today's journal",
      shortcutHint: "gj",
      commandId: "goto_journal",
    },
    {
      key: "goto:home",
      type: "goto",
      label: "Go to Home",
      description: "Navigate to home board",
      shortcutHint: "gh",
      commandId: "goto_home",
    },
    {
      key: "goto:archive",
      type: "goto",
      label: "Go to Archive",
      description: "Navigate to archive",
      shortcutHint: "ge",
      commandId: "goto_archive",
    },
  ]
}

/** Build command results from the command registry */
function buildCommandResults(keybindingMap: Map<string, string>): OmniboxResult[] {
  const commands = getAllCommands()
  const results: OmniboxResult[] = []

  for (const cmd of commands) {
    if (HIDDEN_CATEGORIES.has(cmd.category)) continue
    if (HIDDEN_COMMAND_IDS.has(cmd.id)) continue

    results.push({
      key: `cmd:${cmd.id}`,
      type: "command",
      label: cmd.name,
      description: cmd.description,
      shortcutHint: keybindingMap.get(cmd.id),
      commandId: cmd.id,
    })
  }

  return results
}

/** Build a map of commandId -> shortcut hint string from all keybindings */
function buildKeybindingMap(): Map<string, string> {
  const bindings = getAllKeybindings()
  const map = new Map<string, string>()

  for (const binding of bindings) {
    // Only take the first binding for each command
    if (map.has(binding.commandId)) continue
    // Skip wildcards
    if (binding.wildcard) continue
    map.set(binding.commandId, formatKeybinding(binding))
  }

  return map
}

// =============================================================================
// Fuzzy Scoring
// =============================================================================

/**
 * Score a fuzzy match for sorting. Higher = better match.
 * Returns 0 if no match.
 */
function fuzzyScore(query: string, target: string): number {
  if (!query) return 1 // Empty query matches everything equally
  const q = query.toLowerCase()
  const t = target.toLowerCase()

  // Exact match
  if (t === q) return 1000

  // Prefix match
  if (t.startsWith(q)) return 500

  // Substring match
  if (t.includes(q)) return 200

  // Fuzzy match (characters in order)
  if (fuzzyMatch(query, target)) return 100

  return 0
}

/** Score an omnibox result against a query */
function scoreResult(result: OmniboxResult, query: string): number {
  const labelScore = fuzzyScore(query, result.label)
  const descScore = fuzzyScore(query, result.description) * 0.5
  const idScore = fuzzyScore(query, result.commandId) * 0.3
  return Math.max(labelScore, descScore, idScore)
}

// =============================================================================
// Result Item Component
// =============================================================================

function ResultItem({
  result,
  isSelected,
}: {
  result: OmniboxResult
  isSelected: boolean
}): React.ReactElement {
  const typeIcon = result.type === "goto" ? " " : " "

  return (
    <Box>
      <Text
        color={isSelected ? "white" : undefined}
        backgroundColor={isSelected ? "blue" : undefined}
        bold={isSelected}
      >
        <Text dimColor={!isSelected}>{typeIcon}</Text>
        <Text>{result.label}</Text>
        {"  "}
        <Text dimColor>{result.description}</Text>
      </Text>
      {result.shortcutHint && (
        <Text color={isSelected ? "white" : "yellow"} backgroundColor={isSelected ? "blue" : undefined}>
          {"  "}
          {result.shortcutHint}
        </Text>
      )}
    </Box>
  )
}

// =============================================================================
// Omnibox Component
// =============================================================================

interface OmniboxProps {
  /** Called when user selects a result — receives commandId */
  onSelect: (commandId: string) => void
  /** Called when user cancels (Escape) */
  onCancel: () => void
  /** Available width */
  width: number
  /** Maximum height */
  maxHeight: number
}

export function Omnibox({
  onSelect,
  onCancel,
  width,
  maxHeight,
}: OmniboxProps): React.ReactElement {
  const [selectedIndex, setSelectedIndex] = React.useState(0)

  // Stable refs for callbacks used in useDialogInput closures
  const selectedIndexRef = React.useRef(selectedIndex)
  selectedIndexRef.current = selectedIndex
  const onCancelRef = React.useRef(onCancel)
  onCancelRef.current = onCancel
  const onSelectRef = React.useRef(onSelect)
  onSelectRef.current = onSelect
  const resultsRef = React.useRef<OmniboxResult[]>([])

  const editCtx = useDialogInput({
    initialValue: "",
    onChange: () => setSelectedIndex(0),
    navUp: () => setSelectedIndex((i) => Math.max(0, i - 1)),
    navDown: () =>
      setSelectedIndex((i) => Math.min(i + 1, Math.max(0, resultsRef.current.length - 1))),
    onConfirm: () => {
      const selected = resultsRef.current[selectedIndexRef.current]
      if (selected) {
        onSelectRef.current(selected.commandId)
      }
    },
    onCancel: () => onCancelRef.current(),
  })

  // Build results (memoized — keybinding map and goto results are static)
  const keybindingMap = React.useMemo(() => buildKeybindingMap(), [])
  const gotoResults = React.useMemo(() => buildGotoResults(), [])
  const commandResults = React.useMemo(
    () => buildCommandResults(keybindingMap),
    [keybindingMap],
  )
  const allResults = React.useMemo(
    () => [...gotoResults, ...commandResults],
    [gotoResults, commandResults],
  )

  // Filter and sort results based on query
  const query = editCtx.value.trim()
  const filteredResults = React.useMemo(() => {
    if (!query) return allResults

    const scored = allResults
      .map((result) => ({ result, score: scoreResult(result, query) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)

    return scored.map(({ result }) => result)
  }, [allResults, query])

  resultsRef.current = filteredResults

  // Dialog chrome: border(2) + paddingY(2) + title+spacer(2) + input+focusRing(4) + footer(2) = 12
  const DIALOG_CHROME = 12
  const maxVisible = Math.max(1, maxHeight - DIALOG_CHROME)

  // Scroll offset (keep selection visible)
  const resultCount = filteredResults.length
  const scrollOffset =
    resultCount > 0
      ? Math.max(
          0,
          Math.min(
            selectedIndex - Math.floor(maxVisible / 2),
            Math.max(0, resultCount - maxVisible),
          ),
        )
      : 0

  // Auto-size dialog height
  const contentRows = Math.min(resultCount || 1, maxVisible)
  const dialogHeight = Math.min(DIALOG_CHROME + contentRows, maxHeight)

  const visibleResults = filteredResults.slice(scrollOffset, scrollOffset + maxVisible)

  const footerContent = (
    <Box flexDirection="row" justifyContent="space-between">
      <Text dimColor>{"↑↓ nav  Enter select  Esc close"}</Text>
      {resultCount > maxVisible && (
        <Text dimColor>
          {scrollOffset > 0 ? "↑" : " "}
          {` ${selectedIndex + 1}/${resultCount} `}
          {scrollOffset + maxVisible < resultCount ? "↓" : " "}
        </Text>
      )}
    </Box>
  )

  return (
    <ModalDialog
      title="Command Palette"
      hotkey=":"
      width={width}
      height={dialogHeight}
      footer={footerContent}
    >
      {/* Search input */}
      <Box flexShrink={0}>
        <InputBox
          beforeCursor={editCtx.beforeCursor}
          afterCursor={editCtx.afterCursor}
          prompt="> "
          promptColor="cyan"
          placeholder="Type a command..."
          focusRing
        />
      </Box>

      {/* Results list */}
      <Box flexDirection="column" flexGrow={1} flexShrink={1} overflow="hidden">
        {filteredResults.length === 0 ? (
          <Text dimColor>No matching commands</Text>
        ) : (
          visibleResults.map((result, i) => {
            const actualIndex = scrollOffset + i
            return (
              <ResultItem
                key={result.key}
                result={result}
                isSelected={actualIndex === selectedIndex}
              />
            )
          })
        )}
      </Box>
    </ModalDialog>
  )
}
