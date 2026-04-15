/**
 * Omnibox — Universal Command Palette + Vault Search
 *
 * Accessible via `:` (node mode), `Cmd+K` (both modes), `Ctrl+K` (node mode).
 * Full-screen overlay with fuzzy search across:
 * - All registered commands (with keybinding hints)
 * - Go-to locations (inbox, journal, home, archive)
 * - Vault-wide content search (FTS5, triggers at 2+ chars)
 *
 * Uses useDialogInput for text editing (Enter/Escape/Arrow routing).
 */
import React from "react"
import { Box, Small, ModalDialog } from "@silvery/ag-react"
import { InputBox } from "./shared-components.tsx"
import { OmniboxRow, type OmniboxRowData } from "./OmniboxRow.tsx"
import { commandToRow, nodeToRow } from "./omnibox-row-adapters.ts"
import { useDialogInput } from "../hooks/use-dialog-input.ts"
import { getAllCommands, getAllKeybindings, formatKeybinding } from "@km/commands"
import { KNode } from "@km/core"
import { useRepo } from "../repo-context.tsx"
import type { Repo } from "../repo-context.tsx"
import { getNodeDisplayName } from "../state.ts"
import { fuzzyScore, getParentName } from "./search-utils.ts"
import { modeOf } from "../state/omnibox.ts"
import { computeSearchDecorationsFromSource } from "../text/index.ts"

// =============================================================================
// Types
// =============================================================================

export interface OmniboxResult {
  /** Unique key for React rendering */
  key: string
  /** Result type for categorization and icon display */
  type: "command" | "goto" | "search"
  /** Display label */
  label: string
  /** Secondary description text */
  description: string
  /** Keyboard shortcut hint (e.g., "⌃K", "gi") */
  shortcutHint?: string
  /** Command ID to execute when selected (command/goto types) */
  commandId?: string
  /** Target ID for composable commands (e.g., "i" for goto inbox) */
  targetId?: string
  /** Node ID to navigate to (search type) */
  nodeId?: string
  /** Node object for rich rendering (search type) */
  node?: KNode
}

