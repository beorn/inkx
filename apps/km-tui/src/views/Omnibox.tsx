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
 * Find nodes whose `name` (filename) or `title` (heading) contains the
 * query. **Bypasses FTS5** — necessary because the FTS5 schema only indexes
 * `id` + `content`, so filename/title hits never appear via `repo.search()`.
 * A file `@next.md` with an empty body would otherwise never surface for
 * the query `@next` no matter how good the ranker is.
 *
 * Uses an in-memory scan over `SELECT * FROM nodes` (the same pattern the
 * unified omnibox's `nodeResultsForOmnibox` uses) so we get a registry of
 * candidates that the fuzzy ranker can score. Comparison is case-insensitive
 * and matches anywhere in `name` or `title`. The literal query is preserved
 * (sigils included) so `@next` still anchors to the right column.
 */
function findByNameOrTitle(repo: Repo, query: string): KNode[] {
  const all = repo.rawQuery<KNode>("SELECT * FROM nodes")
  const q = query.toLowerCase()
  const matches: KNode[] = []
  for (const n of all) {
    const name = (n.name ?? "").toLowerCase()
    const title = (n.title ?? "").toLowerCase()
    if (name.includes(q) || title.includes(q)) matches.push(n)
    if (matches.length >= 50) break
  }
  return matches
}

/**
 * Build vault-wide search results. Two sources are merged and deduped:
 *   1. FTS5 content search (`repo.search(query)`) — body matches
 *   2. Filename/title prefix search (`findByNameOrTitle`) — surfaces files
 *      and headings whose text contains the query. This is required for
 *      sigil queries like `@next` to find a file literally named `@next.md`,
 *      because FTS5 doesn't index the `name` column.
 *
 * Caller re-ranks the merged set through the shared tiered fuzzyScore so
 * exact/prefix matches bubble to the top regardless of which source found them.
 */
function buildSearchResults(repo: Repo, query: string): OmniboxResult[] {
  if (query.length < MIN_SEARCH_LENGTH) return []

  // Merge two sources by node id — title-prefix hits + FTS body hits.
  const seen = new Set<string>()
  const merged: KNode[] = []
  for (const node of findByNameOrTitle(repo, query)) {
    if (seen.has(node.id)) continue
    seen.add(node.id)
    merged.push(node)
  }
  for (const node of repo.search(query)) {
    if (seen.has(node.id)) continue
    seen.add(node.id)
    merged.push(node)
  }

  const results: OmniboxResult[] = []
  for (const node of merged) {
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
}

export function Omnibox({ onSelect, onCancel, width, maxHeight }: OmniboxProps): React.ReactElement {
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
    initialValue: "",
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

  // Filter and sort command/goto results based on deferred query
  const filteredCommandResults = React.useMemo(() => {
    if (!deferredQuery) return allResults

    const scored = allResults
      .map((result) => ({ result, score: scoreResult(result, deferredQuery) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)

    return scored.map(({ result }) => result)
  }, [allResults, deferredQuery])

  // Vault-wide search results (FTS5, deferred until 2+ chars). FTS5 tokenizes
  // the query so its native ranking doesn't honor sigil prefixes or literal
  // title-prefix matches. Re-rank through the shared fuzzyScore (tiered —
  // exact > prefix > segment-boundary > substring > fuzzy) so that typing
  // `+ta` surfaces title-prefix matches like `+taxes` / `+taxonomic` above
  // deep-body hits. See km-tui.picker-rank-subpath.
  const searchResults = React.useMemo(() => {
    const raw = buildSearchResults(repo, deferredQuery)
    if (!deferredQuery) return raw
    const scored = raw.map((r) => ({ r, s: fuzzyScore(deferredQuery, r.label) }))
    // Keep FTS5 order as a tie-break by using a stable sort on score only.
    scored.sort((a, b) => b.s - a.s)
    return scored.map(({ r }) => r)
  }, [repo, deferredQuery])

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

  // Derive the dialog title from the buffer's leading sigil, so it
  // re-reads as the user switches modes with a single keystroke.
  // Matches docs/design/omnibox.md — the title never lies about mode.
  const mode = modeOf(editCtx.beforeCursor + editCtx.afterCursor)
  const title =
    mode === "command"
      ? "Command"
      : mode === "context"
        ? "Context"
        : mode === "tag"
          ? "Tag"
          : mode === "project"
            ? "Project"
            : mode === "node"
              ? "Node"
              : mode === "local_find"
                ? "Find"
                : "Omnibox"
  const placeholderText =
    mode === "command"
      ? "Search commands…"
      : mode === "context"
        ? "Search contexts (@someone)…"
        : mode === "tag"
          ? "Search tags (#topic)…"
          : mode === "project"
            ? "Search projects (+name)…"
            : mode === "node"
              ? "Search nodes ([title])…"
              : mode === "local_find"
                ? "Find in view (/text)…"
                : "Type : for commands, + @ # [ for nodes…"

  return (
    <ModalDialog title={title} hotkey=":" width={width} height={dialogHeight} footer={footerContent}>
      {/* Search input */}
      <Box flexShrink={0}>
        <InputBox
          beforeCursor={editCtx.beforeCursor}
          afterCursor={editCtx.afterCursor}
          prompt="> "
          promptColor={"$primary"}
          placeholder={placeholderText}
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
