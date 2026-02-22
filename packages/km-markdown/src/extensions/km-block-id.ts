/* oxlint-disable typescript-eslint/no-unsafe-call, typescript-eslint/no-unsafe-member-access, typescript-eslint/no-unsafe-assignment, typescript-eslint/no-explicit-any -- mdast tree traversal uses untyped node children */

import type { Root } from "mdast"
import { visit } from "unist-util-visit"

const BLOCK_ID_REGEX = / \^([a-zA-Z0-9_-]+)$/

export function kmBlockIdTransform(tree: Root): void {
  // Visit headings, paragraphs, and listItems
  visit(tree, (node) => {
    if (node.type === "heading" || node.type === "paragraph") {
      // Find the last text child
      const children = (node as any).children
      if (!children || children.length === 0) return
      const last = children[children.length - 1]
      if (last?.type !== "text") return

      const match = last.value.match(BLOCK_ID_REGEX)
      if (match) {
        // Strip the block ID from text
        last.value = last.value.slice(0, -match[0].length)
        // Store on the node's data
        node.data = node.data || {}
        node.data.blockId = match[1]
      }
    }

    if (node.type === "listItem") {
      // For list items, check the first paragraph child
      const children = (node as any).children
      if (!children || children.length === 0) return
      const firstPara = children.find((c: any) => c.type === "paragraph")
      if (!firstPara) return

      const paraChildren = firstPara.children
      if (!paraChildren || paraChildren.length === 0) return
      const last = paraChildren[paraChildren.length - 1]
      if (last?.type !== "text") return

      const match = last.value.match(BLOCK_ID_REGEX)
      if (match) {
        // Strip from paragraph text
        last.value = last.value.slice(0, -match[0].length)
        // Store on the PARAGRAPH's data (the node that contains the text)
        firstPara.data = firstPara.data || {}
        firstPara.data.blockId = match[1]
        // Also hoist to the list item's data
        node.data = node.data || {}
        node.data.blockId = match[1]
      }
    }
  })
}
