/**
 * DetailView — renders a node as a readable document.
 *
 * Layout: metadata rows at top, then the content tree rendered as a
 * document outline — headings, body paragraphs, task items with markers,
 * nested lists with indentation. Like reading the .md file in the TUI.
 *
 * Navigation: all elements (title, metadata rows, doc nodes) are real
 * focusable React components with testID props. The TEA command system
 * handles j/k via view-navigation.ts, setting cursor to the target
 * testID (e.g., "__meta__Status" for metadata rows, node IDs for
 * children). No virtual KNode objects are created.
 */

import React, { useMemo } from "react"
import { Box, Text, Small, H1, H2, H3, Muted, Blockquote, CodeBlock, HR } from "@silvery/ag-react"
import { KNode, type KNode as KNodeType } from "@km/core"
import { extractTaskDates } from "@km/core"
import { getStatusIcon } from "../icons.ts"
import { InlineText, InlineRenderProvider } from "../text/InlineComponents.tsx"
import { useTreeInlineContext } from "./tree-node-shared.ts"
import { useRepo } from "../repo-context.tsx"
import { useStore } from "../state/store-context.tsx"
import { useChildIdsSignal } from "../hooks/use-signal.ts"
import { ResourceState } from "@km/storage"
import { useNodeStore, useTreeNode, type NodeEditState } from "../state/reactive.ts"
import { useSignal } from "../hooks/use-signal.ts"
import { getNodeDisplayName, nodeBadgeLabel } from "../state.ts"
import { DETAIL_META_PREFIX, computeMetadataKeys } from "./detail-pane-items.ts"
import { getStatusDisplay, formatDate, resolveProjectDisplayNames } from "./detail-pane-helpers.ts"
import { resolveSymlink } from "./symlink-display.ts"
import { parseDepsRefs } from "./tree-node-helpers.tsx"
import { CheckboxIcon } from "./CheckboxIcon.tsx"
import { useTreeRenderContext } from "../state/ui-context.tsx"
import { TitleEditor } from "./tree-node-edit.tsx"

// =============================================================================
// DetailView Component
// =============================================================================

export interface DetailViewProps {
  /** Root node ID (the item being detailed) */
  rootId: string | null
  /** Available width */
  width: number
  /** Available height */
  height: number
}

/**
 * Detail view — single column showing item properties + children.
 *
 * Layout:
 * - Title header (item name with icon, selection-colored background)
 * - Separator
 * - Metadata property rows (navigable with j/k via __meta__ cursor IDs)
 * - Separator (if both properties and children exist)
 * - Tree children rendered as Cards (matching column card infrastructure)
 *
 * Children use the same Card infrastructure as CardColumn: bordered cards
 * with fold indicators, overflow counts, and ListView virtualization.
 */
