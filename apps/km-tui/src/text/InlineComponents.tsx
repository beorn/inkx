/**
 * Inline AST Components
 *
 * React (silvery) components for rendering inline AST nodes.
 * Each component maps an AST node type to JSX output using
 * silvery's Text component for terminal styling.
 *
 * Each component handles an InlineNode type from the inline parser.
 * The InlineText component is the main entry point — it parses text
 * into an AST and renders via InlineNodes.
 */

import React, { useCallback, useEffect, useRef } from "react"
import { Link, Text } from "@silvery/ag-react"
import type { SilveryMouseEvent } from "@silvery/ag-term/mouse-events"
import { getTermColor } from "./colors.ts"
import { parseInlineText } from "./inline-parser.ts"
import { prettifyUrl } from "./text-pipeline.ts"
import {
  usePopover,
  urlPopoverContent,
  richUrlPopoverContent,
  internalLinkPopoverContent,
  type PopoverContent,
} from "../views/Popover.tsx"
import { getCachedMetadata, fetchUrlMetadata } from "./url-metadata.ts"
import type {
  BareURLNode,
  BlockRefNode,
  BoldNode,
  CodeNode,
  InlineFieldNode,
  InlineNode,
  ItalicNode,
  LinkNode,
  MentionNode,
  PlainTextNode,
  ProjectNode,
  StrikethroughNode,
  TagNode,
  TextDecoration,
  WikiLinkNode,
} from "./inline-ast-types.ts"

// =============================================================================
// Render Context (passed through to configure sigil behavior)
// =============================================================================

export interface InlineRenderContext {
  /** Sigils to exclude entirely from output */
  excludeSigils?: Set<string>
  /** Map of sigil string (e.g. "@next") to color name */
  sigilColors?: Map<string, string>
  /** Dynamic color resolver for sigils not in the map */
  resolveSigilColor?: (sigil: string) => string | undefined
  /** Replace @mentions with short names */
  shortenMentions?: boolean
  /** Person name -> short name map */
  personShortNames?: Record<string, string>
  /** Strip all sigils */
  stripRefs?: boolean
  /** Strip #tags and +projects but keep @mentions */
  stripTagsAndProjects?: boolean
  /** Strip known person @mentions entirely */
  stripKnownMentions?: boolean
  /** Resolve wiki link targets to display titles */
  resolveWikiLink?: (target: string) => string | null
  /** Resolve wiki link targets to node IDs (for Cmd-click navigation) */
  resolveWikiLinkId?: (target: string) => string | null
  /** Resolve block ref IDs to display titles */
  resolveBlockRef?: (id: string) => string | null
  /**
   * Color override for selected/highlighted items.
   * - `undefined`: use each component's own token color (default)
   * - `null`: strip all foreground colors
   * - `string`: use this color for all tokens
   */
  colorOverride?: string | null
  /** Hide inline fields from display */
  hideFields?: boolean
  /** Build rich popover content for an internal link (wikilink/blockref) — returns render callback for DocContent */
  buildLinkPopover?: (target: string) => PopoverContent | null
}

const InlineRenderCtx = React.createContext<InlineRenderContext>({})

export const InlineRenderProvider = InlineRenderCtx.Provider

function useInlineRenderContext(): InlineRenderContext {
  return React.useContext(InlineRenderCtx)
}

/**
 * Resolve a token color against the context's colorOverride.
 * - colorOverride undefined → return token (use component's own color)
 * - colorOverride null → return undefined (strip color)
 * - colorOverride string → return that string (override color)
 */
function resolveColor(ctx: InlineRenderContext, token: string): string | undefined {
  if (ctx.colorOverride === undefined) return token
  return ctx.colorOverride ?? undefined
}

// =============================================================================
// Decoration Support
// =============================================================================

/** Props for threading decorations through the component tree */
interface DecorationProps {
  decorations?: TextDecoration[]
  offset?: number
}

/**
 * Compute the visible text length of an AST node.
 * Must match the output of inlineNodesToPlainText for each node type.
 * Used for tracking character offsets when applying decorations.
 */
function getNodeTextLength(node: InlineNode): number {
  switch (node.type) {
    case "plain":
      return node.text.length
    case "code":
      return node.code.length
    case "mention":
      return node.name.length + 1 // @name
    case "tag":
      return node.name.length + 1 // #name
    case "project":
      return node.name.length + 1 // +name
    case "wikilink":
      return (node.alias ?? node.target).length
    case "link":
      return node.text.length
    case "bareurl":
      return prettifyUrl(node.url).length
    case "field":
      return 0 // metadata, not display text
    case "blockref":
      return 0 // resolved display varies; decorations across blockrefs are rare
    case "bold":
    case "italic":
    case "strikethrough":
      return node.children.reduce((sum, c) => sum + getNodeTextLength(c), 0)
  }
}

