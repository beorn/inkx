/**
 * Search Dialog Component
 *
 * Full-text search dialog using storage-level FTS5.
 * Press '/' to open, search to filter, Enter to navigate to selection.
 */
import React from "react"
import { Box, Text, Small, Muted, Strong, ErrorBoundary, ModalDialog, useSearchOptional } from "@silvery/ag-react"
import type { Searchable } from "@silvery/ag-react"
import type { SearchMatch } from "@silvery/ag-term/search-overlay"
import { KNode } from "@km/core"
import { useRepo } from "../repo-context.tsx"
import type { Repo } from "../repo-context.tsx"
import { getNodeDisplayName } from "../state.ts"
import { InputBox, NodeLine } from "./shared-components.tsx"
import { getParentName, extractTags } from "./search-utils.ts"
import { useDialogInput } from "../hooks/use-dialog-input.ts"
import { computeSearchDecorationsFromSource } from "../text/index.ts"

// Minimum query length before searching (prevents heavy queries on single chars)
const MIN_QUERY_LENGTH = 2

/**
 * Search result item
 */
interface SearchResult {
  node: KNode
  title: string
  parentContext: string | null
  tags: string[]
}

/**
 * Search using storage-level FTS and enrich results with display info.
 * FTS5 handles ranking internally (ORDER BY rank), so no client-side scoring needed.
 *
 * When scopeNodeIds is provided, results are filtered to only include nodes
 * that are descendants of the scope nodes (or the scope nodes themselves).
 */
function searchNodes(repo: Repo, query: string, scopeNodeIds?: string[]): SearchResult[] {
  const nodes = repo.search(query)

  // Build scope set: all descendants of scope nodes (for "selected" scope)
  let scopeSet: Set<string> | null = null
  if (scopeNodeIds && scopeNodeIds.length > 0) {
    scopeSet = new Set<string>()
    for (const nodeId of scopeNodeIds) {
      const subtree = repo.getSubtree(nodeId)
      for (const n of subtree) {
        scopeSet.add(n.id)
      }
    }
  }

  const results: SearchResult[] = []
  for (const node of nodes) {
    // Skip folders (not meaningful for search)
    if (KNode.isOutline(node) && node.fstype === "folder") continue
    // Skip transclusions (search target instead)
    if (KNode.isEmbed(node)) continue
    // Skip nodes outside scope
    if (scopeSet && !scopeSet.has(node.id)) continue

    const title = getNodeDisplayName(repo, node)
    const parentContext = getParentName(node, repo.getNode.bind(repo), (n) => getNodeDisplayName(repo, n))
    const tags = extractTags(node.content)

    results.push({ node, title, parentContext, tags })
  }

  return results
}

// =============================================================================
// SearchResults component
// =============================================================================

interface SearchResultsProps {
  results: SearchResult[]
  selectedIndex: number
  scrollOffset: number
  maxVisible: number
  query: string
}

function SearchResults({
  results,
  selectedIndex,
  scrollOffset,
  maxVisible,
  query,
}: SearchResultsProps): React.ReactElement {
  const visibleResults = results.slice(scrollOffset, scrollOffset + maxVisible)

  if (results.length === 0) {
    return <Small>No matching items</Small>
  }

  return (
    <>
      {visibleResults.map((result, i) => {
        const actualIndex = scrollOffset + i
        const isSelected = actualIndex === selectedIndex
        const decorations = query ? computeSearchDecorationsFromSource(result.title, query, isSelected) : undefined

        return (
          <NodeLine
            key={`${result.node.id}-${i}`}
            node={result.node}
            title={result.title}
            parentContext={result.parentContext}
            isSelected={isSelected}
            decorations={decorations}
          >
            {result.tags.length > 0 && (
              <Text color={isSelected ? "$selection" : "$primary"} dimColor={!isSelected}>
                {` #${result.tags.join(" #")}`}
              </Text>
            )}
          </NodeLine>
        )
      })}
    </>
  )
}