export function DetailView({ rootId, width, height }: DetailViewProps): React.ReactElement {
  const repo = useRepo()
  const nodeStore = useNodeStore()
  const cursorCardNodeId = useSignal(nodeStore.cursorCardNodeId)
  const { undoHandle, setUI, sel, jobRunner } = useTreeRenderContext()

  // Root title edit state
  const rootN = useTreeNode(rootId ?? "")
  const rootEditState = useSignal(rootN.edit)
  const isRootEditing = rootEditState?.blockIndex === 0

  const rawNode = rootId ? repo.getNode(rootId) : null
  const { displayNode } = rawNode ? resolveSymlink(repo, rawNode) : { displayNode: null }
  const rootNode = displayNode ?? rawNode

  // All hooks must be called unconditionally (before any early return)
  const effectiveId = rootNode?.id ?? null
  const metaKeys = rootNode ? computeMetadataKeys(rootNode) : []
  // Subscribe to this node's child list via signals — only re-renders when
  // this specific parent's children change, not on every repo mutation.
  const store = useStore()
  const childIdsState = useChildIdsSignal(store, effectiveId ?? "")
  const childIds = ResourceState.isLoaded(childIdsState) ? childIdsState.value : []
  const children = useMemo(() => (effectiveId ? repo.getChildren(effectiveId) : []), [effectiveId, childIds])
  const inlineCtx = useTreeInlineContext(repo, effectiveId, undefined, undefined, undefined)

  if (!rootNode || !effectiveId) {
    return (
      <Box flexDirection="column" width={width} height={height} paddingX={1}>
        <Small>(no item selected)</Small>
      </Box>
    )
  }

  const contentWidth = Math.max(8, width - 2)

  const title = rootNode.content ?? rootNode.name ?? "(untitled)"
  const isTitleCursor = cursorCardNodeId === effectiveId
  const rootIsTask = KNode.isTask(rootNode)
  const rootStatusIcon = rootIsTask ? getStatusIcon(rootNode.item?.task?.status ?? "todo") : null

  return (
    <Box flexDirection="column" width={width} height={height} overflow="hidden" userSelect="contain">
      <InlineRenderProvider value={inlineCtx}>
        <Box flexDirection="column" flexGrow={1} overflow="hidden">
          {/* Document title — H1 (selectable) + node badge */}
          <Box
            id={effectiveId}
            testID={effectiveId}
            focusable
            paddingX={1}
            backgroundColor={isTitleCursor ? "$selection-bg" : undefined}
            {...(isTitleCursor ? { "data-cursor": true } : {})}
          >
            <Box flexGrow={1} flexShrink={1}>
              <H1 color={isTitleCursor ? "$selection" : undefined} wrap="wrap">
                {rootStatusIcon && (
                  <>
                    <CheckboxIcon
                      nodeId={effectiveId}
                      icon={rootStatusIcon}
                      textColor={isTitleCursor ? "$selection" : undefined}
                      shouldDim={false}
                      isSelected={isTitleCursor}
                      isNodeSelected={false}
                      isDoneOrDropped={
                        rootNode.item?.task?.status === "done" || rootNode.item?.task?.status === "dropped"
                      }
                      undoHandle={undoHandle}
                    />
                    <Text> </Text>
                  </>
                )}
                {isRootEditing ? (
                  <TitleEditor
                    displayNode={rootNode}
                    editState={rootEditState as NodeEditState}
                    nodeIsTask={rootIsTask}
                    repo={repo}
                    setUI={setUI}
                    sel={sel}
                    jobRunner={jobRunner}
                    undoHandle={undoHandle}
                  />
                ) : (
                  <InlineText text={title} />
                )}
              </H1>
            </Box>
            <NodeBadge node={rootNode} />
          </Box>

          {/* Metadata property rows */}
          {metaKeys.length > 0 && (
            <>
              <Box height={1} />
              {metaKeys.map((key) => {
                const metaId = `${DETAIL_META_PREFIX}${key}`
                const isSelected = cursorCardNodeId === metaId
                return (
                  <MetadataRow
                    key={key}
                    metaId={metaId}
                    label={key}
                    node={rootNode}
                    isSelected={isSelected}
                    width={contentWidth}
                  />
                )
              })}
            </>
          )}

          {/* Separator */}
          {children.length > 0 && (
            <Box height={1} flexShrink={0} width={width}>
              <HR />
            </Box>
          )}

          {/* Doc-style content tree — headings start at depth 1 (H2) since title is H1 */}
          {children.length > 0 ? (
            <Box paddingLeft={1} flexDirection="column">
              <DocContent nodes={children} depth={1} repo={repo} cursor={cursorCardNodeId} undoHandle={undoHandle} />
            </Box>
          ) : metaKeys.length === 0 ? (
            <Box paddingX={1}>
              <Small>(empty)</Small>
            </Box>
          ) : null}
        </Box>
      </InlineRenderProvider>
    </Box>
  )
}