/**
 * Render text with decoration highlights applied.
 * Splits text at decoration boundaries and wraps highlighted ranges in styled Text.
 */
function DecoratedText({
  text,
  decorations,
  offset,
}: {
  text: string
  decorations: TextDecoration[]
  offset: number
}): React.ReactElement {
  const parts: React.ReactElement[] = []
  let cursor = 0

  // Map decorations to local coordinates and filter to overlapping ranges
  const sorted = decorations
    .map((d) => ({
      localStart: Math.max(0, d.start - offset),
      localEnd: Math.min(text.length, d.end - offset),
      style: d.style,
    }))
    .filter((d) => d.localStart < d.localEnd)
    .sort((a, b) => a.localStart - b.localStart)

  for (const dec of sorted) {
    if (dec.localStart > cursor) {
      parts.push(<Text key={parts.length}>{text.slice(cursor, dec.localStart)}</Text>)
    }
    parts.push(
      <Text key={parts.length} backgroundColor={dec.style.backgroundColor} color={dec.style.color}>
        {text.slice(dec.localStart, dec.localEnd)}
      </Text>,
    )
    cursor = dec.localEnd
  }
  if (cursor < text.length) {
    parts.push(<Text key={parts.length}>{text.slice(cursor)}</Text>)
  }
  return <>{parts}</>
}

// =============================================================================
// Node Components
// =============================================================================

export function InlinePlainText({
  node,
  decorations,
  offset,
}: { node: PlainTextNode } & DecorationProps): React.ReactElement {
  if (!decorations?.length) return <Text>{node.text}</Text>
  return <DecoratedText text={node.text} decorations={decorations} offset={offset ?? 0} />
}

export function InlineBold({ node, decorations, offset }: { node: BoldNode } & DecorationProps): React.ReactElement {
  return (
    <Text bold>
      <InlineNodes nodes={node.children} decorations={decorations} offset={offset} />
    </Text>
  )
}

export function InlineItalic({
  node,
  decorations,
  offset,
}: { node: ItalicNode } & DecorationProps): React.ReactElement {
  return (
    <Text italic>
      <InlineNodes nodes={node.children} decorations={decorations} offset={offset} />
    </Text>
  )
}

export function InlineStrikethrough({
  node,
  decorations,
  offset,
}: { node: StrikethroughNode } & DecorationProps): React.ReactElement {
  return (
    <Text dim strikethrough>
      <InlineNodes nodes={node.children} decorations={decorations} offset={offset} />
    </Text>
  )
}

export function InlineCode({ node, decorations, offset }: { node: CodeNode } & DecorationProps): React.ReactElement {
  const ctx = useInlineRenderContext()
  if (decorations?.length) {
    return (
      <Text color={resolveColor(ctx, "$inputborder")}>
        <DecoratedText text={node.code} decorations={decorations} offset={offset ?? 0} />
      </Text>
    )
  }
  return <Text color={resolveColor(ctx, "$inputborder")}>{node.code}</Text>
}

export function InlineLink({ node }: { node: LinkNode }): React.ReactElement {
  return <UrlHoverBox url={node.url}>{node.text}</UrlHoverBox>
}

export function InlineWikiLink({ node }: { node: WikiLinkNode }): React.ReactElement {
  const ctx = useInlineRenderContext()
  const resolved = node.alias ?? ctx.resolveWikiLink?.(node.target)
  const popover = usePopover()
  const [hovered, setHovered] = React.useState(false)
  const onMouseEnter = useCallback(
    (e: SilveryMouseEvent) => {
      setHovered(true)
      if (!popover) return
      // Rich popover with DocContent (same as card hover) if available
      const richContent = ctx.buildLinkPopover?.(node.target)
      if (richContent) {
        popover.show(richContent, { x: e.clientX, y: e.clientY })
      } else {
        const title = resolved ?? node.target
        popover.show(internalLinkPopoverContent(title), { x: e.clientX, y: e.clientY })
      }
    },
    [popover, resolved, node.target, ctx],
  )
  const onMouseLeave = useCallback(() => {
    setHovered(false)
    popover?.hide()
  }, [popover])
  if (resolved) {
    // Wikilink styling:
    // - Default: dotted underline in $border (faint, always consistent)
    // - Hovered: $link fg + subtle pill bg (#404050 blue-tinted gray), no underline
    // Skip pill bg when card has custom colors (e.g. yellow heading bg) —
    // the dark pill clashes with colored backgrounds.
    // id = resolved node ID so Cmd-click navigates to the link target, not the containing block.
    const linkNodeId = ctx.resolveWikiLinkId?.(node.target)
    const pillBg = hovered && ctx.colorOverride === undefined ? "#404050" : undefined
    return (
      <Text
        id={linkNodeId ?? undefined}
        color={hovered ? resolveColor(ctx, "$link") : resolveColor(ctx, "")}
        backgroundColor={pillBg}
        underlineStyle={hovered ? false : "dotted"}
        underlineColor="$border"
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        {resolved}
      </Text>
    )
  }
  // Unresolved (broken wikilink): visual cue so it's obviously not a normal word.
  // Red foreground + dashed underline in $error. Hover popover still works so the
  // user can see what the unresolved target was.
  return (
    <Text
      color={resolveColor(ctx, "$error")}
      underlineStyle="dashed"
      underlineColor="$error"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {node.target}
    </Text>
  )
}

