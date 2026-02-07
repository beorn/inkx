/**
 * Project Picker Component
 *
 * Fuzzy search picker for re-parenting tasks to different projects.
 * Press 'p' on a task to open, search to filter, Enter to move.
 */
import React from "react"
import { Box, Text } from "inkx"
import type { KNode } from "@km/core"
import { useRepo, type RepoContextValue } from "../repo-context.tsx"
import { getNodeDisplayName } from "../state.ts"
import { ModalDialog, NodeLine } from "./shared-components.tsx"
import { fuzzyMatch, fuzzyScore, getParentName } from "./search-utils.ts"
import { dialogTargetRef } from "../dialog-target.ts"
import {
  blockEditTargetRef,
  type BlockEditTarget,
} from "../block-edit-target.ts"
import {
  createSuspenseLoader,
  type SuspenseLoader,
} from "../hooks/use-suspense-loader.ts"

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
 * Load all project options from repo
 */
function loadProjectOptions(
  repo: RepoContextValue,
  recentIds: string[],
): ProjectOption[] {
  const allNodes = repo.rawQuery<KNode>("SELECT * FROM nodes")
  const options: ProjectOption[] = []
  const recentSet = new Set(recentIds)
  const getDisplayName = (node: KNode) => getNodeDisplayName(repo, node)

  for (const node of allNodes) {
    // Only show sections, files, and folders as valid targets
    if (
      node.type === "section" ||
      node.type === "file" ||
      node.type === "folder"
    ) {
      const title = getDisplayName(node)
      const parentContext = getParentName(
        node,
        repo.getNode.bind(repo),
        getDisplayName,
      )
      const path = getProjectPath(node, repo.getNode.bind(repo), getDisplayName)
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

/**
 * Filter and score options by query
 */
function filterOptions(
  allOptions: ProjectOption[],
  query: string,
): (ProjectOption & { score?: number })[] {
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
    .filter((opt) => (opt.score ?? -1) >= 0)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
}

// =============================================================================
// ProjectOptions component (suspends while loading)
// =============================================================================

interface ProjectOptionsProps {
  loader: SuspenseLoader<ProjectOption[]>
  query: string
  selectedIndex: number
  scrollOffset: number
  maxVisible: number
}

function ProjectOptions({
  loader,
  query,
  selectedIndex,
  scrollOffset,
  maxVisible,
}: ProjectOptionsProps): React.ReactElement {
  const allOptions = loader.read() // Suspends if not ready
  const filteredOptions = React.useMemo(
    () => filterOptions(allOptions, query),
    [allOptions, query],
  )

  const visibleOptions = filteredOptions.slice(
    scrollOffset,
    scrollOffset + maxVisible,
  )

  if (filteredOptions.length === 0) {
    return <Text dimColor> No matching projects</Text>
  }

  return (
    <>
      {visibleOptions.map((opt, i) => {
        const actualIndex = scrollOffset + i
        const isSelected = actualIndex === selectedIndex

        return (
          <NodeLine
            key={opt.node.id}
            node={opt.node}
            title={opt.title}
            parentContext={opt.parentContext}
            isSelected={isSelected}
          >
            {opt.isRecent && (
              <Text color={isSelected ? "blue" : "cyan"} dimColor={!isSelected}>
                {" (recent)"}
              </Text>
            )}
          </NodeLine>
        )
      })}
    </>
  )
}

// =============================================================================
// ProjectPicker component
// =============================================================================

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
  const [query, setQuery] = React.useState("")
  const [selectedIndex, setSelectedIndex] = React.useState(0)

  // Create loader on mount (loads in background via Suspense)
  const loaderRef = React.useRef<SuspenseLoader<ProjectOption[]> | null>(null)
  if (!loaderRef.current) {
    loaderRef.current = createSuspenseLoader(() =>
      loadProjectOptions(repo, recentProjectIds),
    )
  }

  // Max visible items: height - borders(2) - paddingY(2) - title(1) - input(1) - spacer(1) - footer(1) = height - 8
  const maxVisible = Math.max(1, height - 8)

  // Calculate scroll offset (needs filtered count)
  let scrollOffset = 0
  let filteredCount = 0
  if (loaderRef.current?.status === "resolved") {
    const filtered = filterOptions(loaderRef.current.read(), query)
    filteredCount = filtered.length
    scrollOffset = Math.max(
      0,
      Math.min(
        selectedIndex - Math.floor(maxVisible / 2),
        Math.max(0, filteredCount - maxVisible),
      ),
    )
  }

  // Use refs to avoid stale closure issues with the handler
  const selectedIndexRef = React.useRef(selectedIndex)
  selectedIndexRef.current = selectedIndex
  const queryRef = React.useRef(query)
  queryRef.current = query
  const onCancelRef = React.useRef(onCancel)
  onCancelRef.current = onCancel
  const onSelectRef = React.useRef(onSelect)
  onSelectRef.current = onSelect

  // Register dialog target for command system navigation
  // and block edit target for text input
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
          const allOptions = loaderRef.current.read()
          const filtered = filterOptions(allOptions, queryRef.current)
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

    // Simple text edit target for query input
    const textTarget: BlockEditTarget = {
      insertChar(char: string) {
        setQuery((q) => q + char)
        setSelectedIndex(0)
      },
      deleteBackward() {
        setQuery((q) => q.slice(0, -1))
        setSelectedIndex(0)
      },
      deleteForward() {},
      cursorLeft() {},
      cursorRight() {},
      cursorStart() {},
      cursorEnd() {},
      deleteWord() {
        setQuery((q) => {
          const trimmed = q.trimEnd()
          const lastSpace = trimmed.lastIndexOf(" ")
          return lastSpace === -1 ? "" : trimmed.slice(0, lastSpace)
        })
        setSelectedIndex(0)
      },
      deleteToStart() {
        setQuery("")
        setSelectedIndex(0)
      },
      deleteToEnd() {},
      confirm() {
        dialogTargetRef.current?.confirm()
      },
      cancel() {
        onCancelRef.current()
      },
      save() {},
      getCursorOffset() {
        return queryRef.current.length
      },
      getContent() {
        return queryRef.current
      },
    }
    blockEditTargetRef.current = textTarget

    return () => {
      dialogTargetRef.current = null
      if (blockEditTargetRef.current === textTarget) {
        blockEditTargetRef.current = null
      }
    }
  }, [])

  const footerContent = (
    <Box flexDirection="row" justifyContent="space-between">
      <Text dimColor>↑↓ nav Enter select Esc cancel</Text>
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
      title="Move to project"
      width={width}
      height={height}
      footer={footerContent}
    >
      {/* Search input */}
      <Text>
        <Text color="yellow">{"/ "}</Text>
        <Text>{query}</Text>
        <Text inverse> </Text>
      </Text>
      <Text> </Text>

      {/* Options list */}
      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        {loaderRef.current && (
          <React.Suspense fallback={<Text dimColor> Loading...</Text>}>
            <ProjectOptions
              loader={loaderRef.current}
              query={query}
              selectedIndex={selectedIndex}
              scrollOffset={scrollOffset}
              maxVisible={maxVisible}
            />
          </React.Suspense>
        )}
      </Box>
    </ModalDialog>
  )
}
