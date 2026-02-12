/**
 * Search Dialog Component
 *
 * Fuzzy search dialog for finding items by content or tags.
 * Press '/' to open, search to filter, Enter to navigate to selection.
 */
import React from "react"
import { Box, Text, ErrorBoundary } from "inkx"
import type { KNode } from "@km/core"
import { useRepo, type RepoContextValue } from "../repo-context.tsx"
import { getNodeDisplayName } from "../state.ts"
import { ModalDialog, InputBox, NodeLine } from "./shared-components.tsx"
import { fuzzyMatch, fuzzyScore, getParentName, extractTags } from "./search-utils.ts"
import { parseQuery, type QueryAST } from "@km/core"
import { useLineEdit } from "../hooks/use-line-edit.ts"
import { dialogTargetRef } from "../dialog-target.ts"

// Minimum query length before searching (prevents heavy queries on single chars)
const MIN_QUERY_LENGTH = 2

/**
 * Search result item
 */
interface SearchResult {
  node: KNode
  title: string // Display name of the node
  content: string | undefined // Content for matching
  parentContext: string | null // Parent name for context
  tags: string[] // Extracted tags from content
  matchType: "content" | "tag" // What matched
}

/**
 * Check if node matches query filters
 */
// oxlint-disable-next-line complexity/complexity -- Query matching with refs, text, and phrase combinations
function matchesQuery(result: SearchResult, queryAST: QueryAST): { matches: boolean; matchType: "content" | "tag" } {
  // Check tag filters (#tag syntax)
  if (queryAST.refs.length > 0) {
    for (const ref of queryAST.refs) {
      if (ref.type === "tag") {
        const hasTag = result.tags.some((t) => t.toLowerCase().includes(ref.value.toLowerCase()))
        if (ref.negated ? hasTag : !hasTag) {
          return { matches: false, matchType: "tag" }
        }
        if (hasTag) {
          return { matches: true, matchType: "tag" }
        }
      }
    }
  }

  // Check text search (plain words)
  if (queryAST.text.length > 0 || queryAST.phrases.length > 0) {
    const searchText = result.content?.toLowerCase() || ""
    const titleText = result.title.toLowerCase()

    // Check all text terms
    for (const term of queryAST.text) {
      if (!searchText.includes(term.toLowerCase())) {
        return { matches: false, matchType: "content" }
      }
    }

    // Check all phrases
    for (const phrase of queryAST.phrases) {
      if (!searchText.includes(phrase.toLowerCase()) && !titleText.includes(phrase.toLowerCase())) {
        return { matches: false, matchType: "content" }
      }
    }

    return { matches: true, matchType: "content" }
  }

  // No specific filters, match all
  return { matches: true, matchType: "content" }
}

/**
 * Get all searchable nodes and convert to SearchResult[]
 */
function loadSearchResults(repo: RepoContextValue): SearchResult[] {
  const allNodes = repo.rawQuery<KNode>("SELECT * FROM nodes")
  const results: SearchResult[] = []

  for (const node of allNodes) {
    // Skip folders (not meaningful for search)
    if (node.type === "folder") continue

    // Skip links (search target instead)
    if (node.link_to) continue

    const title = getNodeDisplayName(repo, node)
    const content = node.content
    const parentContext = getParentName(node, repo.getNode.bind(repo), (n) => getNodeDisplayName(repo, n))
    const tags = extractTags(content)

    results.push({
      node,
      title,
      content,
      parentContext,
      tags,
      matchType: "content",
    })
  }

  return results
}

/**
 * Filter and score results by query
 */
