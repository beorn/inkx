/**
 * Project Picker Component
 *
 * Fuzzy search picker for re-parenting tasks to different projects.
 * Press 'p' on a task to open, search to filter, Enter to move.
 */
import React, { useState, useMemo, useCallback } from "react"
import { Box, Text, useInput } from "inkx"
import type { KNode } from "@km/core"
import { useRepo } from "../repo-context.tsx"
import { getNodeDisplayName } from "../state.ts"
import { ModalDialog } from "./shared-components.tsx"

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
 * Get project path from a node (folder/file ancestors)
 */
function getProjectPath(
  node: KNode,
  getNode: (id: string) => KNode | null,
  getDisplayName: (node: KNode) => string,
): string {
  const parts: string[] = []
  let current: KNode | null = node

  while (current) {
    if (current.type === "folder" || current.type === "file") {
      parts.unshift(getDisplayName(current))
    }
    current = current.parent_id ? (getNode(current.parent_id) ?? null) : null
  }

  return parts.join(" / ")
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
 * Project option for the picker
 */
interface ProjectOption {
  node: KNode
  title: string // Display name of the node
  parentContext: string | null // Parent name for context
  path: string // Full path for searching
  isRecent?: boolean
}

/**
 * Get all available project targets (sections, files, folders)
 */
function getProjectOptions(
  allNodes: KNode[],
  getNode: (id: string) => KNode | null,
  getDisplayName: (node: KNode) => string,
  recentIds?: string[],
): ProjectOption[] {
  const options: ProjectOption[] = []
  const recentSet = new Set(recentIds ?? [])

  for (const node of allNodes) {
    // Only show sections, files, and folders as valid targets
    if (
      node.type === "section" ||
      node.type === "file" ||
      node.type === "folder"
    ) {
      const title = getDisplayName(node)
      const parentContext = getParentName(node, getNode, getDisplayName)
      const path = getProjectPath(node, getNode, getDisplayName)
      options.push({
        node,
        title,
        parentContext,
        path: path || title,
        isRecent: recentSet.has(node.id),
      })
    }
  }

  return options
}

export interface ProjectPickerProps {
  onSelect: (targetNode: KNode) => void
  onCancel: () => void
  width: number
  height: number
  recentProjectIds?: string[]
}

export function ProjectPicker({
  onSelect,
  onCancel,
  width,
  height,
  recentProjectIds = [],
}: ProjectPickerProps): React.ReactElement {
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

  // Get and filter options
  const allOptions = useMemo(
    () =>
      getProjectOptions(
        allNodes,
        repo.getNode.bind(repo),
        getDisplayName,
        recentProjectIds,
      ),
    [allNodes, repo, getDisplayName, recentProjectIds],
  )

  const filteredOptions = useMemo(() => {
    if (!query) {
      // Show recent first, then alphabetically by title
      return [...allOptions].sort((a, b) => {
        if (a.isRecent && !b.isRecent) return -1
        if (!a.isRecent && b.isRecent) return 1
        return a.title.localeCompare(b.title)
      })
    }

    // Filter and score by query - match against title, parent, and full path
    return allOptions
      .map((opt) => {
        // Score against title (primary), parent context, and full path
        const titleScore = fuzzyScore(query, opt.title)
        const parentScore = opt.parentContext
          ? fuzzyScore(query, opt.parentContext) * 0.8
          : -1
        const pathScore = fuzzyScore(query, opt.path) * 0.6
        const bestScore = Math.max(titleScore, parentScore, pathScore)
        return { ...opt, score: bestScore }
      })
      .filter((opt) => opt.score >= 0)
      .sort((a, b) => b.score - a.score)
  }, [allOptions, query])

  // Max visible items based on height
  const maxVisible = Math.max(1, height - 6) // Reserve space for header, search, hints

  // Scroll offset to keep selection visible
  const scrollOffset = Math.max(
    0,
    Math.min(
      selectedIndex - Math.floor(maxVisible / 2),
      Math.max(0, filteredOptions.length - maxVisible),
    ),
  )

  const visibleOptions = filteredOptions.slice(
    scrollOffset,
    scrollOffset + maxVisible,
  )

  useInput((input, key) => {
    if (key.escape) {
      onCancel()
      return
    }

    if (key.return) {
      const selected = filteredOptions[selectedIndex]
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
      setSelectedIndex((i) => Math.min(filteredOptions.length - 1, i + 1))
      return
    }

    if (key.backspace || key.delete) {
      setQuery((q) => q.slice(0, -1))
      setSelectedIndex(0)
      return
    }

    // Tab could toggle between search and create mode (future enhancement)

    // Regular character input
    if (input.length === 1 && input >= " ") {
      setQuery((q) => q + input)
      setSelectedIndex(0)
    }
  })

  const footerContent = (
    <Box flexDirection="row" justifyContent="space-between">
      <Text dimColor>
        {"  "}↑↓ nav  Enter select  Esc cancel
      </Text>
      {filteredOptions.length > maxVisible && (
        <Text dimColor>
          {scrollOffset > 0 ? "↑" : " "}
          {` ${selectedIndex + 1}/${filteredOptions.length} `}
          {scrollOffset + maxVisible < filteredOptions.length ? "↓" : " "}
        </Text>
      )}
    </Box>
  )

  return (
    <ModalDialog title="Move to project" width={width} height={height} footer={footerContent}>
      {/* Search input */}
      <Text>
        {"  "}
        <Text color="yellow">{"/ "}</Text>
        <Text>{query}</Text>
        <Text inverse> </Text>
      </Text>
      <Text> </Text>

      {/* Options list */}
      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        {visibleOptions.map((opt, i) => {
          const actualIndex = scrollOffset + i
          const isSelected = actualIndex === selectedIndex

          const prefix = isSelected ? "▸ " : "  "

          return (
            <Box
              key={opt.node.id}
              width="100%"
              backgroundColor={isSelected ? "cyan" : undefined}
            >
              <Text
                color={isSelected ? "black" : undefined}
                wrap="truncate"
              >
                {prefix}
                {opt.title}
                {opt.parentContext && (
                  <Text
                    dimColor={!isSelected}
                    color={isSelected ? "gray" : undefined}
                  >
                    {` < ${opt.parentContext}`}
                  </Text>
                )}
                {opt.isRecent && (
                  <Text color={isSelected ? "blue" : "cyan"} dimColor={!isSelected}>
                    {" (recent)"}
                  </Text>
                )}
              </Text>
            </Box>
          )
        })}
        {filteredOptions.length === 0 && (
          <Text dimColor>  No matching projects</Text>
        )}
      </Box>
    </ModalDialog>
  )
}

// Export fuzzy functions for testing
