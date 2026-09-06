import React, { useEffect, useId, useRef } from "react"
import { computeMatchRanges, type SearchMatch } from "@silvery/ag-term/search-overlay"
import { displayLength } from "@silvery/ansi"
import { Box } from "../../components/Box"
import { Text } from "../../components/Text"
import { Blockquote, CodeBlock, H1, H2, H3, H4, H5, H6, HR, Small } from "./Typography"
import { Prose } from "./Prose"
import { HeadingRow } from "./HeadingRow"
import { Content, type ContentBodyWidth, useContentLayout, useHasContentLayout } from "./Content"
import { StylePriorityProvider } from "../../style-priority"
import { useSearchOptional } from "../../providers/SearchProvider"
import type { ScrollController } from "./ScrollArea"

export type DocumentBlockId = string | number
export type DocumentLane = ContentBodyWidth

export interface DocumentListItem {
  /** Stable identity for the semantic list containing this item. */
  readonly groupId: DocumentBlockId
  /** Zero-based nesting depth. */
  readonly depth: number
  readonly ordered: boolean
  /** First ordinal for an ordered group. Defaults to 1. */
  readonly start?: number
}

interface DocumentBlockBase {
  readonly id: DocumentBlockId
  readonly lane?: DocumentLane
  /** Non-geometric leaf content such as a measurement registrar. */
  readonly accessory?: React.ReactNode
}

export interface DocumentHeadingBlock extends DocumentBlockBase {
  readonly kind: "heading"
  readonly level: 1 | 2 | 3 | 4 | 5 | 6
  readonly content: React.ReactNode
  /**
   * Optional leaf marker, such as a task checkbox, replacing the default #.
   * DocumentView owns its outdented column so every title stays aligned with
   * ordinary prose, whether it carries a task marker or the default #.
   */
  readonly marker?: React.ReactNode
}

export interface DocumentParagraphBlock extends DocumentBlockBase {
  readonly kind: "paragraph"
  readonly content: React.ReactNode
}

export interface DocumentListItemBlock extends DocumentBlockBase {
  readonly kind: "list-item"
  readonly list: DocumentListItem
  readonly content: React.ReactNode
  /** Optional leaf marker, such as a checkbox. DocumentView still owns its column. */
  readonly marker?: React.ReactNode
  /** Width of a non-text marker in logical layout units. Defaults to one. */
  readonly markerWidth?: number
}

export interface DocumentQuoteBlock extends DocumentBlockBase {
  readonly kind: "quote"
  readonly content: React.ReactNode
}

export interface DocumentCodeBlock extends DocumentBlockBase {
  readonly kind: "code"
  readonly content: React.ReactNode
}

export interface DocumentRuleBlock extends DocumentBlockBase {
  readonly kind: "rule"
}

export interface DocumentTableBlock extends DocumentBlockBase {
  readonly kind: "table"
  readonly headers: readonly string[]
  readonly rows: readonly (readonly string[])[]
  readonly alignments?: readonly ("left" | "right" | "center" | null)[]
}

export interface DocumentExtensionBlock extends DocumentBlockBase {
  /**
   * Registered semantic extension name. The content is leaf/inline content;
   * DocumentView retains the lane, rhythm, wrapping, and row geometry.
   */
  readonly kind: "extension"
  readonly token: string
  readonly content: React.ReactNode
}

/**
 * Geometric document content such as a terminal image. Unlike paragraph and
 * extension content, media is deliberately not wrapped in `<Text>`.
 */
export interface DocumentMediaBlock extends DocumentBlockBase {
  readonly kind: "media"
  readonly content: React.ReactNode
}

export type DocumentBlock =
  | DocumentHeadingBlock
  | DocumentParagraphBlock
  | DocumentListItemBlock
  | DocumentQuoteBlock
  | DocumentCodeBlock
  | DocumentRuleBlock
  | DocumentTableBlock
  | DocumentExtensionBlock
  | DocumentMediaBlock

export interface DocumentViewSearchConfig {
  /** Stable routing id when more than one searchable is mounted. */
  readonly id?: string
  /** Project one semantic block into searchable plain text. */
  readonly getText: (block: DocumentBlock, index: number) => string
  /** Measured viewport controller used to reveal the matching block. */
  readonly scrollController: ScrollController
}

