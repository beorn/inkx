/* oxlint-disable typescript-eslint/no-unsafe-call, typescript-eslint/no-unsafe-member-access, typescript-eslint/no-unsafe-assignment, typescript-eslint/no-unsafe-argument, typescript-eslint/no-explicit-any -- mdast tree traversal uses untyped node children */

import type { Root } from "mdast"
import { visit } from "unist-util-visit"
import { nodeToText } from "../parser.ts"

const HEADING_TASK_MARK_REGEX = /^\[([  xX/\-!])\]\s*/

export function kmHeadingTaskMarkTransform(tree: Root): void {
  visit(tree, "heading", (node) => {
    const text = nodeToText(node as any)
    const match = text.match(HEADING_TASK_MARK_REGEX)
    if (!match) return

    // Store the inner character (e.g. 'x', ' ', '/', '-', '!')
    node.data = node.data || {}
    node.data.taskMark = match[1]

    // Strip the `[x] ` prefix from the first text child
    const children = (node as any).children
    if (!children || children.length === 0) return
    const first = children[0]
    if (first?.type !== "text") return

    first.value = first.value.slice(match[0].length)
  })
}