// =============================================================================
// DocContent — renders a node tree as a readable document
// =============================================================================

interface DocContentProps {
  nodes: KNodeType[]
  depth: number
  repo: { getChildren(parentId: string): KNodeType[]; getNode(id: string): KNodeType | null }
  cursor?: string | null
  maxExpandDepth?: number
  /** Optional undo handle for interactive checkboxes */
  undoHandle?: import("../undo/undoable-repo.ts").UndoableRepoHandle
}

/** Max heading depth to render content for. Deeper levels show collapsed summary. */
const MAX_EXPAND_DEPTH = 3
/** Max items to render per level before truncating. */
const MAX_ITEMS_PER_LEVEL = 30

export function DocContent({
  nodes,
  depth,
  repo,
  cursor,
  maxExpandDepth,
  undoHandle,
}: DocContentProps): React.ReactElement {
  const effectiveMaxDepth = maxExpandDepth ?? MAX_EXPAND_DEPTH
  const visible = nodes.slice(0, MAX_ITEMS_PER_LEVEL)
  const truncated = nodes.length - visible.length
  return (
    <Box flexDirection="column">
      {visible.map((node) => (
        <DocNode
          key={node.id}
          node={node}
          depth={depth}
          repo={repo}
          cursor={cursor}
          maxExpandDepth={effectiveMaxDepth}
          undoHandle={undoHandle}
        />
      ))}
      {truncated > 0 && (
        <Box>
          <Muted>… +{truncated} more items</Muted>
        </Box>
      )}
    </Box>
  )
}

