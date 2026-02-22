/* oxlint-disable typescript-eslint/no-unsafe-call, typescript-eslint/no-unsafe-member-access, typescript-eslint/no-unsafe-assignment, typescript-eslint/no-unsafe-argument, typescript-eslint/no-explicit-any -- mdast tree traversal uses untyped node children */

import type { Root } from "mdast"
import { visit } from "unist-util-visit"
import { parseInlineProperties } from "../parser.ts"
import { nodeToText } from "../parser.ts"

export function kmInlinePropTransform(tree: Root): void {
  visit(tree, (node, _index, parent) => {
    // Only process paragraphs
    if (node.type !== "paragraph") return

    const text = nodeToText(node as any)
    const parsed = parseInlineProperties(text)

    // Skip if no properties found
    if (Object.keys(parsed.props).length === 0) return

    // Store on the paragraph's data
    node.data = node.data || {}
    node.data.props = parsed.props
    node.data.propsRaw = parsed.propsRaw
    node.data.cleanText = parsed.cleanText

    // If this paragraph is inside a listItem, hoist to the listItem too
    // (only for the FIRST paragraph in the list item)
    if (parent?.type === "listItem") {
      const listItemChildren = (parent as any).children
      const firstPara = listItemChildren?.find((c: any) => c.type === "paragraph")
      if (firstPara === node) {
        parent.data = parent.data || {}
        parent.data.props = parsed.props
        parent.data.propsRaw = parsed.propsRaw
        parent.data.cleanText = parsed.cleanText
      }
    }
  })
}