function filterResults(allResults: SearchResult[], query: string): (SearchResult & { score: number })[] {
  const queryAST = parseQuery(query)

  return allResults
    .map((result) => {
      const { matches, matchType } = matchesQuery(result, queryAST)
      if (!matches) return null

      // Score against title and content
      const titleScore = fuzzyScore(query, result.title)
      const contentScore = result.content ? fuzzyScore(query, result.content) * 0.7 : -1
      const tagScore = matchType === "tag" && result.tags.length > 0 ? 100 : 0

      const bestScore = Math.max(titleScore, contentScore) + tagScore

      return { ...result, score: bestScore, matchType }
    })
    .filter((r): r is SearchResult & { score: number } => r !== null && r.score >= 0)
    .sort((a, b) => b.score - a.score)
}

// =============================================================================
// SearchResults component
// =============================================================================

interface SearchResultsProps {
  results: SearchResult[]
  query: string
  selectedIndex: number
  scrollOffset: number
  maxVisible: number
}

function SearchResults({
  results,
  query,
  selectedIndex,
  scrollOffset,
  maxVisible,
}: SearchResultsProps): React.ReactElement {
  const filteredResults = React.useMemo(() => filterResults(results, query), [results, query])

  const visibleResults = filteredResults.slice(scrollOffset, scrollOffset + maxVisible)

  if (filteredResults.length === 0) {
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
}

interface SearchDialogHandle {
  focusInput(): void
  clearQuery(): void
}

export const SearchDialog = React.forwardRef<SearchDialogHandle, SearchDialogProps>(function SearchDialog(
  { onSelect, onCancel, width, maxHeight, initialInput, onConsumeInitialInput },
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

  const trimmedQuery = lineEdit.value.trim()

  // Load search results synchronously on first need (SQLite queries are fast)
  const allResultsRef = React.useRef<SearchResult[] | null>(null)
  if (trimmedQuery.length >= MIN_QUERY_LENGTH && !allResultsRef.current) {
    allResultsRef.current = loadSearchResults(repo)
  }

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
  const trimmedQueryRef = React.useRef(trimmedQuery)
  trimmedQueryRef.current = trimmedQuery
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
        if (allResultsRef.current) {
          const filtered = filterResults(allResultsRef.current, trimmedQueryRef.current)
          const selected = filtered[selectedIndexRef.current]
          if (selected) {
            onSelectRef.current(selected.node)
          }
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
  let scrollOffset = 0
  let filteredCount = 0
  if (allResultsRef.current) {
    const filtered = filterResults(allResultsRef.current, trimmedQuery)
    filteredCount = filtered.length
    scrollOffset = Math.max(
      0,
      Math.min(selectedIndex - Math.floor(maxVisible / 2), Math.max(0, filteredCount - maxVisible)),
    )
  }

  // Auto-size: chrome + content rows, capped at maxHeight
  const contentRows =
    trimmedQuery.length < MIN_QUERY_LENGTH
      ? 1 // "Type to search..." or "Type N more chars..."
      : Math.min(filteredCount || 1, maxVisible) // results or "No matching items"
  const dialogHeight = Math.min(DIALOG_CHROME + contentRows, maxHeight)

  const footerContent = (
    <Box flexDirection="row" justifyContent="space-between">
      <Text dimColor>↑↓ nav Enter go Esc cancel #tag filter</Text>
      {filteredCount > maxVisible && (
        <Text dimColor>
          {scrollOffset > 0 ? "↑" : " "}
          {` ${selectedIndex + 1}/${filteredCount} `}
          {scrollOffset + maxVisible < filteredCount ? "↓" : " "}
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

      {/* Spacer before results - flexShrink=0 to maintain spacing */}
      <Box flexShrink={0} height={1}>
        <Text> </Text>
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
          ) : allResultsRef.current ? (
            <SearchResults
              results={allResultsRef.current}
              query={trimmedQuery}
              selectedIndex={selectedIndex}
              scrollOffset={scrollOffset}
              maxVisible={maxVisible}
            />
          ) : null}
        </Box>
      </ErrorBoundary>
    </ModalDialog>
  )
})

// Re-export for testing
export { fuzzyMatch, fuzzyScore, extractTags } from "./search-utils.ts"