function DocNode({
  node,
  depth,
  repo,
  cursor,
  maxExpandDepth,
  undoHandle,
}: {
  node: KNodeType
  depth: number
  repo: DocContentProps["repo"]
  cursor?: string | null
  maxExpandDepth?: number
  undoHandle?: import("../undo/undoable-repo.ts").UndoableRepoHandle
}): React.ReactElement {
  const content = node.content ?? node.name ?? ""
  const isHeading = KNode.isOutline(node)
  const isTask = KNode.isTask(node)
  const isItem = KNode.isItem(node)
  const isCursor = node.id === cursor
  const shouldExpand = depth < (maxExpandDepth ?? MAX_EXPAND_DEPTH)

  // Per-node edit state — enables inline editing in the detail pane.
  // When editState is non-null (blockIndex === 0), TitleEditor replaces InlineText.
  const n = useTreeNode(node.id)
  const editState = useSignal(n.edit)
  const isEditing = editState?.blockIndex === 0
  const { setUI, sel, jobRunner, undoHandle: ctxUndoHandle } = useTreeRenderContext()

  // Only fetch children if we'll render them (avoid N+1 queries on deep/large trees)
  const children = useMemo(
    () => (isItem || isHeading ? repo.getChildren(node.id) : []),
    [repo, node.id, isItem, isHeading],
  )
  const childCount = children.length

  const bg = isCursor ? "$selection-bg" : undefined
  const cursorProps = isCursor ? { "data-cursor": true } : {}
  // Strip inline colors on cursor row — blue links on gold bg are unreadable
  const cursorCtx = isCursor ? { colorOverride: null as null } : undefined

  // Editing content: when editing, render TitleEditor instead of InlineText
  const editableContent = isEditing ? (
    <TitleEditor
      displayNode={node}
      editState={editState as NodeEditState}
      nodeIsTask={isTask}
      repo={repo as import("../repo-context.tsx").Repo}
      setUI={setUI}
      sel={sel}
      jobRunner={jobRunner}
      undoHandle={ctxUndoHandle}
    />
  ) : null

  // Collapsed children indicator
  function CollapsedIndicator() {
    if (childCount === 0) return null
    const itemCount = children.filter((c) => c.item).length
    const label = itemCount > 0 ? `▸ ${itemCount} items` : `▸ ${childCount} blocks`
    return (
      <Box>
        <Small>{label}</Small>
      </Box>
    )
  }

  // ── Heading ── H2/H3/muted-bold with spacing
  // Headings do NOT indent their children — content flows at current indent level.
  // A blank line after the heading provides visual separation.
  // Headings that are also tasks show a task status icon before the title.
  if (isHeading) {
    const Heading = depth <= 1 ? H2 : depth === 2 ? H3 : null
    const headingColor = isCursor ? "$selection" : undefined
    const headingTaskIcon = isTask ? getStatusIcon(node.item?.task?.status ?? "todo") : null
    const headingIsDoneOrDropped = node.item?.task?.status === "done" || node.item?.task?.status === "dropped"
    return (
      <Box flexDirection="column">
        <Box height={1} />
        <Box id={node.id} testID={node.id} focusable paddingLeft={0} backgroundColor={bg} {...cursorProps}>
          {Heading ? (
            <Heading color={headingColor} wrap="wrap">
              {headingTaskIcon && (
                <>
                  <CheckboxIcon
                    nodeId={node.id}
                    icon={headingTaskIcon}
                    textColor={isCursor ? "$selection" : undefined}
                    shouldDim={false}
                    isSelected={isCursor}
                    isNodeSelected={false}
                    isDoneOrDropped={headingIsDoneOrDropped}
                    undoHandle={undoHandle}
                  />
                  <Text> </Text>
                </>
              )}
              {editableContent ?? <InlineText text={content} context={cursorCtx} />}
            </Heading>
          ) : (
            <Text bold color={headingColor ?? "$muted"} wrap="wrap">
              {headingTaskIcon && (
                <>
                  <CheckboxIcon
                    nodeId={node.id}
                    icon={headingTaskIcon}
                    textColor={isCursor ? "$selection" : undefined}
                    shouldDim={false}
                    isSelected={isCursor}
                    isNodeSelected={false}
                    isDoneOrDropped={headingIsDoneOrDropped}
                    undoHandle={undoHandle}
                  />
                  <Text> </Text>
                </>
              )}
              {editableContent ?? <InlineText text={content} context={cursorCtx} />}
            </Text>
          )}
        </Box>
        <Box height={1} />
        {shouldExpand ? (
          childCount > 0 && (
            <DocContent
              nodes={children}
              depth={depth}
              repo={repo}
              cursor={cursor}
              maxExpandDepth={maxExpandDepth}
              undoHandle={undoHandle}
            />
          )
        ) : (
          <CollapsedIndicator />
        )}
      </Box>
    )
  }

  // ── Task item ── interactive checkbox + content (matching board card style)
  if (isTask) {
    const icon = getStatusIcon(node.item?.task?.status ?? "todo")
    const isDone = node.item?.task?.status === "done" || node.item?.task?.status === "dropped"
    const textColor = isCursor ? "$selection" : isDone ? "$muted" : undefined
    return (
      <Box flexDirection="column">
        <Box id={node.id} testID={node.id} focusable paddingLeft={0} backgroundColor={bg} {...cursorProps}>
          <CheckboxIcon
            nodeId={node.id}
            icon={icon}
            textColor={isCursor ? "$selection" : undefined}
            shouldDim={false}
            isSelected={isCursor}
            isNodeSelected={false}
            isDoneOrDropped={isDone}
            undoHandle={undoHandle}
          />
          <Text> </Text>
          <Text color={textColor} strikethrough={isDone} wrap="wrap">
            {editableContent ?? <InlineText text={content} context={cursorCtx} />}
          </Text>
        </Box>
        {shouldExpand ? (
          childCount > 0 && (
            <DocContent
              nodes={children}
              depth={depth + 1}
              repo={repo}
              cursor={cursor}
              maxExpandDepth={maxExpandDepth}
              undoHandle={undoHandle}
            />
          )
        ) : (
          <CollapsedIndicator />
        )}
      </Box>
    )
  }

  // ── List item ── bullet + content
  if (isItem) {
    return (
      <Box flexDirection="column">
        <Box id={node.id} testID={node.id} focusable paddingLeft={0} backgroundColor={bg} {...cursorProps}>
          <Text color={isCursor ? "$selection" : "$muted"}>{node.item?.list ?? "•"} </Text>
          <Text color={isCursor ? "$selection" : undefined} wrap="wrap">
            {editableContent ?? <InlineText text={content} context={cursorCtx} />}
          </Text>
        </Box>
        {shouldExpand ? (
          childCount > 0 && (
            <DocContent
              nodes={children}
              depth={depth + 1}
              repo={repo}
              cursor={cursor}
              maxExpandDepth={maxExpandDepth}
              undoHandle={undoHandle}
            />
          )
        ) : (
          <CollapsedIndicator />
        )}
      </Box>
    )
  }

  // ── Block content (paragraph, quote, code, hr) ──
  if (node.type === "hr") {
    return (
      <Box id={node.id} testID={node.id} focusable paddingLeft={0}>
        <HR />
      </Box>
    )
  }
  if (!content) return <Box id={node.id} testID={node.id} focusable paddingLeft={0} />
  if (node.type === "quote") {
    return (
      <Box id={node.id} testID={node.id} focusable paddingLeft={0} backgroundColor={bg} {...cursorProps}>
        <Blockquote>{editableContent ?? <InlineText text={content} context={cursorCtx} />}</Blockquote>
      </Box>
    )
  }
  if (node.type === "code") {
    return (
      <Box id={node.id} testID={node.id} focusable paddingLeft={0} backgroundColor={bg} {...cursorProps}>
        {editableContent ? editableContent : <CodeBlock>{content}</CodeBlock>}
      </Box>
    )
  }
  // Paragraph
  return (
    <Box id={node.id} testID={node.id} focusable paddingLeft={0} backgroundColor={bg} {...cursorProps}>
      <Text wrap="wrap">{editableContent ?? <InlineText text={content} context={cursorCtx} />}</Text>
    </Box>
  )
}

