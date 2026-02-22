/**
 * Inline AST Components
 *
 * React (inkx) components for rendering inline AST nodes.
 * Each component maps an AST node type to JSX output using
 * inkx's Text component for terminal styling.
 *
 * Each component handles an InlineNode type from the inline parser.
 * The InlineText component is the main entry point — it parses text
 * into an AST and renders via InlineNodes.
 */

import React from "react"
import { Text } from "inkx"
import { getTermColor } from "./colors.ts"
import { parseInlineText } from "./inline-parser.ts"
import { prettifyUrl } from "./text-pipeline.ts"
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
  /** Strip all foreground colors (for selected/highlighted items) */
  noColor?: boolean
  /** Hide inline fields from display */
  hideFields?: boolean
}

const InlineRenderCtx = React.createContext<InlineRenderContext>({})

export const InlineRenderProvider = InlineRenderCtx.Provider

function useInlineRenderContext(): InlineRenderContext {
  return React.useContext(InlineRenderCtx)
}

// =============================================================================
// Node Components
// =============================================================================

export function InlinePlainText({ node }: { node: PlainTextNode }): React.ReactElement {
  return <Text>{node.text}</Text>
}

export function InlineBold({ node }: { node: BoldNode }): React.ReactElement {
  return (
    <Text bold>
      <InlineNodes nodes={node.children} />
    </Text>
  )
}

export function InlineItalic({ node }: { node: ItalicNode }): React.ReactElement {
  return (
    <Text italic>
      <InlineNodes nodes={node.children} />
    </Text>
  )
}

export function InlineStrikethrough({ node }: { node: StrikethroughNode }): React.ReactElement {
  return (
    <Text dim strikethrough>
      <InlineNodes nodes={node.children} />
    </Text>
  )
}

export function InlineCode({ node }: { node: CodeNode }): React.ReactElement {
  const ctx = useInlineRenderContext()
  return <Text color={ctx.noColor ? undefined : "cyan"}>{node.code}</Text>
}

export function InlineLink({ node }: { node: LinkNode }): React.ReactElement {
  const ctx = useInlineRenderContext()
  return (
    <Text color={ctx.noColor ? undefined : "cyan"} underline>
      {node.text}
    </Text>
  )
}

export function InlineWikiLink({ node }: { node: WikiLinkNode }): React.ReactElement {
  const ctx = useInlineRenderContext()
  const display = node.alias ?? ctx.resolveWikiLink?.(node.target) ?? node.target
  return (
    <Text color={ctx.noColor ? undefined : "green"} underline>
      {display}
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
  const styledValue = ctx.noColor ? <Text>{node.value.trim()}</Text> : colorFieldValue(node.value.trim())
  return (
    <Text>
      <Text dim color={ctx.noColor ? undefined : "cyan"}>
        {node.key}
      </Text>
      <Text dim>{":: "}</Text>
      {styledValue}
    </Text>
  )
}

export function InlineBareURL({ node }: { node: BareURLNode }): React.ReactElement {
  const ctx = useInlineRenderContext()
  const display = prettifyUrl(node.url)
  return (
    <Text color={ctx.noColor ? undefined : "cyan"} dim={!ctx.noColor} underline>
      {display}
    </Text>
  )
}

export function InlineBlockRef({ node: _node }: { node: BlockRefNode }): null {
  // Block refs are metadata-only; not rendered in display
  return null
}

// =============================================================================
// Composite Renderer
// =============================================================================

/** Render an array of inline AST nodes */
export function InlineNodes({ nodes }: { nodes: InlineNode[] }): React.ReactElement {
  return (
    <>
      {nodes.map((node, i) => (
        <InlineNodeView key={i} node={node} />
      ))}
    </>
  )
}

/** Render a single inline AST node */
export function InlineNodeView({ node }: { node: InlineNode }): React.ReactElement | null {
  switch (node.type) {
    case "plain":
      return <InlinePlainText node={node} />
    case "bold":
      return <InlineBold node={node} />
    case "italic":
      return <InlineItalic node={node} />
    case "strikethrough":
      return <InlineStrikethrough node={node} />
    case "code":
      return <InlineCode node={node} />
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
  if (ctx.noColor) return <Text>{sigil}</Text>
  const color = ctx.sigilColors?.get(sigil) ?? ctx.resolveSigilColor?.(sigil)

  if (color) {
    return <Text>{getTermColor(color)(sigil)}</Text>
  }
  return <Text>{sigil}</Text>
}

// =============================================================================
// High-level InlineText component
// =============================================================================

/**
 * Render inline markdown text as JSX.
 *
 * Parses text into an AST and renders via InlineNodes.
 * Drop-in replacement for `renderRich(text, options)` usage.
 *
 * Usage:
 *   <InlineText text="**bold** @user [[link]]" />
 *   <InlineText text={title} context={{ excludeSigils: new Set(["@issue"]) }} />
 */
export function InlineText({
  text,
  context,
}: {
  text: string
  context?: InlineRenderContext
}): React.ReactElement {
  const nodes = React.useMemo(() => parseInlineText(text), [text])
  if (context) {
    return (
      <InlineRenderProvider value={context}>
        <InlineNodes nodes={nodes} />
      </InlineRenderProvider>
    )
  }
  return <InlineNodes nodes={nodes} />
}

/** Color an inline field value by its type */
function colorFieldValue(value: string): React.ReactElement {
  // Dates: green
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    return <Text color="green">{value}</Text>
  }
  // Numbers: yellow
  if (/^\d+(\.\d+)?$/.test(value)) {
    return <Text color="yellow">{value}</Text>
  }
  // Default: white
  return <Text color="white">{value}</Text>
}
