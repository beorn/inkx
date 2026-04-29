/* oxlint-disable typescript-eslint/no-unsafe-call, typescript-eslint/no-unsafe-member-access, typescript-eslint/no-unsafe-assignment, typescript-eslint/no-unsafe-argument, typescript-eslint/no-explicit-any -- mdast tree traversal uses untyped node children */

import type { Root } from "mdast"
import { visit } from "unist-util-visit"
import { extractKVProperties } from "@km/core"
import { parseInlineProperties, nodeToText } from "../parser.ts"

/**
 * Flatten a heading/paragraph to text, but mask out `inlineCode` content with
 * spaces of equal length. This produces text whose character positions match
 * `nodeToText(node)` exactly, but where `key::` syntax appearing inside inline
 * code (i.e. documentation prose like `` `km.add::` ``) cannot match the
 * property extractor regex.
 *
 * Why: the inline-property extractor must respect mdast's classification.
 * `inlineCode` is by definition prose-quoted-literal; treating it as
 * structural data caused phantom rules to fire on documentation pages
 * (km-kmadd-in-doc-text). The original text — including the backticked
 * snippet — still survives as `cleanText` for the heading title.
 */
function nodeToMaskedText(node: any): string {
  if (node.type === "inlineCode" && typeof node.value === "string") {
    return " ".repeat(node.value.length)
  }
  if (node.type === "break") {
    return "\n"
  }
  // Preserve the existing nodeToText behaviour for kmWikilink and bare-value
  // nodes (text, code) by delegating when no children are present.
  if (!("children" in node) || !Array.isArray(node.children)) {
    return nodeToText(node)
  }
  return node.children.map((c: any) => nodeToMaskedText(c)).join("")
}

export function kmInlinePropTransform(tree: Root): void {
  visit(tree, (node, _index, parent) => {
    // Process paragraphs and headings
    if (node.type !== "paragraph" && node.type !== "heading") return

    // Mask inline code so `key::` inside backticks (doc prose) cannot match.
    const text = nodeToText(node as any)
    const masked = nodeToMaskedText(node as any)
    const { entries } = extractKVProperties(masked)

    // Skip if no properties found
    if (entries.length === 0) return

    // Recompute cleanText from the ORIGINAL text using the matched ranges
    // (positions are identical between masked and original).
    let cleanText = ""
    let lastEnd = 0
    for (const entry of entries) {
      cleanText += text.slice(lastEnd, entry.start)
      lastEnd = entry.end
    }
    cleanText += text.slice(lastEnd)
    cleanText = cleanText.replace(/\s+/g, " ").trim()

    // Build propsRaw from ALL entries (including km.* for headings)
    // Duplicate keys are concatenated with ", " (supports repeated km.add:: syntax)
    const propsRaw: Record<string, string> = {}
    for (const { key, value } of entries) {
      const k = key.toLowerCase()
      propsRaw[k] = propsRaw[k] !== undefined ? `${propsRaw[k]}, ${value}` : value
    }

    // Build typed props (excluding km.* system properties).
    // Pass the masked text so prose-quoted properties don't show up here either.
    const parsed = parseInlineProperties(masked)

    // Store on the node's data
    node.data = node.data || {}
    node.data.props = parsed.props
    node.data.propsRaw = propsRaw
    node.data.cleanText = cleanText

    // If this paragraph is inside a listItem, hoist to the listItem too
    // (only for the FIRST paragraph in the list item)
    if (parent?.type === "listItem") {
      const listItemChildren = (parent as any).children
      const firstPara = listItemChildren?.find((c: any) => c.type === "paragraph")
      if (firstPara === node) {
        parent.data = parent.data || {}
        parent.data.props = parsed.props
        parent.data.propsRaw = propsRaw
        parent.data.cleanText = cleanText
      }
    }
  })
}