// =============================================================================
// NodeBadge — floating badge showing node id/name/type
// =============================================================================

function NodeBadge({ node }: { node: KNodeType }): React.ReactElement | null {
  return (
    <Box flexShrink={0} paddingLeft={1}>
      <Small wrap="truncate">{nodeBadgeLabel(node)}</Small>
    </Box>
  )
}

// =============================================================================
// MetadataRow — renders a single property row with label + value
// =============================================================================

interface MetadataRowProps {
  /** Virtual cursor ID for this row (e.g., "__meta__Status") */
  metaId: string
  /** Property label (e.g., "Status", "Due", "Priority") */
  label: string
  /** The node whose metadata to display */
  node: KNode
  /** Whether this row is currently selected */
  isSelected: boolean
  /** Available width */
  width: number
}

/** Label column width for metadata rows */
const LABEL_WIDTH = 12

/**
 * Renders a single metadata property row: [label] [value]
 *
 * Selection highlighting uses $selection/$selection tokens,
 * which the per-pane theme dims for unfocused panes.
 */
function MetadataRow({ metaId, label, node, isSelected, width }: MetadataRowProps): React.ReactElement {
  const repo = useRepo()
  const bg = isSelected ? "$selection-bg" : undefined
  const fg = isSelected ? "$selection" : undefined
  const labelColor = isSelected ? "$selection" : "$muted"

  const value = getMetadataValue(label, node, repo)

  return (
    <Box
      id={metaId}
      testID={metaId}
      focusable
      height={1}
      flexShrink={0}
      width={width + 2}
      backgroundColor={bg}
      flexDirection="row"
      {...(isSelected && { "data-cursor": true })}
    >
      <Box width={1} flexShrink={0} />
      <Box width={LABEL_WIDTH} flexShrink={0}>
        <Text color={labelColor} wrap="truncate">
          {label}
        </Text>
      </Box>
      <Box flexGrow={1} flexShrink={1} overflow="hidden">
        <Text color={fg} wrap="truncate">
          {value.element ?? value.text}
        </Text>
      </Box>
    </Box>
  )
}

