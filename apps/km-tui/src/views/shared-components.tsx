/**
 * Shared Memoized Components for Views
 *
 * These components are used across ListView, TabsView, and ColumnsView
 * to provide consistent, optimized rendering of cards and headers.
 */
import React, { useCallback } from "react"
import { Box, Text, Muted, Small, CursorLine, ModalDialog, useBoxRect } from "@silvery/ag-react"
import { usePaneSignals } from "../hooks/use-signal.ts"
import { createLogger } from "loggily"

const log = createLogger("km:tui:layout")
import type { KNode } from "@km/core"
import { TreeNode } from "./TreeNode.tsx"
import type { BoardPill } from "../board/board-pills.ts"
import { getNodeIcon, InlineText } from "../text/index.ts"
import type { TextDecoration } from "../text/index.ts"
import { ColumnHeader, deriveColumnHeaderProps } from "./NodeView.tsx"
import { useNavigator } from "../layout-context.tsx"
import { useRepo } from "../repo-context.tsx"
import { useTreeRenderContext } from "../state/ui-context.tsx"
import { useTreeNode } from "../state/reactive.ts"
import { useSignal } from "../hooks/use-signal.ts"

// =============================================================================
// Memoized Tree Card Component
// =============================================================================

interface MemoizedTreeCardProps {
  card: KNode
  colIndex: number
  cardIndex: number
  isSelected?: boolean
  /** Optional children to pass to TreeNode (pass [] to skip DB query) */
  children?: KNode[]
  /** Optional board pills callback for performance optimization */
  getBoardPills?: (node: KNode, excludeBoardIds: Set<string>) => BoardPill[]
  /** Additional sigils to exclude (e.g., column-level sigils like @next inside @next column) */
  extraExcludedSigils?: string[]
}

/**
 * Memoized card wrapper for TreeNode - used by all list-style views.
 *
 * Key optimization: cursor movement only changes isSelected for 2 cards
 * (old selection and new selection). All other cards skip re-render.
 * Selection state is self-subscribed via NodeStore — no prop threading needed.
 *
 * Registers card layout for cross-column navigation (h/l with sticky Y).
 */
export const MemoizedTreeCard = React.memo(
  function MemoizedTreeCard({
    card,
    colIndex,
    cardIndex,
    isSelected: isSelectedProp,
    children,
    getBoardPills,
    extraExcludedSigils,
  }: MemoizedTreeCardProps): React.ReactElement {
    // Per-node reactive selection — reads tree signals instead of global
    // cursorCardNodeId/cursorDepth. Only affected cards re-render on j/k.
    const treeNode = useTreeNode(card.id)
    const cursorOnThis = useSignal(treeNode.cursor)
    const cursorInDesc = useSignal(treeNode.cursorDescendant) as boolean
    const cursorIsSelected = cursorOnThis || cursorInDesc
    const isSelected = isSelectedProp ?? cursorIsSelected
    const ps = usePaneSignals()
    const textEdit = useSignal(ps.sel.text)
    const isEditing = textEdit?.nodeId === card.id

    // Fold depth: per-card override or root's depth budget
    const foldDepths = useSignal(ps.foldDepths)
    const paneRootId = useSignal(ps.rootId)
    const cardOverride = foldDepths.get(card.id)
    const rootFoldDepth = cardOverride !== undefined ? cardOverride : (foldDepths.get(paneRootId ?? "") ?? 1)

    const content = (
      <CardLayoutTracker nodeId={card.id} colIndex={colIndex} cardIndex={cardIndex} isSelected={isSelected}>
        <TreeNode
          node={card}
          depth={0}
          isSelected={isSelected}
          colIndex={colIndex}
          cardIndex={cardIndex}
          children={children}
          getBoardPills={getBoardPills}
          extraExcludedSigils={extraExcludedSigils}
          remainingDepth={rootFoldDepth}
        />
      </CardLayoutTracker>
    )

    // Show focus outline when editing — no layout shift (outline overlaps)
    if (isEditing) {
      return (
        <Box outlineStyle="round" outlineColor={"$focusborder"}>
          {content}
        </Box>
      )
    }

    return content
  },
  (prev, next) => {
    // Props-based memo check — NodeStore triggers re-renders independently
    return (
      prev.card.id === next.card.id &&
      prev.card.content === next.card.content &&
      prev.card.item?.task?.status === next.card.item?.task?.status &&
      prev.colIndex === next.colIndex &&
      prev.cardIndex === next.cardIndex &&
      prev.isSelected === next.isSelected &&
      prev.getBoardPills === next.getBoardPills &&
      prev.extraExcludedSigils === next.extraExcludedSigils
    )
  },
)

// =============================================================================
// Card Layout Tracking
// =============================================================================

