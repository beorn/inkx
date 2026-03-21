/**
 * Inline Text Parser
 *
 * Parses raw inline markdown text into InlineNode[] AST using mdast.
 * Standard markdown (bold, italic, code, links, strikethrough) is handled
 * by mdast's parser. km-specific syntax (wikilinks, @mentions, #tags,
 * +projects, fields, block refs) is recognized in post-processing of
 * mdast `text` nodes.
 *
 * This replaces the regex text pipeline's sequential passes.
 */

import { fromMarkdown } from "mdast-util-from-markdown"
import { km, kmFromMarkdown } from "@km/markdown"
import type { KmWikilink } from "@km/markdown"
import type { PhrasingContent, Root } from "mdast"
import type { InlineNode } from "./inline-ast-types.ts"
import { prettifyUrl } from "./text-pipeline.ts"

// =============================================================================
// mdast → InlineNode[] conversion
// =============================================================================

/**
 * Convert mdast phrasing content nodes to InlineNode[].
 * Handles: text, emphasis, strong, delete, inlineCode, link, image, break, html.
 * Text nodes are post-processed for km-specific syntax.
 */
function phrasingToInline(nodes: PhrasingContent[]): InlineNode[] {
  const result: InlineNode[] = []
  for (const node of nodes) {
    switch (node.type) {
      case "text":
        result.push(...parseKmSyntax(node.value))
        break
      case "strong":
        result.push({ type: "bold", children: phrasingToInline(node.children) })
        break
      case "emphasis":
        result.push({ type: "italic", children: phrasingToInline(node.children) })
        break
      case "delete":
        result.push({ type: "strikethrough", children: phrasingToInline(node.children) })
        break
      case "inlineCode":
        result.push({ type: "code", code: node.value })
        break
      case "link": {
        const linkText = phrasingToPlainText(node.children)
        // Bare/auto URLs: when link text equals URL, treat as bareurl for prettified display
        if (linkText === node.url) {
          result.push({ type: "bareurl", url: node.url })
        } else {
          result.push({ type: "link", text: linkText, url: node.url })
        }
        break
      }
      case "image":
        // Render as a link to the image
        result.push({
          type: "link",
          text: node.alt ?? "image",
          url: node.url,
        })
        break
      case "html":
        // Inline HTML: render as plain text (strip tags)
        result.push({ type: "plain", text: node.value.replace(/<[^>]+>/g, "") })
        break
      case "break":
        result.push({ type: "plain", text: "\n" })
        break
      case "kmWikilink": {
        const wl = node as unknown as KmWikilink
        // Build the full target: target + optional section + optional blockRef
        // e.g., [[target#section^blockRef]], [[^blockRef]], [[target]]
        let fullTarget = wl.target
        if (wl.section) fullTarget += `#${wl.section}`
        if (wl.blockRef) fullTarget += (fullTarget ? "^" : "^") + wl.blockRef
        result.push({
          type: "wikilink",
          target: fullTarget,
          alias: wl.alias,
          isEmbed: wl.embedded,
        })
        break
      }
    }
  }
  return result
}

/** Extract plain text from phrasing content (for link text) */
function phrasingToPlainText(nodes: PhrasingContent[]): string {
  return nodes
    .map((n) => {
      switch (n.type) {
        case "text":
          return n.value
        case "inlineCode":
          return n.value
        case "strong":
        case "emphasis":
        case "delete":
          return phrasingToPlainText(n.children)
        case "link":
          return phrasingToPlainText(n.children)
        default:
          return ""
      }
    })
    .join("")
}

// =============================================================================
// km-specific syntax: wikilinks, sigils, fields, block identifiers
// =============================================================================

/** Patterns for km-specific inline syntax, matched in order of priority */
const KM_PATTERNS = [
  // Arrow block references: → ^numericId or → [[^numericId]] (Asana recurring task parents)
  // Stripped entirely — these are metadata (recur_parent relationship), not display content
  {
    re: /\s*→\s*(?:\[\[)?\^(\d+)(?:\]\])?/g,
    make: (_m: RegExpExecArray): InlineNode => ({ type: "field", key: "recur_parent", value: _m[1]! }),
  },
  // Wiki links: ![[target]], [[target]], [[target|alias]]
  {
    re: /(!?)\[\[([^\]]+)\]\]/g,
    make: (m: RegExpExecArray): InlineNode => {
      const isEmbed = m[1] === "!"
      const inner = m[2]!
      const pipeIdx = inner.indexOf("|")
      return {
        type: "wikilink",
        target: pipeIdx >= 0 ? inner.slice(0, pipeIdx) : inner,
        alias: pipeIdx >= 0 ? inner.slice(pipeIdx + 1) : undefined,
        isEmbed,
      }
    },
  },
  // Bracketed inline fields: [key:: value]
  {
    re: /\[(\w+)::\s*([^\]]*)\]/g,
    make: (m: RegExpExecArray): InlineNode => ({ type: "field", key: m[1]!, value: m[2]! }),
  },
  // Bare key:: value properties
  {
    re: /((?:km\.)?[a-z][a-z0-9_-]*)::\s*(.+?)(?=\s+(?:km\.)?[a-z][a-z0-9_-]*::|$)/gi,
    make: (m: RegExpExecArray): InlineNode => ({ type: "field", key: m[1]!, value: m[2]!.trim() }),
  },
  // Bare ^numericId (10+ digits) — block identifier metadata, stripped from display.
  // Only [[^ID]] wikilinks create visible cross-references; bare ^ID is metadata only.
  {
    re: /\^(\d{10,})/g,
    make: (m: RegExpExecArray): InlineNode => ({ type: "field", key: "block_id", value: m[1]! }),
    // Skip if inside a wikilink
    skipIf: (m: RegExpExecArray, text: string) => {
      const before = text.slice(0, m.index ?? 0)
      const lastOpen = before.lastIndexOf("[[")
      const lastClose = before.lastIndexOf("]]")
      return lastOpen > lastClose
    },
  },
]