export interface DocumentViewProps {
  readonly blocks: readonly DocumentBlock[]
  readonly selectedId?: DocumentBlockId | null
  readonly empty?: React.ReactNode
  /** Default lane for blocks without an explicit lane. */
  readonly lane?: DocumentLane
  /** Register this semantic document with the enclosing SearchProvider. */
  readonly search?: DocumentViewSearchConfig
  /** Reveal one semantic block from the same measured geometry used by search. */
  readonly reveal?: {
    readonly operationId: string | number
    readonly blockId: DocumentBlockId
    readonly scrollController: ScrollController
  }
}

interface ResolvedListItem {
  readonly marker: React.ReactNode
  readonly markerWidth: number
}

function textMarkerWidth(marker: React.ReactNode): number | null {
  // `displayLength`, not `.length`: this width indents every line of the list
  // item, so it is terminal columns. The built-in markers are all one cell, but
  // a caller-supplied emoji or CJK marker is two and would shift the whole block.
  if (typeof marker === "string") return displayLength(marker)
  if (typeof marker === "number") return displayLength(String(marker))
  return null
}

function resolveListItems(
  blocks: readonly DocumentBlock[],
): ReadonlyMap<DocumentBlockId, ResolvedListItem> {
  const groupCounts = new Map<DocumentBlockId, number>()
  const groupWidths = new Map<DocumentBlockId, number>()
  const provisional = new Map<
    DocumentBlockId,
    { marker: React.ReactNode; width: number; groupId: DocumentBlockId }
  >()

  for (const block of blocks) {
    if (block.kind !== "list-item") continue
    const count = groupCounts.get(block.list.groupId) ?? 0
    groupCounts.set(block.list.groupId, count + 1)
    const marker =
      block.marker ?? (block.list.ordered ? `${(block.list.start ?? 1) + count}.` : "•")
    const width = Math.max(1, block.markerWidth ?? textMarkerWidth(marker) ?? 1)
    provisional.set(block.id, { marker, width, groupId: block.list.groupId })
    groupWidths.set(block.list.groupId, Math.max(groupWidths.get(block.list.groupId) ?? 0, width))
  }

  return new Map(
    [...provisional].map(([id, item]) => [
      id,
      {
        marker: item.marker,
        markerWidth: groupWidths.get(item.groupId) ?? item.width,
      },
    ]),
  )
}

/**
 * Width of the widest heading marker in the document — shared by every
 * heading, not computed per-row like list markers, because the design
 * intent is column ALIGNMENT: a task heading's checkbox and a non-task
 * heading's # must start titles at the same column. At least one cell is
 * reserved for the default #, including documents without task headings.
 *
 * The gutter HANGS in the title's own left margin — it does not push the
 * title right, relative to any OTHER heading in the document (marked or
 * not) OR to a fully marker-less document (see `HeadingRow`,
 * `DOCUMENT_MIN_GUTTER`). `markerWidth + 1` — marker glyph, then one
 * visible gap cell — is the space it needs; `DocumentView` separately
 * guarantees at least that much margin is always there to hang into,
 * whether or not this particular document happens to use heading markers.
 */
function resolveHeadingMarkerWidth(blocks: readonly DocumentBlock[]): number {
  let width = 1
  for (const block of blocks) {
    if (block.kind !== "heading" || block.marker === undefined) continue
    width = Math.max(width, textMarkerWidth(block.marker) ?? 1)
  }
  return width
}

function isListBlock(block: DocumentBlock | undefined): block is DocumentListItemBlock {
  return block?.kind === "list-item"
}

function revealDocumentBlock(
  blocks: readonly DocumentBlock[],
  rowOffsets: ReadonlyMap<DocumentBlockId, number>,
  blockId: DocumentBlockId,
  scrollController: ScrollController,
): boolean {
  if (scrollController.viewportHeight === 0) return false
  const first = blocks[0]
  if (!first) return false
  const y = rowOffsets.get(blockId)
  const firstY = rowOffsets.get(first.id)
  if (y === undefined || firstY === undefined) return false
  const offset = Math.max(0, y - firstY)
  if (scrollController.contentHeight <= offset) return false
  scrollController.setScrollOffset(offset)
  return true
}