interface CardLayoutTrackerProps {
  nodeId: string
  colIndex: number
  cardIndex: number
  isSelected: boolean
  children: React.ReactNode
}

/**
 * Wrapper that tracks the card's layout and registers it with the registry.
 *
 * Uses the `useBoxRect(callback)` form to register measured positions without
 * causing re-renders. The reactive form (`useBoxRect()` without a callback)
 * triggers a blank-screen feedback loop with many cards.
 */
function CardLayoutTracker({
  nodeId,
  colIndex,
  cardIndex,
  isSelected: _isSelected,
  children,
}: CardLayoutTrackerProps): React.ReactElement {
  const registry = useNavigator()

  // Register measured position after layout - no re-renders
  const handleLayout = useCallback(
    (computed: { x: number; y: number; width: number; height: number }) => {
      if (!registry) return

      // Use measured dimensions directly from silvery layout
      registry.register(colIndex, cardIndex, {
        x: computed.x,
        y: computed.y,
        width: computed.width,
        height: computed.height,
      })
      log.debug?.(
        `registered: col=${colIndex} card=${cardIndex} id=${nodeId.slice(-8)} y=${computed.y} h=${computed.height}`,
      )
    },
    [registry, colIndex, cardIndex, nodeId],
  )

  useBoxRect(handleLayout)

  return (
    <Box
      flexDirection="column"
      id={nodeId}
      data-view="card"
      // Note: data-cursor is set by TreeNode, not here, to avoid duplicates
    >
      {children}
    </Box>
  )
}

// =============================================================================
// Memoized Column Header Component
// =============================================================================

interface MemoizedColumnHeaderProps {
  /** Column node id — self-resolves data via lens */
  colId: string
  colIdx: number
  /** Whether cursor is anywhere in this column — auto-derived from tree signals if omitted */
  isSelected?: boolean
  /** Whether cursor is directly on the column header — auto-derived from tree signals if omitted */
  isColSelected?: boolean
  width: number
  /** Show blank line above (for list view, not first header) */
  showTopSpacer?: boolean
  /** Show separator line below header */
  showSeparator?: boolean
}

/**
 * Memoized column header - used by ListView.
 * Wraps ColumnHeader with data attributes for cursor tracking.
 *
 * Self-resolves its KNode + card count via the pane's visible lens.
 */
export const MemoizedColumnHeader = React.memo(
  function MemoizedColumnHeader({
    colId,
    colIdx,
    isSelected: isSelectedProp,
    isColSelected: isColSelectedProp,
    width,
    showTopSpacer = false,
    showSeparator = true,
  }: MemoizedColumnHeaderProps): React.ReactElement | null {
    // Self-derive selection state from tree signals when props are not provided.
    const colTreeNode = useTreeNode(colId)
    const cursorOnCol = useSignal(colTreeNode.cursor)
    const cursorInColDesc = useSignal(colTreeNode.cursorDescendant) as boolean
    const isSelected = isSelectedProp ?? (cursorOnCol || cursorInColDesc)
    const isColSelected = isColSelectedProp ?? cursorOnCol
    const repo = useRepo()
    const {
      treeConfig: { iconStyle },
    } = useTreeRenderContext()

    // Reactive lens — derive node + card count
    const ps = usePaneSignals()
    const lens = useSignal(ps.visibleLens)
    const colNode = lens.get(colId) ?? repo.getNode(colId)
    const cardCount = lens.children(colId).length
    const rules = lens.rules(colId)
    const wipLimit = rules?.limit

    if (!colNode) return null

    // Derive column header presentation props (icon, colors, style)
    const { displayName, untitled, ownColor, headerStyle, icon } = deriveColumnHeaderProps(repo, colNode, {
      iconStyle,
      isSelected,
      isColumnSelected: isColSelected,
    })

    return (
      <Box
        flexDirection="column"
        width={width}
        id={colId}
        {...(isColSelected && {
          "data-cursor": true,
          "data-col-index": colIdx,
          "data-card-index": -1,
        })}
      >
        <ColumnHeader
          node={colNode}
          displayName={displayName}
          untitled={untitled}
          ownColor={ownColor}
          headerStyle={headerStyle}
          icon={icon}
          cardCount={cardCount}
          width={width}
          isColumnSelected={isColSelected}
          isSelected={isSelected}
          wipLimit={wipLimit}
          showTopSpacer={showTopSpacer}
          showSeparator={showSeparator}
        />
      </Box>
    )
  },
  (prev, next) => {
    return (
      prev.colId === next.colId &&
      prev.colIdx === next.colIdx &&
      prev.isSelected === next.isSelected &&
      prev.isColSelected === next.isColSelected &&
      prev.width === next.width &&
      prev.showTopSpacer === next.showTopSpacer &&
      prev.showSeparator === next.showSeparator
    )
  },
)

