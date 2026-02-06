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
import { ModalDialog, InputBox } from "./shared-components.tsx"
import { parseQuery, type QueryAST } from "@km/core"
import { useLineEdit } from "../hooks/use-line-edit.ts"
import { dialogTargetRef } from "../dialog-target.ts"
import {
  createSuspenseLoader,
  type SuspenseLoader,
} from "../hooks/use-suspense-loader.ts"

// Minimum query length before searching (prevents heavy queries on single chars)
const MIN_QUERY_LENGTH = 2

/**
 * Simple fuzzy match - check if query chars appear in order in target
 */
function fuzzyMatch(query: string, target: string): boolean {
  const lowerQuery = query.toLowerCase()
  const lowerTarget = target.toLowerCase()

  let queryIndex = 0
  for (
    let i = 0;
    i < lowerTarget.length && queryIndex < lowerQuery.length;
    i++
  ) {
    if (lowerTarget[i] === lowerQuery[queryIndex]) {
      queryIndex++
    }
  }
  return queryIndex === lowerQuery.length
}

/**
 * Score a fuzzy match (higher = better)
 */
function fuzzyScore(query: string, target: string): number {
  const lowerQuery = query.toLowerCase()
  const lowerTarget = target.toLowerCase()

  if (!fuzzyMatch(query, target)) return -1

  let score = 0
  let queryIndex = 0
  let consecutive = 0

  for (
    let i = 0;
    i < lowerTarget.length && queryIndex < lowerQuery.length;
    i++
  ) {
    if (lowerTarget[i] === lowerQuery[queryIndex]) {
      // Bonus for consecutive matches
      consecutive++
      score += consecutive * 2

      // Bonus for match at start
      if (i === 0) score += 10

      // Bonus for match after separator
      if (i > 0 && (lowerTarget[i - 1] === "/" || lowerTarget[i - 1] === " ")) {
        score += 5
      }

      queryIndex++
    } else {
      consecutive = 0
    }
  }

  // Penalty for longer targets (prefer shorter matches)
  score -= lowerTarget.length * 0.1

  return score
}

/**
 * Get parent display name for context
 */
function getParentName(
  node: KNode,
  getNode: (id: string) => KNode | null,
  getDisplayName: (node: KNode) => string,
): string | null {
  if (!node.parent_id) return null
  const parent = getNode(node.parent_id)
  if (!parent) return null
  return getDisplayName(parent)
}

/**
 * Extract tags from content (words starting with #)
 */