// =============================================================================
// Metadata value resolution
// =============================================================================

interface MetadataValue {
  text: string
  element?: React.ReactElement
}

/**
 * Resolve the display value for a metadata property key.
 * Returns plain text and optionally a styled React element.
 */
function getMetadataValue(key: string, node: KNode, repo: import("../repo-context.tsx").Repo): MetadataValue {
  const data = node.data as Record<string, unknown> | undefined
  const metadata = (data?.metadata ?? {}) as Record<string, unknown>

  switch (key) {
    case "Status": {
      const status = getStatusDisplay(node.item?.task?.status)
      return {
        text: status.text,
        element: <Text color={status.color}>{status.text}</Text>,
      }
    }
    case "Priority": {
      const p = node.priority
      return { text: p ? `P${p}` : "none" }
    }
    case "Due": {
      const dueDate = extractTaskDates(node).due?.date
      if (!dueDate) return { text: "none" }
      const { text, urgency } = formatDate(dueDate)
      const color = urgency === "overdue" ? "$error" : urgency === "urgent" ? "$warning" : undefined
      return {
        text,
        element: color ? <Text color={color}>{text}</Text> : undefined,
      }
    }
    case "Start": {
      return { text: extractTaskDates(node).start?.date ?? "none" }
    }
    case "Recurrence":
      return { text: node.rrule ?? "none" }
    case "Created":
      return { text: String(metadata.created ?? "") }
    case "Completed":
      return { text: String(metadata.completed ?? "") }
    case "Assigned":
      return { text: node.assigned_to ?? "none" }
    case "Projects": {
      const projectMemberships = data?.projectMemberships as Array<{ project: string }> | undefined
      const slugs = projectMemberships?.map((p) => p.project) ?? []
      const names = resolveProjectDisplayNames(repo, slugs)
      return { text: names.join(", ") || "none" }
    }
    case "Tags": {
      const tags = (data as { tags?: string[] } | undefined)?.tags ?? []
      return { text: tags.map((t) => `#${t}`).join(" ") || "none" }
    }
    case "Mentions": {
      const mentions = (data as { mentions?: string[] } | undefined)?.mentions ?? []
      return { text: mentions.map((m) => `@${m}`).join(" ") || "none" }
    }
    case "Depends on": {
      const deps = data ? parseDepsRefs(data, "deps") : []
      return {
        text:
          deps.map((d) => getNodeDisplayName(repo, repo.getNode(d) ?? ({ content: d } as KNode))).join(", ") || "none",
      }
    }
    case "Blocks": {
      const blocks = data ? parseDepsRefs(data, "blocks") : []
      return {
        text:
          blocks.map((b) => getNodeDisplayName(repo, repo.getNode(b) ?? ({ content: b } as KNode))).join(", ") ||
          "none",
      }
    }
    default: {
      // Check metadata, propsRaw, or data for the key
      const lowerKey = key.toLowerCase()
      if (metadata[lowerKey] !== undefined) return { text: String(metadata[lowerKey]) }
      const propsRaw = (data?.propsRaw ?? {}) as Record<string, unknown>
      if (propsRaw[lowerKey] !== undefined) return { text: String(propsRaw[lowerKey]) }
      if (data?.[lowerKey] !== undefined) return { text: String(data[lowerKey]) }
      // Try original case
      if (metadata[key] !== undefined) return { text: String(metadata[key]) }
      if (propsRaw[key] !== undefined) return { text: String(propsRaw[key]) }
      if (data?.[key] !== undefined) return { text: String(data[key]) }
      return { text: "" }
    }
  }
}