// =============================================================================
// KeyBinding Component — renders keybindings with chord dot separators
// =============================================================================

/**
 * Detect whether a key segment (no ` / ` inside) is a chord sequence.
 *
 * A chord is exactly 2 space-separated parts where each part is a
 * short key-like token (1–2 visible chars). Examples:
 *   "g c" → chord    "v m" → chord    "t t" → chord    "⌃w v" → chord
 *   "hjkl" → no      "⌃a" → no       "⌃w hjkl" → no (second part 4 chars)
 */
function isChord(segment: string): boolean {
  const parts = segment.split(" ")
  if (parts.length !== 2) return false
  // Each part must be 1–3 visible characters
  // (covers single chars like "g", modifier+key like "⌃w", ranges like "0-9")
  return [...(parts[0] ?? "")].length <= 3 && [...(parts[1] ?? "")].length <= 3
}

/**
 * Render a single key segment with Kbd styling (background badge).
 *
 * If the segment is a chord (e.g., "g c"), renders as g·c where · is dim.
 * Chord dots and slash separators have no background — only key chars do.
 */
function KeySegment({ segment, color }: { segment: string; color?: string }): React.ReactElement {
  if (isChord(segment)) {
    const [prefix, suffix] = segment.split(" ") as [string, string]
    return (
      <>
        <Text bold color={color}>
          {prefix}
        </Text>
        <Text color={"$muted"}>{"·"}</Text>
        <KeySegment segment={suffix} color={color} />
      </>
    )
  }
  // Render bare `/` inside compact groups (e.g., ⌘[/], >/<) as dim
  if (segment.includes("/")) {
    const parts = segment.split("/")
    return (
      <Text bold color={color}>
        {parts.map((part, i) => (
          <React.Fragment key={i}>
            {i > 0 && <Text color={"$muted"}>{"/"}</Text>}
            {part}
          </React.Fragment>
        ))}
      </Text>
    )
  }
  return (
    <Text bold color={color}>
      {segment}
    </Text>
  )
}

/**
 * Render a key string with chord dots and dim ` / ` alternative separators.
 *
 * Handles three patterns:
 * - Alternatives: `"z / Z"` → z/Z (/ is dim)
 * - Chords: `"g c"` → g·c (dot is dim)
 * - Mixed: `"⌃w v / s"` → ⌃w·v dim(/) s
 * - Plain: `"hjkl"` → hjkl
 */
export function KeyBinding({ keys, color }: { keys: string; color?: string }): React.ReactElement {
  // Double-space separator: "a #  #" → a·# (space) # (no slash)
  if (keys.includes("  ")) {
    const segments = keys.split("  ")
    return (
      <>
        {segments.map((seg, i) => (
          <React.Fragment key={i}>
            {i > 0 && <Text> </Text>}
            <KeySegment segment={seg} color={color} />
          </React.Fragment>
        ))}
      </>
    )
  }
  // Slash separator: "z / Z" → z dim(/) Z
  if (!keys.includes(" / ")) {
    return <KeySegment segment={keys} color={color} />
  }
  const segments = keys.split(" / ")
  return (
    <>
      {segments.map((seg, i) => (
        <React.Fragment key={i}>
          {i > 0 && <Text color={"$muted"}>{"/"}</Text>}
          <KeySegment segment={seg} color={color} />
        </React.Fragment>
      ))}
    </>
  )
}

// =============================================================================
// Input Box Component
// =============================================================================

export interface InputBoxProps {
  /** Text before cursor */
  beforeCursor: string
  /** Text after cursor */
  afterCursor: string
  /** Prompt/prefix (e.g., "/ " for search) */
  prompt?: string
  /** Placeholder text when empty */
  placeholder?: string
  /** Prompt color */
  promptColor?: string
  /** Whether to show cursor */
  showCursor?: boolean
  /** Show cyan focus ring border around input */
  focusRing?: boolean
}

/**
 * Styled text input with cursor.
 *
 * Features:
 * - Single-line input with underline indicator
 * - Optional colored prompt prefix
 * - Block cursor at correct position
 * - Placeholder text when empty
 */
