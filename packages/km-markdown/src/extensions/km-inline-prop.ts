/* oxlint-disable typescript-eslint/no-unsafe-call, typescript-eslint/no-unsafe-member-access, typescript-eslint/no-unsafe-assignment, typescript-eslint/no-unsafe-argument, typescript-eslint/no-explicit-any -- mdast tree traversal uses untyped node children */

import type { Root } from "mdast"
import { visit } from "unist-util-visit"
import { extractKVProperties } from "@km/core"
import { parseInlineProperties, nodeToText } from "../parser.ts"

export function kmInlinePropTransform(tree: Root): void {
  visit(tree, (node, _index, parent) => {
    // Process paragraphs and headings
    if (node.type !== "paragraph" && node.type !== "heading") return

    const text = nodeToText(node as any)
    const { entries, cleanText } = extractKVProperties(text)

    // Skip if no properties found
    if (entries.length === 0) return

    // Build propsRaw from ALL entries (including km.* for headings)
    // Duplicate keys are concatenated with ", " (supports repeated km.add:: syntax)
    const propsRaw: Record<string, string> = {}
    for (const { key, value } of entries) {
      const k = key.toLowerCase()
      propsRaw[k] = propsRaw[k] !== undefined ? `${propsRaw[k]}, ${value}` : value
    }

    // Build typed props (excluding km.* system properties)
    const parsed = parseInlineProperties(text)

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