/** Sigil pattern: @mentions, #tags, +projects (includes / and . for nested projects) */
const SIGIL_RE = /([@#\+])([\p{L}\p{N}_\/.-]+)/gu

/**
 * Parse km-specific syntax from a text node.
 * Finds wikilinks, fields, block refs first, then sigils in remaining text.
 */
function parseKmSyntax(text: string): InlineNode[] {
  // Collect all non-overlapping matches
  type Match = { start: number; end: number; node: InlineNode }
  const matches: Match[] = []

  const addIfFree = (start: number, end: number, node: InlineNode) => {
    for (const m of matches) {
      if (start < m.end && end > m.start) return
    }
    matches.push({ start, end, node })
  }

  for (const pattern of KM_PATTERNS) {
    pattern.re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = pattern.re.exec(text)) !== null) {
      if (pattern.skipIf?.(m, text)) continue
      addIfFree(m.index, m.index + m[0].length, pattern.make(m))
    }
  }

  // Sigils in remaining text
  SIGIL_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = SIGIL_RE.exec(text)) !== null) {
    const prefix = m[1]!
    const name = m[2]!
    const node: InlineNode =
      prefix === "@" ? { type: "mention", name } : prefix === "#" ? { type: "tag", name } : { type: "project", name }
    addIfFree(m.index, m.index + m[0].length, node)
  }

  if (matches.length === 0) {
    return text ? [{ type: "plain", text }] : []
  }

  // Sort by position and interleave with plain text
  matches.sort((a, b) => a.start - b.start)
  const result: InlineNode[] = []
  let pos = 0
  for (const match of matches) {
    if (match.start > pos) {
      result.push({ type: "plain", text: text.slice(pos, match.start) })
    }
    result.push(match.node)
    pos = match.end
  }
  if (pos < text.length) {
    result.push({ type: "plain", text: text.slice(pos) })
  }
  return result
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Parse inline markdown text into an AST.
 *
 * Uses mdast for standard markdown (bold, italic, code, links, strikethrough),
 * then post-processes text nodes for km-specific syntax (wikilinks, sigils,
 * fields, block refs).
 *
 * Usage:
 *   const nodes = parseInlineText("**bold** and @user")
 *   // → [{ type: "bold", children: [{ type: "plain", text: "bold" }] },
 *   //    { type: "plain", text: " and " },
 *   //    { type: "mention", name: "user" }]
 */
export function parseInlineText(text: string): InlineNode[] {
  if (!text) return []

  // Parse as a paragraph using mdast
  const tree: Root = fromMarkdown(text, {
    extensions: [km()],
    mdastExtensions: kmFromMarkdown(),
  })

  // The tree contains block-level nodes. Process all paragraphs,
  // joining them with newlines (preserving multi-paragraph content).
  const result: InlineNode[] = []
  for (let i = 0; i < tree.children.length; i++) {
    const child = tree.children[i]
    if (i > 0) result.push({ type: "plain", text: "\n" })
    if (child?.type === "paragraph" && "children" in child) {
      result.push(...phrasingToInline(child.children))
      // Note: kmBlockIdTransform strips trailing " ^ID" and stores it in
      // node.data.blockId. This is the block's OWN identifier (metadata),
      // not a reference to another block. We intentionally do NOT re-inject
      // it as a blockref node — block identifiers are not rendered.
      // Only [[^ID]] wikilinks create visible cross-references.
    } else {
      // Fallback for non-paragraph blocks (headings, code blocks, etc.)
      const pos = child?.position as { start?: { offset?: number }; end?: { offset?: number } } | undefined
      const start = pos?.start?.offset ?? 0
      const end = pos?.end?.offset ?? text.length
      result.push(...parseKmSyntax(text.slice(start, end)))
    }
  }

  return result
}

/**
 * Convenience: parse inline text and flatten to plain text in one step.
 */
export function parseToPlainText(text: string): string {
  return inlineNodesToPlainText(parseInlineText(text))
}

/**
 * Flatten an InlineNode[] to plain text (no formatting, no metadata).
 * Useful for search indexing and measurement.
 */
export function inlineNodesToPlainText(nodes: InlineNode[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case "plain":
          return node.text
        case "bold":
        case "italic":
        case "strikethrough":
          return inlineNodesToPlainText(node.children)
        case "code":
          return node.code
        case "link":
          return node.text
        case "wikilink": {
          const display = node.alias ?? node.target
          // Pure blockref targets (^numericId) are metadata, not display text
          return /^\^\d+$/.test(display) ? "" : display
        }
        case "mention":
          return `@${node.name}`
        case "tag":
          return `#${node.name}`
        case "project":
          return `+${node.name}`
        case "field":
          return "" // metadata, not display text
        case "blockref":
          return "" // metadata, not display text
        case "bareurl":
          return prettifyUrl(node.url)
      }
    })
    .join("")
}