export function InputBox({
  beforeCursor,
  afterCursor,
  prompt = "",
  placeholder = "",
  promptColor = "$selection-bg",
  showCursor = true,
  focusRing = false,
}: InputBoxProps): React.ReactElement {
  const value = beforeCursor + afterCursor
  const showPlaceholder = !value && placeholder

  // Render the placeholder with the cursor INLINED on its first character
  // (inverse + dim), not as a separate inverse-space block. This fixes:
  //   (1) "not left-aligned" — there's no leading block pushing the text
  //   (2) "too white" — the placeholder uses explicit dimColor, not <Muted>
  //       (which some themes render too close to primary)
  // The cursor is visible as a dim inverse cell on the first ghost char;
  // the rest of the placeholder is plain dim text.
  const placeholderContent = showPlaceholder ? (
    showCursor && placeholder.length > 0 ? (
      <>
        <Text dimColor inverse>
          {placeholder[0]}
        </Text>
        <Text dimColor>{placeholder.slice(1)}</Text>
      </>
    ) : (
      <Text dimColor>{placeholder}</Text>
    )
  ) : null

  const content = (
    <Box flexDirection="column">
      <Text>
        {prompt && <Text color={promptColor}>{prompt}</Text>}
        {showPlaceholder ? (
          placeholderContent
        ) : (
          <CursorLine beforeCursor={beforeCursor} afterCursor={afterCursor} showCursor={showCursor} />
        )}
      </Text>
      {!focusRing && <Text dimColor>{"─".repeat(40)}</Text>}
    </Box>
  )

  if (focusRing) {
    return (
      <Box borderStyle="round" borderColor={"$focusborder"}>
        {content}
      </Box>
    )
  }

  return content
}

// =============================================================================
// Node Line Component — reusable one-liner for node display in lists/dialogs
// =============================================================================

export interface NodeLineProps {
  /** Node to display (used for type icon) */
  node: KNode
  /** Display title (rendered with rich text styling) */
  title: string
  /** Parent name shown as context after title */
  parentContext?: string | null
  /** Whether this line is the selected/highlighted item */
  isSelected?: boolean
  /** Optional suffix content (tags, badges, etc.) */
  children?: React.ReactNode
  /** Search highlight decorations for the title */
  decorations?: TextDecoration[]
}

/**
 * Compact one-line node display: icon + rich title + parent context + optional suffix.
 *
 * Uses two-box layout so that parentContext is always visible (flexShrink=0)
 * and the title truncates when space is limited (flexGrow=1, overflow=hidden).
 *
 * Used in SearchDialog, ItemPicker, Omnibox, and any list that shows nodes as one-liners.
 */
export function NodeLine({
  node,
  title,
  parentContext,
  isSelected = false,
  children,
  decorations,
}: NodeLineProps): React.ReactElement {
  const prefix = isSelected ? "▸ " : "  "
  const icon = getNodeIcon(node.item?.task?.status, undefined, node.item?.task?.marker !== undefined)

  return (
    <Box width="100%" height={1} backgroundColor={isSelected ? "$selection-bg" : "$popover-bg"} flexDirection="row">
      {/* Title: fills remaining space, truncates on overflow */}
      <Box flexGrow={1} flexShrink={1} overflow="hidden" paddingRight={2}>
        <Text color={isSelected ? "$selection" : undefined} wrap="truncate">
          {prefix}
          <Text color={isSelected ? "$selection" : icon.color}>{icon.char} </Text>
          <InlineText
            text={title}
            decorations={decorations}
            context={isSelected ? { colorOverride: "$selection" } : undefined}
          />
        </Text>
      </Box>
      {/* Parent context + suffix: fixed width, never truncated */}
      {(parentContext || children) && (
        <Box flexGrow={0} flexShrink={0}>
          <Text color={isSelected ? "$selection" : undefined}>
            {parentContext &&
              (isSelected ? (
                <Text color="$selection">{` < ${parentContext}`}</Text>
              ) : (
                <Muted>{` < ${parentContext}`}</Muted>
              ))}
            {children}
          </Text>
        </Box>
      )}
    </Box>
  )
}

// =============================================================================
// Confirm Dialog Component
// =============================================================================

export interface ConfirmDialogProps {
  /** Dialog title (e.g., 'Delete "My Node"?') */
  title: string
  /** Warning lines shown in yellow below title */
  warnings?: string[]
  /** Border color (default: red for destructive actions) */
  borderColor?: string
  /** Dialog width */
  width?: number
}

/**
 * Confirmation dialog built on ModalDialog.
 *
 * Used for destructive actions (delete node, delete column).
 * Shows title + warning lines + Enter/Esc footer.
 */
export function ConfirmDialog({
  title,
  warnings = [],
  borderColor = "$error", // Red border for destructive actions (overrides default dialogBorder)
  width,
}: ConfirmDialogProps): React.ReactElement {
  return (
    <ModalDialog
      borderColor={borderColor}
      title={title}
      titleAlign="flex-start"
      width={width}
      footer={<Small>Enter to confirm · Esc to cancel</Small>}
    >
      {warnings.map((w, i) => (
        <Text key={i} color={"$warning"}>
          {w}
        </Text>
      ))}
    </ModalDialog>
  )
}
