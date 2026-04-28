/**
 * @km/text-render — shared inline text rendering primitives.
 *
 * Pure parsing + helpers consumed by both km-tui (InlineComponents.tsx) and
 * silvercode (MarkdownView). React components live in the consumers — this
 * package owns the data layer (AST, parser, plain-text helpers, decorations).
 *
 * ## Modules
 * - inline-ast-types — InlineNode union (bold/italic/code/link/wikilink/mention/tag/project/field/bareurl/plain)
 * - inline-parser — text → InlineNode[] (mdast + km-syntax post-processing)
 * - text-pipeline — extractRefs, prettifyUrl, SIGIL_PATTERN
 * - rich — displayLength (Unicode-aware via string-width), stripAnsi
 * - search-decorations — TextDecoration[] for highlighted query matches
 */

// AST types
export type {
  BareURLNode,
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

// Parser (string → InlineNode[])
export { parseInlineText, parseToPlainText, inlineNodesToPlainText } from "./inline-parser.ts"

// Pipeline helpers
export { extractRefs, prettifyUrl, SIGIL_PATTERN } from "./text-pipeline.ts"

// ANSI-aware string utilities
export { displayLength, stripAnsi } from "./rich.ts"

// Search decorations
export { computeSearchDecorations, computeSearchDecorationsFromSource } from "./search-decorations.ts"