export function InlineMention({ node }: { node: MentionNode }): React.ReactElement | null {
  const ctx = useInlineRenderContext()
  const sigil = `@${node.name}`

  if (ctx.excludeSigils?.has(sigil)) return null
  if (ctx.stripRefs) return null

  // Shorten or strip known mentions
  if (ctx.shortenMentions) {
    const shortName = ctx.personShortNames?.[node.name.toLowerCase()]
    if (shortName) {
      if (ctx.stripKnownMentions) return null
      return <SigilText sigil={`@${shortName}`} />
    }
  }

  return <SigilText sigil={sigil} />
}

export function InlineTag({ node }: { node: TagNode }): React.ReactElement | null {
  const ctx = useInlineRenderContext()
  const sigil = `#${node.name}`

  if (ctx.excludeSigils?.has(sigil)) return null
  if (ctx.stripRefs) return null
  if (ctx.stripTagsAndProjects) return null

  return <SigilText sigil={sigil} />
}

export function InlineProject({ node }: { node: ProjectNode }): React.ReactElement | null {
  const ctx = useInlineRenderContext()
  const sigil = `+${node.name}`

  if (ctx.excludeSigils?.has(sigil)) return null
  if (ctx.stripRefs) return null
  if (ctx.stripTagsAndProjects) return null

  return <SigilText sigil={sigil} />
}

export function InlineField({ node }: { node: InlineFieldNode }): React.ReactElement | null {
  const ctx = useInlineRenderContext()
  if (ctx.hideFields) return null
  const hasColorOverride = ctx.colorOverride !== undefined
  const styledValue = hasColorOverride ? <Text>{node.value.trim()}</Text> : colorFieldValue(node.value.trim())
  return (
    <Text>
      <Text dim color={resolveColor(ctx, "$inputborder")}>
        {node.key}
      </Text>
      <Text dim>{":: "}</Text>
      {styledValue}
    </Text>
  )
}

export function InlineBareURL({ node }: { node: BareURLNode }): React.ReactElement {
  return <UrlHoverBox url={node.url}>{prettifyUrl(node.url)}</UrlHoverBox>
}

export function InlineBlockRef({ node }: { node: BlockRefNode }): React.ReactElement {
  const ctx = useInlineRenderContext()
  const resolved = ctx.resolveBlockRef?.(node.id)
  const popover = usePopover()
  const onMouseEnter = useCallback(
    (e: SilveryMouseEvent) => {
      const title = resolved ?? node.id
      popover?.show(internalLinkPopoverContent(title), { x: e.clientX, y: e.clientY })
    },
    [popover, resolved, node.id],
  )
  const onMouseLeave = useCallback(() => popover?.hide(), [popover])
  if (resolved) {
    return (
      <Text bold onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
        {resolved}
      </Text>
    )
  }
  // Unresolved block refs: show ID in red so broken refs are visible
  return <Text color={resolveColor(ctx, "$error")}>^{node.id}</Text>
}

// =============================================================================
// Composite Renderer
// =============================================================================

/** Render an array of inline AST nodes, threading decorations with offset tracking */
export function InlineNodes({
  nodes,
  decorations,
  offset = 0,
}: { nodes: InlineNode[] } & DecorationProps): React.ReactElement {
  if (!decorations?.length) {
    // Fast path: no decorations, render as before
    return (
      <>
        {nodes.map((node, i) => (
          <InlineNodeView key={i} node={node} />
        ))}
      </>
    )
  }

  // Slow path: track offsets and filter decorations per node
  let currentOffset = offset
  return (
    <>
      {nodes.map((node, i) => {
        const nodeOffset = currentOffset
        const nodeLen = getNodeTextLength(node)
        currentOffset += nodeLen
        // Filter decorations overlapping this node's range
        const nodeDecorations = decorations.filter((d) => d.start < nodeOffset + nodeLen && d.end > nodeOffset)
        if (!nodeDecorations.length) {
          return <InlineNodeView key={i} node={node} />
        }
        return <InlineNodeView key={i} node={node} decorations={nodeDecorations} offset={nodeOffset} />
      })}
    </>
  )
}

