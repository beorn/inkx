/**
 * Generic Picker Component
 *
 * Fuzzy search picker for selecting nodes (projects, tags, assignees).
 * Parameterized via `loadOptions` and `title` props. Supports:
 *   - Fuzzy search input with debounced scoring
 *   - Keyboard navigation (up/down/Enter/Esc)
 *   - Scroll with position indicator
 *   - Suspense-based async loading
 *   - Recent item tracking
 */
import React from "react"
import { Box, Text, CursorLine } from "inkx"
import type { KNode } from "@km/core"
import type { Repo } from "../repo-context.tsx"
import { useRepo } from "../repo-context.tsx"
import { ModalDialog, NodeLine } from "./shared-components.tsx"
import { fuzzyScore } from "./search-utils.ts"
import { useDialogInput } from "../hooks/use-dialog-input.ts"
import { createSuspenseLoader, type SuspenseLoader } from "../hooks/use-suspense-loader.ts"
import { loadProjectOptions } from "./picker-loaders.ts"

// =============================================================================
// Picker option type
// =============================================================================

export interface PickerOption {
  node: KNode
  title: string
  parentContext: string | null
  path: string
  isRecent?: boolean
}

// =============================================================================
// Loader type
// =============================================================================

export type PickerLoadOptions = (repo: Repo, recentIds: string[]) => PickerOption[]

// =============================================================================
// Filter and score options by query
// =============================================================================

function filterOptions(allOptions: PickerOption[], query: string): (PickerOption & { score?: number })[] {
  if (!query) {
    // Show recent first, then alphabetically by title
    return [...allOptions].sort((a, b) => {
      if (a.isRecent && !b.isRecent) return -1
      if (!a.isRecent && b.isRecent) return 1
      return a.title.localeCompare(b.title)
    })
  }

  // Filter and score by query - match against title, parent context, and full path
  return allOptions
    .map((opt) => {
      // Score against title (primary), parent context, and full path
      const titleScore = fuzzyScore(query, opt.title)
      const parentScore = opt.parentContext ? fuzzyScore(query, opt.parentContext) * 0.8 : -1
      const pathScore = fuzzyScore(query, opt.path) * 0.6
      const bestScore = Math.max(titleScore, parentScore, pathScore)
      return { ...opt, score: bestScore }
    })
    .filter((opt) => (opt.score ?? -1) >= 0)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
}

// =============================================================================
// PickerOptions component (suspends while loading)
// =============================================================================

interface PickerOptionsProps {
  loader: SuspenseLoader<PickerOption[]>
  query: string
  selectedIndex: number
  scrollOffset: number
  maxVisible: number
  emptyLabel?: string
}

