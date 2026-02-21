/**
 * Inline AST Types
 *
 * Typed nodes representing parsed inline markdown content.
 * Used by InlineComponents.tsx for JSX rendering and by the
 * future inline parser (Phase 2) that will replace the regex
 * text pipeline.
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

export interface BlockRefNode {
  type: "blockref"
  id: string
}

export interface BareURLNode {
  type: "bareurl"
  url: string
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
  | BlockRefNode
  | BareURLNode