function BlockFrame({
  block,
  selected,
  lane,
  marginTop,
  marginBottom,
  onLayout,
  children,
}: {
  block: DocumentBlock
  selected: boolean
  lane: DocumentLane
  marginTop?: number
  marginBottom?: number
  onLayout?: (y: number) => void
  children: React.ReactNode
}): React.ReactElement {
  return (
    <Content.Row>
      <Content.Body width={lane}>
        <Box
          id={String(block.id)}
          testID={String(block.id)}
          data-document-row
          data-document-block-kind={block.kind}
          data-cursor={selected ? true : undefined}
          focusable
          minWidth={0}
          marginTop={marginTop}
          marginBottom={marginBottom}
          onLayout={onLayout ? (rect) => onLayout(rect.y) : undefined}
          backgroundColor={selected ? "$bg-selected" : undefined}
          color={selected ? "$fg-on-selected" : undefined}
        >
          <StylePriorityProvider
            foreground={selected ? "$fg-on-selected" : undefined}
            background={selected ? "$bg-selected" : undefined}
          >
            {block.accessory}
            {children}
          </StylePriorityProvider>
        </Box>
      </Content.Body>
    </Content.Row>
  )
}

function ListItemRow({
  block,
  item,
  selected,
  lane,
  onLayout,
}: {
  block: DocumentListItemBlock
  item: ResolvedListItem
  selected: boolean
  lane: DocumentLane
  onLayout?: (y: number) => void
}): React.ReactElement {
  const color = selected ? "$fg-on-selected" : undefined
  return (
    <BlockFrame block={block} selected={selected} lane={lane} onLayout={onLayout}>
      <Box
        flexDirection="row"
        width="100%"
        minWidth={0}
        paddingLeft={Math.max(0, block.list.depth) * 2}
      >
        <Box
          width={item.markerWidth}
          minWidth={item.markerWidth}
          flexShrink={0}
          justifyContent="flex-end"
        >
          <Text color={color ?? "$fg-muted"}>{item.marker}</Text>
        </Box>
        <Box width={1} minWidth={1} flexShrink={0} />
        <Prose flexGrow={1} minWidth={0}>
          <Text variant="body" color={color} wrap="wrap">
            {block.content}
          </Text>
        </Prose>
      </Box>
    </BlockFrame>
  )
}