// =============================================================================
// SearchDialog component
// =============================================================================

interface SearchDialogProps {
  onSelect: (targetNode: KNode) => void
  onCancel: () => void
  width: number
  maxHeight: number
  /** Initial input buffered before dialog's useInput registered */
  initialInput?: string
  /** Callback to clear the buffer after consuming it */
  onConsumeInitialInput?: () => void
  /** Search scope: "all" = entire repo, "selected" = cursor node & descendants */
  scope?: "all" | "selected"
  /** Node IDs defining scope when scope is "selected" */
  scopeNodeIds?: string[]
}

interface SearchDialogHandle {
  focusInput(): void
  clearQuery(): void
}

export const SearchDialog = React.forwardRef<SearchDialogHandle, SearchDialogProps>(function SearchDialog(
  { onSelect, onCancel, width, maxHeight, initialInput, onConsumeInitialInput, scope = "all", scopeNodeIds },
  ref,
): React.ReactElement {
  const repo = useRepo()
  const [selectedIndex, setSelectedIndex] = React.useState(0)

  // Refs for callbacks used in useDialogInput closures
  const selectedIndexRef = React.useRef(selectedIndex)
  selectedIndexRef.current = selectedIndex
  const onCancelRef = React.useRef(onCancel)
  onCancelRef.current = onCancel
  const onSelectRef = React.useRef(onSelect)
  onSelectRef.current = onSelect
  const resultsRef = React.useRef<SearchResult[]>([])

  const editCtx = useDialogInput({
    initialValue: initialInput ?? "",
    onChange: () => setSelectedIndex(0),
    navUp: () => setSelectedIndex((i) => Math.max(0, i - 1)),
    navDown: () => setSelectedIndex((i) => Math.min(i + 1, Math.max(0, resultsRef.current.length - 1))),
    onConfirm: () => {
      const selected = resultsRef.current[selectedIndexRef.current]
      if (selected) {
        onSelectRef.current(selected.node)
      }
    },
    onCancel: () => onCancelRef.current(),
  })

  // Consume the initial input buffer after first render
  React.useEffect(() => {
    if (initialInput && onConsumeInitialInput) {
      onConsumeInitialInput()
    }
  }, []) // Only on mount

  // Reset selection when scope changes
  React.useEffect(() => {
    setSelectedIndex(0)
  }, [scope])

  const trimmedQuery = editCtx.value.trim()

  // Run FTS query on each query change (FTS5 queries are fast, typically <1ms)
  // When scope is "selected", filter results to cursor subtree
  const effectiveScopeNodeIds = scope === "selected" ? scopeNodeIds : undefined
  const results = React.useMemo(
    () => (trimmedQuery.length >= MIN_QUERY_LENGTH ? searchNodes(repo, trimmedQuery, effectiveScopeNodeIds) : []),
    [repo, trimmedQuery, effectiveScopeNodeIds],
  )
  resultsRef.current = results

  // Register as a Searchable in silvery's SearchProvider (if available).
  // This integrates repo search with the same infrastructure as Ctrl+F local find.
  // The dialog keeps its own state for the rich UI; this just makes the search
  // infrastructure aware that a repo searchable exists while the dialog is open.
  const searchCtx = useSearchOptional()
  React.useEffect(() => {
    if (!searchCtx) return
    const repoSearchable: Searchable = {
      search(query: string): SearchMatch[] {
        const nodes = searchNodes(repo, query, effectiveScopeNodeIds)
        return nodes.map((_node, i) => ({
          row: i,
          startCol: 0,
          endCol: 0,
        }))
      },
      reveal(match: SearchMatch) {
        const node = resultsRef.current[match.row]
        if (node) {
          onSelectRef.current(node.node)
        }
      },
    }
    return searchCtx.registerSearchable("repo", repoSearchable)
  }, [searchCtx, repo, effectiveScopeNodeIds])

  React.useImperativeHandle(ref, () => ({
    focusInput() {
      // No-op for now - TUI doesn't have native focus
    },
    clearQuery() {
      editCtx.clear()
      setSelectedIndex(0)
    },
  }))

  // Dialog chrome overhead: border(2) + paddingY(2) + title+spacer(2) + input(3: focusRing border+text+border) + footer(2) = 11
  // (No separate scope line — scope is shown as InputBox prompt prefix)
  const DIALOG_CHROME = 11
  const maxVisible = Math.max(1, maxHeight - DIALOG_CHROME)

  // Calculate scroll offset and content-based height
  const resultCount = results.length
  const scrollOffset =
    resultCount > 0
      ? Math.max(0, Math.min(selectedIndex - Math.floor(maxVisible / 2), Math.max(0, resultCount - maxVisible)))
      : 0

  // Auto-size: chrome + content rows, capped at maxHeight
  const contentRows =
    trimmedQuery.length < MIN_QUERY_LENGTH
      ? 1 // "Type to search..." or "Type N more chars..."
      : Math.min(resultCount || 1, maxVisible) // results or "No matching items"
  const dialogHeight = Math.min(DIALOG_CHROME + contentRows, maxHeight)

  // Scope label: "All" or the scoped node's name (e.g., "in Inbox")
  const scopeNodeName = React.useMemo(() => {
    if (scope !== "selected" || !scopeNodeIds?.length) return null
    const firstScopeId = scopeNodeIds[0]
    const node = firstScopeId ? repo.getNode(firstScopeId) : null
    return node ? getNodeDisplayName(repo, node) : null
  }, [scope, scopeNodeIds, repo])

  // Scope prompt prefix for the InputBox (e.g., "[All] " or "[in Alpha] ")
  const scopePrompt = scope === "all" ? "All ▸ " : `in ${scopeNodeName ?? "selection"} ▸ `
  const scopePromptColor = scope === "all" ? "$fg" : "$primary"

  const footerContent = (
    <Box flexDirection="row" justifyContent="space-between">
      <Muted>
        {"↑↓ nav  Enter go  "}
        <Strong>Tab</Strong>
        {scope === "all" && scopeNodeName
          ? ` narrow to ${scopeNodeName}`
          : scope === "all"
            ? " narrow scope"
            : " search all"}
        {"  Esc cancel"}
      </Muted>
      {resultCount > maxVisible && (
        <Small>
          {scrollOffset > 0 ? "↑" : " "}
          {` ${selectedIndex + 1}/${resultCount} `}
          {scrollOffset + maxVisible < resultCount ? "↓" : " "}
        </Small>
      )}
    </Box>
  )

  return (
    <ModalDialog title="Search" width={width} height={dialogHeight} footer={footerContent}>
      {/* Search input with scope prefix and readline editing */}
      <Box flexShrink={0}>
        <InputBox
          beforeCursor={editCtx.beforeCursor}
          afterCursor={editCtx.afterCursor}
          prompt={scopePrompt}
          promptColor={scopePromptColor}
          focusRing
        />
      </Box>

      {/* Results list — flexGrow fills available height */}
      <ErrorBoundary fallback={<Text color={"$error"}>Search error</Text>}>
        <Box flexDirection="column" flexGrow={1} flexShrink={1} overflow="hidden">
          {trimmedQuery.length < MIN_QUERY_LENGTH ? (
            <Small>
              {trimmedQuery.length === 0
                ? "Type to search..."
                : `Type ${MIN_QUERY_LENGTH - trimmedQuery.length} more char${MIN_QUERY_LENGTH - trimmedQuery.length > 1 ? "s" : ""}...`}
            </Small>
          ) : (
            <SearchResults
              results={results}
              selectedIndex={selectedIndex}
              scrollOffset={scrollOffset}
              maxVisible={maxVisible}
              query={trimmedQuery}
            />
          )}
        </Box>
      </ErrorBoundary>
    </ModalDialog>
  )
})

// Re-export for testing
export { extractTags } from "./search-utils.ts"
