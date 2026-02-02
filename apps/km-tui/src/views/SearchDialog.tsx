/**
 * Search Dialog Component
 *
 * Fuzzy search dialog for finding items by content or tags.
 * Press '/' to open, search to filter, Enter to navigate to selection.
 */
import React, { useState, useMemo, useCallback } from "react"
import { Box, Text, useInput, ErrorBoundary } from "inkx"
import type { KNode } from "@km/core"
import { useRepo } from "../repo-context.tsx"
import { getNodeDisplayName } from "../state.ts"
import { ModalDialog } from "./shared-components.tsx"
import { parseQuery, type QueryAST } from "@km/core"

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
 * Get all searchable nodes
 */
function getSearchResults(
  allNodes: KNode[],
  getNode: (id: string) => KNode | null,
  getDisplayName: (node: KNode) => string,
): SearchResult[] {
  const results: SearchResult[] = []

  for (const node of allNodes) {
    // Skip folders (not meaningful for search)
    if (node.type === "folder") continue

    // Skip links (search target instead)
    if (node.link_to) continue

    const title = getDisplayName(node)
    const content = node.content
    const parentContext = getParentName(node, getNode, getDisplayName)
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

export interface SearchDialogProps {
  onSelect: (targetNode: KNode) => void
  onCancel: () => void
  width: number
  height: number
}

export function SearchDialog({
  onSelect,
  onCancel,
  width,
  height,
}: SearchDialogProps): React.ReactElement {
  const repo = useRepo()
  const [query, setQuery] = useState("")
  const [selectedIndex, setSelectedIndex] = useState(0)

  // Get all nodes using rawQuery
  const allNodes = useMemo(
    () => repo.rawQuery<KNode>("SELECT * FROM nodes"),
    [repo],
  )

  // Wrap getNodeDisplayName with repo for use in helper functions
  const getDisplayName = useCallback(
    (node: KNode) => getNodeDisplayName(repo, node),
    [repo],
  )

  // Get all search results
  const allResults = useMemo(
    () => getSearchResults(allNodes, repo.getNode.bind(repo), getDisplayName),
    [allNodes, repo, getDisplayName],
  )

  // Parse query and filter results
  const filteredResults = useMemo(() => {
    if (!query.trim()) {
      // Show recent items (tasks, files, sections) sorted by updated_at
      return [...allResults]
        .filter(
          (r) =>
            r.node.type === "task" ||
            r.node.type === "file" ||
            r.node.type === "section",
        )
        .sort((a, b) => b.node.updated_at - a.node.updated_at)
        .slice(0, 20)
    }

    // Parse query for structured search
    const queryAST = parseQuery(query)

    // Filter and score by query
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
        (r): r is SearchResult & { score: number } =>
          r !== null && r.score >= 0,
      )
      .sort((a, b) => b.score - a.score)
      .slice(0, 50) // Limit to top 50 results
  }, [allResults, query])

  // Max visible items based on height
  const maxVisible = Math.max(1, height - 6) // Reserve space for header, search, hints

  // Scroll offset to keep selection visible
  const scrollOffset = Math.max(
    0,
    Math.min(
      selectedIndex - Math.floor(maxVisible / 2),
      Math.max(0, filteredResults.length - maxVisible),
    ),
  )

  const visibleResults = filteredResults.slice(
    scrollOffset,
    scrollOffset + maxVisible,
  )

  useInput((input, key) => {
    if (key.escape) {
      onCancel()
      return
    }

    if (key.return) {
      const selected = filteredResults[selectedIndex]
      if (selected) {
        onSelect(selected.node)
      }
      return
    }

    if (key.upArrow || (key.ctrl && input === "p")) {
      setSelectedIndex((i) => Math.max(0, i - 1))
      return
    }

    if (key.downArrow || (key.ctrl && input === "n")) {
      setSelectedIndex((i) => Math.min(filteredResults.length - 1, i + 1))
      return
    }

    if (key.backspace || key.delete) {
      setQuery((q) => q.slice(0, -1))
      setSelectedIndex(0)
      return
    }

    // Regular character input
    if (input.length === 1 && input >= " ") {
      setQuery((q) => q + input)
      setSelectedIndex(0)
    }
  })

  const innerWidth = Math.max(10, width - 8) // Account for border + paddingX(2)

  return (
    <ModalDialog borderColor="magenta" width={width} height={height}>
      {/* Header */}
      <Text bold>Search items:</Text>

      {/* Separator */}
      <Text dimColor>{"─".repeat(innerWidth)}</Text>

      {/* Search input */}
      <Text>
        <Text dimColor>[Search: </Text>
        <Text color="magenta">{query || " "}</Text>
        <Text inverse> </Text>
        <Text dimColor>]</Text>
      </Text>

      {/* Results list */}
      <ErrorBoundary fallback={<Text color="red">Search error</Text>}>
        <Box flexDirection="column" flexGrow={1}>
          {visibleResults.map((result, i) => {
            const actualIndex = scrollOffset + i
            const isSelected = actualIndex === selectedIndex

            // Calculate available width for content
            const prefix = isSelected ? "▸ " : "  "
            const typeIcon =
              result.node.type === "task"
                ? "☐"
                : result.node.type === "file"
                  ? "📄"
                  : result.node.type === "section"
                    ? "§"
                    : "•"
            const tagSuffix =
              result.tags.length > 0 ? ` #${result.tags.join(" #")}` : ""
            const contextSuffix = result.parentContext
              ? ` < ${result.parentContext}`
              : ""

            const availableWidth =
              innerWidth -
              prefix.length -
              2 - // typeIcon + space
              tagSuffix.length -
              contextSuffix.length -
              2

            // Truncate title if needed
            const displayTitle =
              result.title.length > availableWidth
                ? result.title.slice(0, availableWidth - 1) + "…"
                : result.title

            return (
              <Text
                key={result.node.id}
                backgroundColor={isSelected ? "magenta" : undefined}
                color={isSelected ? "black" : undefined}
                wrap="truncate"
              >
                {prefix}
                <Text dimColor={!isSelected}>{typeIcon} </Text>
                {displayTitle}
                {result.parentContext && (
                  <Text
                    dimColor={!isSelected}
                    color={isSelected ? "gray" : undefined}
                  >
                    {` < ${result.parentContext}`}
                  </Text>
                )}
                {result.tags.length > 0 && (
                  <Text color="magenta" dimColor={!isSelected}>
                    {` #${result.tags.join(" #")}`}
                  </Text>
                )}
              </Text>
            )
          })}
          {filteredResults.length === 0 && query && (
            <Text dimColor>No matching items</Text>
          )}
          {filteredResults.length === 0 && !query && (
            <Text dimColor>Start typing to search...</Text>
          )}
        </Box>
      </ErrorBoundary>

      {/* Scroll indicator */}
      {filteredResults.length > maxVisible && (
        <Text dimColor>
          {scrollOffset > 0 ? "↑ " : "  "}
          {`${selectedIndex + 1}/${filteredResults.length}`}
          {scrollOffset + maxVisible < filteredResults.length ? " ↓" : ""}
        </Text>
      )}

      {/* Hints */}
      <Text dimColor>
        ↑↓:nav Enter:select Esc:cancel | Use #tag to filter by tags
      </Text>
    </ModalDialog>
  )
}

// Export fuzzy functions for testing
export { fuzzyMatch, fuzzyScore, extractTags }