function extractTags(content: string | undefined): string[] {
  if (!content) return []
  const tagRegex = /#(\w+)/g
  const tags: string[] = []
  let match
  while ((match = tagRegex.exec(content)) !== null) {
    if (match[1]) tags.push(match[1])
  }
  return tags
}

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
// oxlint-disable-next-line complexity/max-cognitive -- Query matching with refs, text, and phrase combinations
function matchesQuery(
  result: SearchResult,
  queryAST: QueryAST,
): { matches: boolean; matchType: "content" | "tag" } {
  // Check tag filters (#tag syntax)
  if (queryAST.refs.length > 0) {
    for (const ref of queryAST.refs) {
      if (ref.type === "tag") {
        const hasTag = result.tags.some((t) =>
          t.toLowerCase().includes(ref.value.toLowerCase()),
        )
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
      if (
        !searchText.includes(phrase.toLowerCase()) &&
        !titleText.includes(phrase.toLowerCase())
      ) {
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
    const parentContext = getParentName(node, repo.getNode.bind(repo), (n) =>
      getNodeDisplayName(repo, n),
    )
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
function filterResults(
  allResults: SearchResult[],
  query: string,
): (SearchResult & { score: number })[] {
  const queryAST = parseQuery(query)

  return allResults
    .map((result) => {
      const { matches, matchType } = matchesQuery(result, queryAST)
      if (!matches) return null

      // Score against title and content
      const titleScore = fuzzyScore(query, result.title)
      const contentScore = result.content
        ? fuzzyScore(query, result.content) * 0.7
        : -1
      const tagScore = matchType === "tag" && result.tags.length > 0 ? 100 : 0

      const bestScore = Math.max(titleScore, contentScore) + tagScore

      return { ...result, score: bestScore, matchType }
    })
    .filter(
      (r): r is SearchResult & { score: number } => r !== null && r.score >= 0,
    )
    .sort((a, b) => b.score - a.score)
}

// =============================================================================
// SearchResults component (suspends while loading)
// =============================================================================

interface SearchResultsProps {
  loader: SuspenseLoader<SearchResult[]>
  query: string
  selectedIndex: number
  scrollOffset: number
  maxVisible: number
}

function SearchResults({
  loader,
  query,
  selectedIndex,
  scrollOffset,
  maxVisible,
}: SearchResultsProps): React.ReactElement {
  const allResults = loader.read() // Suspends if not ready
  const filteredResults = React.useMemo(
    () => filterResults(allResults, query),
    [allResults, query],
  )

  const visibleResults = filteredResults.slice(
    scrollOffset,
    scrollOffset + maxVisible,
  )

  if (filteredResults.length === 0) {
    return <Text dimColor>No matching items</Text>
  }

  return (
    <>
      {visibleResults.map((result, i) => {
        const actualIndex = scrollOffset + i
        const isSelected = actualIndex === selectedIndex

        const prefix = isSelected ? "▸ " : "  "
        const typeIcon =
          result.node.type === "task"
            ? "□"
            : result.node.type === "file"
              ? "📄"
              : result.node.type === "section"
                ? "§"
                : "•"

        return (
          <Box
            key={result.node.id}
            width="100%"
            height={1}
            backgroundColor={isSelected ? "cyan" : "black"}
          >
            <Text color={isSelected ? "black" : undefined} wrap="truncate">
              {prefix}
              <Text dimColor={!isSelected}>{typeIcon} </Text>
              {result.title}
              {result.parentContext && (
                <Text
                  dimColor={!isSelected}
                  color={isSelected ? "gray" : undefined}
                >
                  {` < ${result.parentContext}`}
                </Text>
              )}
              {result.tags.length > 0 && (
                <Text
                  color={isSelected ? "blue" : "cyan"}
                  dimColor={!isSelected}
                >
                  {` #${result.tags.join(" #")}`}
                </Text>
              )}
            </Text>
          </Box>
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
  height: number
  /** Initial input buffered before dialog's useInput registered */
  initialInput?: string
  /** Callback to clear the buffer after consuming it */
  onConsumeInitialInput?: () => void
}

interface SearchDialogHandle {
  focusInput(): void
  clearQuery(): void
}

export const SearchDialog = React.forwardRef<
  SearchDialogHandle,
  SearchDialogProps
>(function SearchDialog(
  { onSelect, onCancel, width, height, initialInput, onConsumeInitialInput },
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

  const deferredQuery = React.useDeferredValue(lineEdit.value)
  const trimmedQuery = deferredQuery.trim()

  // Create loader only when query is long enough (lazy load)
  const loaderRef = React.useRef<SuspenseLoader<SearchResult[]> | null>(null)
  if (trimmedQuery.length >= MIN_QUERY_LENGTH && !loaderRef.current) {
    loaderRef.current = createSuspenseLoader(() => loadSearchResults(repo))
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

  // For scroll calculation, we need to know filtered count
  // But we can't know that until results load, so estimate
  const maxVisible = Math.max(1, height - 11)

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
        if (loaderRef.current?.status === "resolved") {
          const allResults = loaderRef.current.read()
          const filtered = filterResults(allResults, trimmedQueryRef.current)
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

  // Calculate scroll offset (needs filtered count)
  let scrollOffset = 0
  let filteredCount = 0
  if (loaderRef.current?.status === "resolved") {
    const filtered = filterResults(loaderRef.current.read(), trimmedQuery)
    filteredCount = filtered.length
    scrollOffset = Math.max(
      0,
      Math.min(
        selectedIndex - Math.floor(maxVisible / 2),
        Math.max(0, filteredCount - maxVisible),
      ),
    )
  }

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
    <ModalDialog
      title="Search"
      width={width}
      height={height}
      footer={footerContent}
    >
      {/* Search input with readline editing - flexShrink=0 prevents being pushed out */}
      <Box flexShrink={0}>
        <InputBox
          beforeCursor={lineEdit.beforeCursor}
          afterCursor={lineEdit.afterCursor}
          placeholder="Type to search..."
        />
      </Box>

      {/* Spacer before results - flexShrink=0 to maintain spacing */}
      <Box flexShrink={0} height={1}>
        <Text> </Text>
      </Box>

      {/* Results list — flexGrow fills available height */}
      <ErrorBoundary fallback={<Text color="red">Search error</Text>}>
        <Box
          flexDirection="column"
          flexGrow={1}
          flexShrink={1}
          overflow="hidden"
        >
          {trimmedQuery.length < MIN_QUERY_LENGTH ? (
            <Text dimColor>
              {trimmedQuery.length === 0
                ? "Type to search..."
                : `Type ${MIN_QUERY_LENGTH - trimmedQuery.length} more char${MIN_QUERY_LENGTH - trimmedQuery.length > 1 ? "s" : ""}...`}
            </Text>
          ) : loaderRef.current ? (
            <React.Suspense fallback={<Text dimColor> Loading...</Text>}>
              <SearchResults
                loader={loaderRef.current}
                query={trimmedQuery}
                selectedIndex={selectedIndex}
                scrollOffset={scrollOffset}
                maxVisible={maxVisible}
              />
            </React.Suspense>
          ) : null}
        </Box>
      </ErrorBoundary>
    </ModalDialog>
  )
})

// Export fuzzy functions for testing
export { fuzzyMatch, fuzzyScore, extractTags }