/** Render a single inline AST node */
export function InlineNodeView({
  node,
  decorations,
  offset,
}: { node: InlineNode } & DecorationProps): React.ReactElement | null {
  switch (node.type) {
    case "plain":
      return <InlinePlainText node={node} decorations={decorations} offset={offset} />
    case "bold":
      return <InlineBold node={node} decorations={decorations} offset={offset} />
    case "italic":
      return <InlineItalic node={node} decorations={decorations} offset={offset} />
    case "strikethrough":
      return <InlineStrikethrough node={node} decorations={decorations} offset={offset} />
    case "code":
      return <InlineCode node={node} decorations={decorations} offset={offset} />
    case "link":
      return <InlineLink node={node} />
    case "wikilink":
      return <InlineWikiLink node={node} />
    case "mention":
      return <InlineMention node={node} />
    case "tag":
      return <InlineTag node={node} />
    case "project":
      return <InlineProject node={node} />
    case "field":
      return <InlineField node={node} />
    case "bareurl":
      return <InlineBareURL node={node} />
    case "blockref":
      return <InlineBlockRef node={node} />
  }
}

// =============================================================================
// Internal Helpers
// =============================================================================

/** Render a sigil with its resolved color, or plain if unresolved */
function SigilText({ sigil }: { sigil: string }): React.ReactElement {
  const ctx = useInlineRenderContext()
  if (ctx.colorOverride !== undefined) return <Text>{sigil}</Text>
  const color = ctx.sigilColors?.get(sigil) ?? ctx.resolveSigilColor?.(sigil)

  if (color) {
    return <Text>{getTermColor(color)(sigil)}</Text>
  }
  return <Text>{sigil}</Text>
}

function UrlHoverBox({ url, children }: { url: string; children: React.ReactNode }): React.ReactElement {
  const ctx = useInlineRenderContext()
  const popover = usePopover()
  const hoveredRef = useRef(false)
  // Cleanup: mark as unhovered on unmount so stale fetches don't call update
  useEffect(
    () => () => {
      hoveredRef.current = false
    },
    [],
  )
  const onMouseEnter = useCallback(
    (e: SilveryMouseEvent) => {
      hoveredRef.current = true
      const anchor = { x: e.clientX, y: e.clientY }
      const cached = getCachedMetadata(url)
      if (cached) {
        popover?.show(richUrlPopoverContent(url, cached), anchor)
      } else {
        popover?.show(urlPopoverContent(url, { loading: true }), anchor)
        void fetchUrlMetadata(url).then((meta) => {
          if (!hoveredRef.current) return
          if (meta) {
            popover?.update(richUrlPopoverContent(url, meta))
          } else {
            popover?.update(urlPopoverContent(url))
          }
        })
      }
    },
    [popover, url],
  )
  const onMouseLeave = useCallback(() => {
    hoveredRef.current = false
    popover?.hide()
  }, [popover])
  return (
    <Link
      href={url}
      color={resolveColor(ctx, "$link")}
      underline={false}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </Link>
  )
}

// =============================================================================
// High-level InlineText component
// =============================================================================

/**
 * Render inline markdown text as JSX.
 *
 * Parses text into an AST and renders via InlineNodes.
 *
 * Usage:
 *   <InlineText text="**bold** @user [[link]]" />
 *   <InlineText text={title} context={{ excludeSigils: new Set(["@issue"]) }} />
 */
export function InlineText({
  text,
  context,
  decorations,
}: {
  text: string
  context?: InlineRenderContext
  decorations?: TextDecoration[]
}): React.ReactElement {
  const nodes = React.useMemo(() => parseInlineText(text), [text])
  const parentCtx = useInlineRenderContext()
  const inner = <InlineNodes nodes={nodes} decorations={decorations} />
  if (context) {
    // Merge with parent context so overrides (e.g. colorOverride) don't wipe
    // resolution functions (resolveWikiLink, resolveBlockRef, buildLinkPopover)
    const merged = { ...parentCtx, ...context }
    return <InlineRenderProvider value={merged}>{inner}</InlineRenderProvider>
  }
  return inner
}

/** Color an inline field value by its type */
function colorFieldValue(value: string): React.ReactElement {
  // Dates: success (green)
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    return <Text color="$success">{value}</Text>
  }
  // Numbers: primary (yellow)
  if (/^\d+(\.\d+)?$/.test(value)) {
    return <Text color="$primary">{value}</Text>
  }
  // Default: text
  return <Text color="$fg">{value}</Text>
}
