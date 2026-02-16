/**
 * Search Dialog Component
 *
 * Full-text search dialog using storage-level FTS5.
 * Press '/' to open, search to filter, Enter to navigate to selection.
 */
import React from "react"
import { Box, Text, ErrorBoundary } from "inkx"
import type { KNode } from "@km/core"
import { useRepo } from "../repo-context.tsx"
import type { Repo } from "../repo-context.tsx"
import { getNodeDisplayName } from "../state.ts"
import { ModalDialog, InputBox, NodeLine } from "./shared-components.tsx"
import { getParentName, extractTags } from "./search-utils.ts"
import { useLineEdit } from "../hooks/use-line-edit.ts"
import { dialogTargetRef } from "../dialog-target.ts"

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
    if (node.type === "oi" && node.fstype === "folder") continue
    // Skip links (search target instead)
    if (node.link_to) continue
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
}

function SearchResults({ results, selectedIndex, scrollOffset, maxVisible }: SearchResultsProps): React.ReactElement {
  const visibleResults = results.slice(scrollOffset, scrollOffset + maxVisible)

  if (results.length === 0) {
    return <Text dimColor>No matching items</Text>
  }

  return (
    <>
      {visibleResults.map((result, i) => {
        const actualIndex = scrollOffset + i
        const isSelected = actualIndex === selectedIndex

        return (
          <NodeLine
            key={result.node.id}
            node={result.node}
            title={result.title}
            parentContext={result.parentContext}
            isSelected={isSelected}
          >
            {result.tags.length > 0 && (
              <Text color={isSelected ? "blue" : "cyan"} dimColor={!isSelected}>
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

  // Readline-style line editing for search input
  const lineEdit = useLineEdit({
    initialValue: initialInput ?? "",
    onChange: () => setSelectedIndex(0), // Reset selection when query changes
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

  const trimmedQuery = lineEdit.value.trim()

  // Run FTS query on each query change (FTS5 queries are fast, typically <1ms)
  // When scope is "selected", filter results to cursor subtree
  const effectiveScopeNodeIds = scope === "selected" ? scopeNodeIds : undefined
  const results = React.useMemo(
    () => (trimmedQuery.length >= MIN_QUERY_LENGTH ? searchNodes(repo, trimmedQuery, effectiveScopeNodeIds) : []),
    [repo, trimmedQuery, effectiveScopeNodeIds],
  )

  React.useImperativeHandle(ref, () => ({
    focusInput() {
      // No-op for now - TUI doesn't have native focus
    },
    clearQuery() {
      lineEdit.clear()
      setSelectedIndex(0)
    },
  }))

  // Dialog chrome overhead: border(2) + paddingY(2) + title+spacer(2) + input(2) + spacer(1) + footer(2) = 11
  const DIALOG_CHROME = 11
  const maxVisible = Math.max(1, maxHeight - DIALOG_CHROME)

  // Register dialog target for command system navigation
  // Use refs to avoid stale closure issues
  const selectedIndexRef = React.useRef(selectedIndex)
  selectedIndexRef.current = selectedIndex
  const resultsRef = React.useRef(results)
  resultsRef.current = results
  const onCancelRef = React.useRef(onCancel)
  onCancelRef.current = onCancel
  const onSelectRef = React.useRef(onSelect)
  onSelectRef.current = onSelect

  React.useLayoutEffect(() => {
    dialogTargetRef.current = {
      navUp() {
        setSelectedIndex((i) => Math.max(0, i - 1))
      },
      navDown() {
        setSelectedIndex((i) => i + 1) // Clamped by rendering
      },
      confirm() {
        const selected = resultsRef.current[selectedIndexRef.current]
        if (selected) {
          onSelectRef.current(selected.node)
        }
      },
      cancel() {
        onCancelRef.current()
      },
    }
    return () => {
      dialogTargetRef.current = null
    }
  }, [])

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
    const node = repo.getNode(scopeNodeIds[0]!)
    return node ? getNodeDisplayName(repo, node) : null
  }, [scope, scopeNodeIds, repo])

  const footerContent = (
    <Box flexDirection="row" justifyContent="space-between">
      <Text dimColor>↑↓ nav  Enter go  Tab scope  Esc cancel</Text>
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
    <ModalDialog title="Search" width={width} height={dialogHeight} footer={footerContent}>
      {/* Search input with readline editing - flexShrink=0 prevents being pushed out */}
      <Box flexShrink={0}>
        <InputBox beforeCursor={lineEdit.beforeCursor} afterCursor={lineEdit.afterCursor} />
      </Box>

      {/* Scope indicator line */}
      <Box flexShrink={0} height={1}>
        <Text dimColor>
          {scope === "all" ? (
            <>
              <Text bold color="white">All</Text>
              {scopeNodeName ? <Text> · Tab to narrow to {scopeNodeName}</Text> : <Text> · Tab to narrow</Text>}
            </>
          ) : (
            <>
              <Text bold color="cyan">in {scopeNodeName ?? "selection"}</Text>
              <Text> · Tab for all</Text>
            </>
          )}
        </Text>
      </Box>

      {/* Results list — flexGrow fills available height */}
      <ErrorBoundary fallback={<Text color="red">Search error</Text>}>
        <Box flexDirection="column" flexGrow={1} flexShrink={1} overflow="hidden">
          {trimmedQuery.length < MIN_QUERY_LENGTH ? (
            <Text dimColor>
              {trimmedQuery.length === 0
                ? "Type to search..."
                : `Type ${MIN_QUERY_LENGTH - trimmedQuery.length} more char${MIN_QUERY_LENGTH - trimmedQuery.length > 1 ? "s" : ""}...`}
            </Text>
          ) : (
            <SearchResults
              results={results}
              selectedIndex={selectedIndex}
              scrollOffset={scrollOffset}
              maxVisible={maxVisible}
            />
          )}
        </Box>
      </ErrorBoundary>
    </ModalDialog>
  )
})

// Re-export for testing
export { extractTags } from "./search-utils.ts"