function DocumentBlocks({
  blocks,
  selectedId,
  empty,
  lane,
  onBlockLayout,
}: Required<Pick<DocumentViewProps, "blocks" | "lane">> &
  Pick<DocumentViewProps, "selectedId" | "empty"> & {
    onBlockLayout?: (id: DocumentBlockId, y: number) => void
  }): React.ReactElement {
  const resolvedLists = resolveListItems(blocks)
  const headingMarkerWidth = resolveHeadingMarkerWidth(blocks)
  if (blocks.length === 0) {
    return (
      <Content.Row>
        <Content.Body width={lane}>
          <Small>{empty ?? "(empty document)"}</Small>
        </Content.Body>
      </Content.Row>
    )
  }

  return (
    <Box flexDirection="column" minWidth={0}>
      {blocks.map((block, index) => {
        const selected = block.id === selectedId
        const blockLane = block.lane ?? lane
        const previous = blocks[index - 1]
        const afterList = !isListBlock(block) && isListBlock(previous)

        switch (block.kind) {
          case "heading": {
            const headings = [H1, H2, H3, H4, H5, H6] as const
            const Heading = headings[block.level - 1] ?? H6
            const headingNode = (
              <Heading color={selected ? "$fg-on-selected" : undefined} wrap="wrap">
                {block.content}
              </Heading>
            )
            return (
              <BlockFrame
                key={block.id}
                block={block}
                selected={selected}
                lane={blockLane}
                marginTop={afterList ? 1 : undefined}
                marginBottom={1}
                onLayout={(y) => onBlockLayout?.(block.id, y)}
              >
                <HeadingRow
                  level={block.level}
                  markerWidth={headingMarkerWidth}
                  marker={block.marker}
                  color={selected ? "$fg-on-selected" : undefined}
                >
                  {headingNode}
                </HeadingRow>
              </BlockFrame>
            )
          }
          case "list-item": {
            const item = resolvedLists.get(block.id)
            if (!item) {
              throw new Error(`DocumentView: list item ${String(block.id)} was not resolved`)
            }
            return (
              <ListItemRow
                key={block.id}
                block={block}
                item={item}
                selected={selected}
                lane={blockLane}
                onLayout={(y) => onBlockLayout?.(block.id, y)}
              />
            )
          }
          case "rule":
            return (
              <BlockFrame
                key={block.id}
                block={block}
                selected={selected}
                lane={blockLane}
                marginTop={afterList ? 1 : undefined}
                marginBottom={1}
                onLayout={(y) => onBlockLayout?.(block.id, y)}
              >
                <HR />
              </BlockFrame>
            )
          case "quote":
            return (
              <BlockFrame
                key={block.id}
                block={block}
                selected={selected}
                lane={blockLane}
                marginTop={afterList ? 1 : undefined}
                marginBottom={1}
                onLayout={(y) => onBlockLayout?.(block.id, y)}
              >
                <Blockquote color={selected ? "$fg-on-selected" : undefined}>
                  {block.content}
                </Blockquote>
              </BlockFrame>
            )
          case "code":
            return (
              <BlockFrame
                key={block.id}
                block={block}
                selected={selected}
                lane={blockLane}
                marginTop={afterList ? 1 : undefined}
                marginBottom={1}
                onLayout={(y) => onBlockLayout?.(block.id, y)}
              >
                <Box flexGrow={1} minWidth={0} marginX={-2}>
                  <CodeBlock color={selected ? "$fg-on-selected" : undefined}>
                    {block.content}
                  </CodeBlock>
                </Box>
              </BlockFrame>
            )
          case "table":
            return (
              <BlockFrame
                key={block.id}
                block={block}
                selected={selected}
                lane={blockLane}
                marginTop={afterList ? 1 : undefined}
                marginBottom={1}
                onLayout={(y) => onBlockLayout?.(block.id, y)}
              >
                <Content.Table
                  headers={[...block.headers]}
                  rows={block.rows.map((row) => [...row])}
                  alignments={block.alignments === undefined ? undefined : [...block.alignments]}
                />
              </BlockFrame>
            )
          case "media":
            return (
              <BlockFrame
                key={block.id}
                block={block}
                selected={selected}
                lane={blockLane}
                marginTop={afterList ? 1 : undefined}
                marginBottom={1}
                onLayout={(y) => onBlockLayout?.(block.id, y)}
              >
                <Box width="100%" flexDirection="column">
                  {block.content}
                </Box>
              </BlockFrame>
            )
          case "paragraph":
          case "extension":
            return (
              <BlockFrame
                key={block.id}
                block={block}
                selected={selected}
                lane={blockLane}
                marginTop={afterList ? 1 : undefined}
                marginBottom={1}
                onLayout={(y) => onBlockLayout?.(block.id, y)}
              >
                <Text variant="body" color={selected ? "$fg-on-selected" : undefined} wrap="wrap">
                  {block.content}
                </Text>
              </BlockFrame>
            )
        }
      })}
    </Box>
  )
}

/**
 * Minimum blank margin `DocumentView`'s prose lane keeps on EACH side, in
 * cells — always, not just when a heading marker is present. This is what
 * lets `HeadingRow`'s marker gutter (`markerWidth + 1` — see there) hang
 * into ORDINARY document margin at any pane width, with no narrower "flush"
 * degrade: `ProseLane`'s own default floor is only 1 (`Content.tsx`), too
 * narrow to guarantee a glyph plus its gap. Operator: "we always make sure
 * there's a 2-space column to the left and right of text" — deliberately
 * NOT conditioned on whether the document happens to use heading markers,
 * both so every document (marker-bearing or not) gets identical geometry
 * and so the guarantee can never depend on a callsite remembering to ask
 * for it. A rejected alternative — degrade to the marker sitting inline
 * with the title once the pane pinches — is recorded here as the option
 * NOT taken, should a future revision want it back.
 */
const DOCUMENT_MIN_GUTTER = 2

/**
 * Store-neutral semantic document presenter.
 *
 * Adapters supply identities and inline/leaf content. DocumentView owns block
 * rhythm, Content lanes, list counters, marker cells, gaps, and wrapping.
 */