// =============================================================================
// Result Sources
// =============================================================================

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
      commandId: "goto",
      targetId: "i",
    },
    {
      key: "goto:journal",
      type: "goto",
      label: "Go to Journal",
      description: "Navigate to today's journal",
      shortcutHint: "gj",
      commandId: "goto",
      targetId: "j",
    },
    {
      key: "goto:home",
      type: "goto",
      label: "Go to Home",
      description: "Navigate to home board",
      shortcutHint: "gh",
      commandId: "goto",
      targetId: "h",
    },
    {
      key: "goto:archive",
      type: "goto",
      label: "Go to Archive",
      description: "Navigate to archive",
      shortcutHint: "ga",
      commandId: "goto",
      targetId: "a",
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
// Vault Search
// =============================================================================

/** Minimum query length before FTS5 search fires */
const MIN_SEARCH_LENGTH = 2
/** Maximum number of search results shown */
const MAX_SEARCH_RESULTS = 12

/**
 * Build vault-wide search results. Delegates entirely to `repo.search()` —
 * which uses FTS5 `bm25(table, 1.0, 3.0, 2.0, 1.0)` column weights plus a
 * slash-count depth tie-break to produce identity-first ordering (name >
 * title > content, shallower wins). See
 * packages/km-storage/src/db/queries/full-text-search.ts.
 *
 * No JS re-rank here — BM25 handles everything the ad-hoc scorer used to
 * do, with better characteristics (term frequency, IDF, length norm) and
 * at the storage layer where the index is already built.
 */
function buildSearchResults(repo: Repo, query: string): OmniboxResult[] {
  if (query.length < MIN_SEARCH_LENGTH) return []

  const nodes = repo.search(query, MAX_SEARCH_RESULTS * 2)
  const results: OmniboxResult[] = []
  for (const node of nodes) {
    if (results.length >= MAX_SEARCH_RESULTS) break
    if (KNode.isOutline(node) && node.fstype === "folder") continue
    if (KNode.isEmbed(node)) continue

    const title = getNodeDisplayName(repo, node)
    const parentContext = getParentName(node, repo.getNode.bind(repo), (n) => getNodeDisplayName(repo, n))

    results.push({
      key: `search:${node.id}`,
      type: "search",
      label: title,
      description: parentContext ?? "",
      nodeId: node.id,
      node,
    })
  }

  return results
}

// =============================================================================
// Result Scoring
// =============================================================================

/** Score an omnibox result against a query */
function scoreResult(result: OmniboxResult, query: string): number {
  const labelScore = fuzzyScore(query, result.label)
  const descScore = fuzzyScore(query, result.description) * 0.5
  const idScore = result.commandId ? fuzzyScore(query, result.commandId) * 0.3 : 0
  return Math.max(labelScore, descScore, idScore)
}

// =============================================================================
// Result Item Component
// =============================================================================

/** Section divider shown between command/goto and search results */
function SectionDivider({ label }: { label: string }): React.ReactElement {
  return (
    <Box height={1}>
      <Small>{`── ${label} ──`}</Small>
    </Box>
  )
}

/**
 * Convert an OmniboxResult into the shared OmniboxRowData descriptor.
 *
 * Commands and goto entries route through commandToRow with a synthetic
 * CommandDef shape — Omnibox.tsx still owns its own OmniboxResult type, so
 * we don't have a real CommandDef in scope. Search results route through
 * nodeToRow with the parent context as the secondary line.
 */
function omniboxResultToRowData(result: OmniboxResult, isSelected: boolean, query: string): OmniboxRowData {
  if (result.type === "search" && result.node) {
    const decorations = query ? computeSearchDecorationsFromSource(result.label, query, isSelected) : undefined
    const base = nodeToRow(result.node, {
      parentContext: result.description || undefined,
      isSelected,
    })
    return {
      ...base,
      // Preserve the Omnibox result key so React reconciliation matches the
      // visible-row slice (avoids index-only collisions across sections).
      id: result.key,
      title: result.label,
      titleDecorations: decorations,
    }
  }
  // Command / goto rows — feed a synthetic CommandDef into the shared adapter.
  const base = commandToRow(
    {
      id: result.commandId ?? result.key,
      name: result.label,
      description: result.description,
      category: "Navigation",
      execute: () => null,
    },
    {
      keybindingHint: result.shortcutHint,
      isSelected,
    },
  )
  return { ...base, id: result.key }
}

// =============================================================================
// Omnibox Component
// =============================================================================

interface OmniboxProps {
  /** Called when user selects a result */
  onSelect: (result: OmniboxResult) => void
  /** Called when user cancels (Escape) */
  onCancel: () => void
  /** Available width */
  width: number
  /** Maximum height */
  maxHeight: number
  /**
   * Initial buffer text. Defaults to `":"` so Cmd-K / Ctrl-K / `:` open
   * the omnibox in command mode with the sigil already visible — the user
   * sees what mode they're in without needing to type the sigil first, and
   * the sigil-aware scorer immediately shows all commands.
   */
  initialBuffer?: string
}

export function Omnibox({
  onSelect,
  onCancel,
  width,
  maxHeight,
  initialBuffer = ":",
}: OmniboxProps): React.ReactElement {
  const repo = useRepo()
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
    initialValue: initialBuffer,
    onChange: () => setSelectedIndex(0),
    navUp: () => setSelectedIndex((i) => Math.max(0, i - 1)),
    navDown: () => setSelectedIndex((i) => Math.min(i + 1, Math.max(0, resultsRef.current.length - 1))),
    onConfirm: () => {
      const selected = resultsRef.current[selectedIndexRef.current]
      if (selected) {
        onSelectRef.current(selected)
      }
    },
    onCancel: () => onCancelRef.current(),
  })

  // Build results (memoized — keybinding map and goto results are static)
  const keybindingMap = React.useMemo(() => buildKeybindingMap(), [])
  const gotoResults = React.useMemo(() => buildGotoResults(), [])
  const commandResults = React.useMemo(() => buildCommandResults(keybindingMap), [keybindingMap])
  const allResults = React.useMemo(() => [...gotoResults, ...commandResults], [gotoResults, commandResults])

  // Debounce query for expensive filtering (200ms, immediate in tests)
  const query = editCtx.value.trim()
  const [deferredQuery, setDeferredQuery] = React.useState(query)
  const omniTimerRef = React.useRef<ReturnType<typeof setTimeout>>(undefined)
  React.useEffect(() => {
    clearTimeout(omniTimerRef.current)
    // @ts-expect-error - React internal flag set by silvery test renderer
    if (globalThis.IS_REACT_ACT_ENVIRONMENT) {
      setDeferredQuery(query)
    } else {
      omniTimerRef.current = setTimeout(() => setDeferredQuery(query), 200)
    }
    return () => clearTimeout(omniTimerRef.current)
  }, [query])

  // Split the query into sigil + body. The leading sigil dictates which
  // result category (commands / gotos / nodes) we surface, and the body
  // is what we fuzzy-score against. Stripping the sigil is the key fix for
  // the ':' bug: typing ':' with nothing after used to score ALL commands
  // at 0 (since no label contains ':'), hiding them; now ':' → body='', and
  // the empty-body branch returns the full command list.
  const queryMode = modeOf(deferredQuery)
  const queryBody = queryMode === "universal" || queryMode === "local_find" ? deferredQuery : deferredQuery.slice(1)

  // Filter and sort command/goto results. Empty body (user typed just the
  // sigil, or hasn't typed anything yet) returns the full list unranked.
  const filteredCommandResults = React.useMemo(() => {
    // Content sigils (@ # + ~) are for NODE queries, not commands — hide
    // the command list entirely so the UI doesn't mix categories.
    if (queryMode !== "command" && queryMode !== "universal") return []
    if (!queryBody) return allResults
    const scored = allResults
      .map((result) => ({ result, score: scoreResult(result, queryBody) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
    return scored.map(({ result }) => result)
  }, [allResults, queryMode, queryBody])

  // Vault-wide search results (FTS5, deferred until 2+ chars). `repo.search()`
  // returns results already ordered by `bm25(nodes_fts, 1.0, 3.0, 2.0, 1.0)`
  // plus a depth tie-break — identity-first ranking is pushed all the way
  // down into SQL. No JS re-rank layer needed.
  //
  // Command mode (`:` sigil) skips the node search — the user is looking
  // for verbs, not content. Sigil-prefixed content queries (@ # + ~) pass
  // through the full buffer including the sigil so FTS5's tokenchars
  // config handles the match natively.
  const searchResults = React.useMemo(
    () => (queryMode === "command" ? [] : buildSearchResults(repo, deferredQuery)),
    [repo, deferredQuery, queryMode],
  )

  // Merge: command/goto results first, then search results (with divider tracked by index)
  const hasSearchResults = searchResults.length > 0
  const searchDividerIndex = hasSearchResults ? filteredCommandResults.length : -1
  const filteredResults = React.useMemo(() => {
    if (!hasSearchResults) return filteredCommandResults
    return [...filteredCommandResults, ...searchResults]
  }, [filteredCommandResults, searchResults, hasSearchResults])

  resultsRef.current = filteredResults

  // Dialog chrome: border(2) + paddingY(2) + title+spacer(2) + input+focusRing(4) + footer(2) = 12
  const DIALOG_CHROME = 12
  const maxVisible = Math.max(1, maxHeight - DIALOG_CHROME)

  // Scroll offset (keep selection visible)
  const resultCount = filteredResults.length
  const scrollOffset =
    resultCount > 0
      ? Math.max(0, Math.min(selectedIndex - Math.floor(maxVisible / 2), Math.max(0, resultCount - maxVisible)))
      : 0

  // Auto-size dialog height
  const contentRows = Math.min(resultCount || 1, maxVisible)
  const dialogHeight = Math.min(DIALOG_CHROME + contentRows, maxHeight)

  const visibleResults = filteredResults.slice(scrollOffset, scrollOffset + maxVisible)

  const footerContent = (
    <Box flexDirection="row" justifyContent="space-between">
      <Small>{"↑↓ nav  Enter select  Esc close"}</Small>
      {resultCount > maxVisible && (
        <Small>
          {scrollOffset > 0 ? "↑" : " "}
          {` ${selectedIndex + 1}/${resultCount} `}
          {scrollOffset + maxVisible < resultCount ? "↓" : " "}
        </Small>
      )}
    </Box>
  )

  // Derive the dialog title + hotkey badge + placeholder from the buffer's
  // leading sigil, so the chrome re-reads as the user switches modes with
  // a single keystroke. One lookup table keeps the three in sync.
  //
  // The `hotkey` prop drives the small badge next to the title — it used
  // to be hardcoded to ":" (the bug from issue km-tui.omnibox-hotkey-badge).
  const modeChrome = {
    command: { label: "Command", hotkey: ":", placeholder: "Search commands…" },
    context: { label: "Context", hotkey: "@", placeholder: "Search contexts (@someone)…" },
    tag: { label: "Tag", hotkey: "#", placeholder: "Search tags (#topic)…" },
    project: { label: "Project", hotkey: "+", placeholder: "Search projects (+name)…" },
    local_find: { label: "Find", hotkey: "/", placeholder: "Find in view (/text)…" },
    universal: { label: "Omnibox", hotkey: "", placeholder: "Type : for commands, + @ # for nodes…" },
  } as const
  const chrome = modeChrome[queryMode] ?? modeChrome.universal

  return (
    <ModalDialog title={chrome.label} hotkey={chrome.hotkey} width={width} height={dialogHeight} footer={footerContent}>
      {/* Search input */}
      <Box flexShrink={0}>
        <InputBox
          beforeCursor={editCtx.beforeCursor}
          afterCursor={editCtx.afterCursor}
          prompt="> "
          promptColor={"$primary"}
          placeholder={chrome.placeholder}
          focusRing
        />
      </Box>

      {/* Results list */}
      <Box flexDirection="column" flexGrow={1} flexShrink={1} overflow="hidden">
        {filteredResults.length === 0 ? (
          <Small>{query.length >= MIN_SEARCH_LENGTH ? "No results" : "No matching commands"}</Small>
        ) : (
          visibleResults.map((result, i) => {
            const actualIndex = scrollOffset + i
            const isSelected = actualIndex === selectedIndex
            const rowData = omniboxResultToRowData(result, isSelected, deferredQuery)
            return (
              <React.Fragment key={result.key}>
                {actualIndex === searchDividerIndex && <SectionDivider label="Search" />}
                <OmniboxRow data={rowData} />
              </React.Fragment>
            )
          })
        )}
      </Box>
    </ModalDialog>
  )
}
