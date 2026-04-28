/**
 * Inline AST Types
 *
 * Typed nodes representing parsed inline markdown content.
 * Used by inline-parser.ts (parseInlineText) for parsing and
 * InlineComponents.tsx (InlineText) for JSX rendering.
 */

// =============================================================================
// Node Types
// =============================================================================

export interface PlainTextNode {
  type: "plain"
  text: string
}

export interface BoldNode {
  type: "bold"
  children: InlineNode[]
}

export interface ItalicNode {
  type: "italic"
  children: InlineNode[]
}

export interface StrikethroughNode {
  type: "strikethrough"
  children: InlineNode[]
}

export interface CodeNode {
  type: "code"
  code: string
}

export interface LinkNode {
  type: "link"
  text: string
  url: string
}

export interface WikiLinkNode {
  type: "wikilink"
  target: string
  alias: string | undefined
  isEmbed: boolean
}

export interface MentionNode {
  type: "mention"
  /** Name without the @ prefix */
  name: string
}

export interface TagNode {
  type: "tag"
  /** Name without the # prefix */
  name: string
}

export interface ProjectNode {
  type: "project"
  /** Name without the + prefix */
  name: string
}

export interface InlineFieldNode {
  type: "field"
  key: string
  value: string
}

export interface BareURLNode {
  type: "bareurl"
  url: string
}

// =============================================================================
// Decoration Type
// =============================================================================

/** A text decoration — ephemeral style applied to a character range */
export interface TextDecoration {
  /** Start offset in the source text (inclusive) */
  start: number
  /** End offset in the source text (exclusive) */
  end: number
  /** Style to apply to the decorated range */
  style: {
    backgroundColor?: string
    color?: string
  }
}

// =============================================================================
// Union Type
// =============================================================================

export type InlineNode =
  | PlainTextNode
  | BoldNode
  | ItalicNode
  | StrikethroughNode
  | CodeNode
  | LinkNode
  | WikiLinkNode
  | MentionNode
  | TagNode
  | ProjectNode
  | InlineFieldNode
  | BareURLNode
