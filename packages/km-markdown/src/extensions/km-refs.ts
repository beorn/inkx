/* oxlint-disable typescript-eslint/no-unsafe-call, typescript-eslint/no-unsafe-member-access, typescript-eslint/no-unsafe-assignment, typescript-eslint/no-unsafe-argument, typescript-eslint/no-explicit-any -- mdast tree traversal uses untyped node children */

import type { Root } from "mdast"
import { visit } from "unist-util-visit"
import { extractAllRefs, nodeToText } from "../parser.ts"

export function kmRefsTransform(tree: Root): void {
  visit(tree, (node, _index, parent) => {
    // Process paragraphs and headings
    if (node.type !== "paragraph" && node.type !== "heading") return

    const text = nodeToText(node as any)
    const { tags, mentions, projects } = extractAllRefs(text)

    // Skip if no refs found
    if (tags.length === 0 && mentions.length === 0 && projects.length === 0)
      {return}

    // Store on the node's data
    node.data = node.data || {}
    if (tags.length > 0) node.data.tags = tags
    if (mentions.length > 0) node.data.mentions = mentions
    if (projects.length > 0) node.data.projects = projects

    // If this is a paragraph inside a listItem, hoist to the listItem too
    // (only for the FIRST paragraph in the list item)
    if (parent?.type === "listItem" && node.type === "paragraph") {
      const listItemChildren = (parent as any).children
      const firstPara = listItemChildren?.find(
        (c: any) => c.type === "paragraph",
      )
      if (firstPara === node) {
        parent.data = parent.data || {}
        if (tags.length > 0) parent.data.tags = tags
        if (mentions.length > 0) parent.data.mentions = mentions
        if (projects.length > 0) parent.data.projects = projects
      }
    }
  })
}