function PickerOptions({
  loader,
  query,
  selectedIndex,
  scrollOffset,
  maxVisible,
  emptyLabel = "No matching items",
}: PickerOptionsProps): React.ReactElement {
  const allOptions = loader.read() // Suspends if not ready
  const filteredOptions = React.useMemo(() => filterOptions(allOptions, query), [allOptions, query])

  const visibleOptions = filteredOptions.slice(scrollOffset, scrollOffset + maxVisible)

  if (filteredOptions.length === 0) {
    return <Text dimColor> {emptyLabel}</Text>
  }

  return (
    <>
      {visibleOptions.map((opt, i) => {
        const actualIndex = scrollOffset + i
        const isSelected = actualIndex === selectedIndex

        return (
          <NodeLine
            key={`${opt.node.id}-${i}`}
            node={opt.node}
            title={opt.title}
            parentContext={opt.parentContext}
            isSelected={isSelected}
          >
            {opt.isRecent && (
              <Text color={isSelected ? "$selectedfg" : "$primary"} dimColor={!isSelected}>
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
// Generic Picker component
// =============================================================================

export interface PickerProps {
  title: string
  loadOptions: PickerLoadOptions
  onSelect: (option: PickerOption) => void
  onCancel: () => void
  width: number
  height: number
  recentIds?: string[]
  emptyLabel?: string
}

export function Picker({
  title,
  loadOptions,
  onSelect,
  onCancel,
  width,
  height,
  recentIds = [],
  emptyLabel,
}: PickerProps): React.ReactElement {
  const repo = useRepo()
  const [selectedIndex, setSelectedIndex] = React.useState(0)

  // Refs for callbacks used in useDialogInput closures
  const onCancelRef = React.useRef(onCancel)
  onCancelRef.current = onCancel
  const onSelectRef = React.useRef(onSelect)
  onSelectRef.current = onSelect
  const selectedIndexRef = React.useRef(selectedIndex)
  selectedIndexRef.current = selectedIndex

  // Create loader on mount (loads in background via Suspense)
  const loaderRef = React.useRef<SuspenseLoader<PickerOption[]> | null>(null)
  if (!loaderRef.current) {
    loaderRef.current = createSuspenseLoader(() => loadOptions(repo, recentIds))
  }

  const editCtx = useDialogInput({
    initialValue: "",
    onChange: () => setSelectedIndex(0),
    navUp: () => setSelectedIndex((i) => Math.max(0, i - 1)),
    navDown: () => setSelectedIndex((i) => i + 1),
    onConfirm: () => {
      if (loaderRef.current?.status === "resolved") {
        const allOptions = loaderRef.current.read()
        const filtered = filterOptions(allOptions, editCtx.target.getContent())
        const selected = filtered[selectedIndexRef.current]
        if (selected) {
          onSelectRef.current(selected)
        }
      }
    },
    onCancel: () => onCancelRef.current(),
  })

  // Debounce query for fuzzy scoring (200ms, immediate in tests)
  const [deferredQuery, setDeferredQuery] = React.useState(editCtx.value)
  const pickerTimerRef = React.useRef<ReturnType<typeof setTimeout>>()
  React.useEffect(() => {
    clearTimeout(pickerTimerRef.current)
    // @ts-expect-error - React internal flag set by inkx test renderer
    if (globalThis.IS_REACT_ACT_ENVIRONMENT) {
      setDeferredQuery(editCtx.value)
    } else {
      pickerTimerRef.current = setTimeout(() => setDeferredQuery(editCtx.value), 200)
    }
    return () => clearTimeout(pickerTimerRef.current)
  }, [editCtx.value])

  // Max visible items: height - borders(2) - paddingY(2) - title(1) - input(1) - spacer(1) - footer(1) = height - 8
  const maxVisible = Math.max(1, height - 8)

  // Calculate scroll offset (needs filtered count)
  let scrollOffset = 0
  let filteredCount = 0
  if (loaderRef.current?.status === "resolved") {
    const filtered = filterOptions(loaderRef.current.read(), deferredQuery)
    filteredCount = filtered.length
    scrollOffset = Math.max(
      0,
      Math.min(selectedIndex - Math.floor(maxVisible / 2), Math.max(0, filteredCount - maxVisible)),
    )
  }

  const footerContent = (
    <Box flexDirection="row" justifyContent="space-between">
      <Text dimColor>{"↑↓ nav  Enter select  Esc cancel"}</Text>
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
    <ModalDialog title={title} width={width} height={height} footer={footerContent}>
      {/* Search input */}
      <Box borderStyle="round" borderColor={"$focusring"} flexShrink={0}>
        <Text>
          <Text color={"$selected"}>{"/ "}</Text>
          <CursorLine beforeCursor={editCtx.beforeCursor} afterCursor={editCtx.afterCursor} />
        </Text>
      </Box>

      {/* Options list */}
      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        {loaderRef.current && (
          <React.Suspense fallback={<Text dimColor> Loading...</Text>}>
            <PickerOptions
              loader={loaderRef.current}
              query={deferredQuery}
              selectedIndex={selectedIndex}
              scrollOffset={scrollOffset}
              maxVisible={maxVisible}
              emptyLabel={emptyLabel}
            />
          </React.Suspense>
        )}
      </Box>
    </ModalDialog>
  )
}

// =============================================================================
// ProjectPicker — backwards-compatible wrapper
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
  const handleSelect = React.useCallback((option: PickerOption) => onSelect(option.node), [onSelect])

  return (
    <Picker
      title="Move to project"
      loadOptions={loadProjectOptions}
      onSelect={handleSelect}
      onCancel={onCancel}
      width={width}
      height={height}
      recentIds={recentProjectIds}
      emptyLabel="No matching projects"
    />
  )
}