export function DocumentView({
  blocks,
  selectedId = null,
  empty,
  lane = "prose",
  search,
  reveal,
}: DocumentViewProps): React.ReactElement {
  const hasContentLayout = useHasContentLayout()
  const ambientLayout = useContentLayout()
  const searchContext = useSearchOptional()
  const autoSearchId = useId()
  const searchId = search?.id ?? autoSearchId
  const registerSearchable = searchContext?.registerSearchable
  const searchEnabled = search !== undefined
  const blocksRef = useRef(blocks)
  const searchRef = useRef(search)
  const revealRef = useRef(reveal)
  const revealedOperationRef = useRef<string | number | null>(null)
  const rowOffsetsRef = useRef(new Map<DocumentBlockId, number>())
  blocksRef.current = blocks
  searchRef.current = search
  revealRef.current = reveal

  useEffect(() => {
    if (!searchEnabled || !registerSearchable) return
    return registerSearchable(searchId, {
      search(query: string): SearchMatch[] {
        const currentSearch = searchRef.current
        if (!currentSearch || query === "") return []
        return blocksRef.current.flatMap((block, row) =>
          computeMatchRanges(currentSearch.getText(block, row), query).map((range) => ({
            row,
            startCol: range.start,
            endCol: range.end,
          })),
        )
      },
      reveal(match: SearchMatch): void {
        const currentBlocks = blocksRef.current
        const block = currentBlocks[match.row]
        const currentSearch = searchRef.current
        if (!block || !currentSearch) return
        revealDocumentBlock(
          currentBlocks,
          rowOffsetsRef.current,
          block.id,
          currentSearch.scrollController,
        )
      },
    })
  }, [registerSearchable, searchEnabled, searchId])

  useEffect(() => {
    const currentReveal = revealRef.current
    if (!currentReveal || revealedOperationRef.current === currentReveal.operationId) return
    if (
      revealDocumentBlock(
        blocksRef.current,
        rowOffsetsRef.current,
        currentReveal.blockId,
        currentReveal.scrollController,
      )
    ) {
      revealedOperationRef.current = currentReveal.operationId
    }
  }, [
    reveal?.operationId,
    reveal?.scrollController.contentHeight,
    reveal?.scrollController.viewportHeight,
  ])

  const currentSearchMatch =
    searchContext && searchContext.currentMatch >= 0
      ? searchContext.matches[searchContext.currentMatch]
      : undefined
  const searchSelectedId =
    search && currentSearchMatch ? blocks[currentSearchMatch.row]?.id : undefined
  const document = (
    <DocumentBlocks
      blocks={blocks}
      selectedId={searchSelectedId ?? selectedId}
      empty={empty}
      lane={lane}
      onBlockLayout={(id, y) => {
        rowOffsetsRef.current.set(id, y)
        const currentReveal = revealRef.current
        if (!currentReveal || revealedOperationRef.current === currentReveal.operationId) return
        if (
          revealDocumentBlock(
            blocksRef.current,
            rowOffsetsRef.current,
            currentReveal.blockId,
            currentReveal.scrollController,
          )
        ) {
          revealedOperationRef.current = currentReveal.operationId
        }
      }}
    />
  )
  // Always nest a Content.Layout — even when an ancestor already provides
  // one (e.g. km-tui DetailView's own `prose={80} wide={120}`) — so
  // DOCUMENT_MIN_GUTTER is guaranteed regardless of whether the caller's
  // own Layout happens to be wide enough. When an ancestor exists, its
  // resolved prose/wide/align/gap are threaded through unchanged (`ctx`
  // already reflects the real pane's resolved values, so re-declaring them
  // here is a width no-op — see `Layout` in Content.tsx); only
  // `gutterMinWidth` is ever widened. When there is no ancestor, passing
  // `undefined` for those four lets `Content.Layout`'s OWN prop defaults
  // apply exactly as before (notably `align="center"`, which the
  // no-ancestor fallback context value does NOT share — reading `ctx.align`
  // unconditionally here would have silently flipped standalone documents
  // from centered to left-aligned).
  return (
    <Content.Layout
      fill={false}
      prose={hasContentLayout ? ambientLayout.prose : undefined}
      wide={hasContentLayout ? ambientLayout.wide : undefined}
      align={hasContentLayout ? ambientLayout.align : undefined}
      gap={hasContentLayout ? ambientLayout.gap : undefined}
      gutterMinWidth={Math.max(ambientLayout.gutterMinWidth, DOCUMENT_MIN_GUTTER)}
    >
      {document}
    </Content.Layout>
  )
}
