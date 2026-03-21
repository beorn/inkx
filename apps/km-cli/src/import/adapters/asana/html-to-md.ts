/**
 * Convert Asana HTML notes to clean markdown using mdast.
 *
 * Pipeline: HTML → hast (HTML AST) → mdast (markdown AST) → markdown string
 *
 * Uses mdast for full AST control and clean output.
 */
import { fromHtml } from "hast-util-from-html"
import { toMdast } from "hast-util-to-mdast"
import { toMarkdown } from "mdast-util-to-markdown"
import { gfmToMarkdown } from "mdast-util-gfm"
import type { Nodes as MdastNode } from "mdast"

/**
 * Convert Asana html_notes to clean markdown.
 *
 * Handles Asana-specific quirks:
 * - Bare \n treated as line breaks (Asana convention, not HTML spec)
 * - Headings preserved (rebased to correct depth during convert phase)
 * - Clean list bullets (- not *)
 * - No escaped underscores in URLs
 */
export function htmlToMarkdown(html: string): string {
  // Step 1: Preprocess Asana HTML quirks
  const preprocessed = preprocessAsanaHtml(html)

  // Step 2: Parse HTML → hast
  const hast = fromHtml(preprocessed, { fragment: true })

  // Step 3: Convert hast → mdast
  const mdast = toMdast(hast)

  // Step 4: Transform mdast (headings → bold, cleanup)
  transformMdast(mdast)

  // Step 5: Serialize mdast → markdown
  const md = toMarkdown(mdast, {
    bullet: "-",
    bulletOther: "+",
    emphasis: "_",
    strong: "*",
    rule: "-",
    listItemIndent: "one",
    extensions: [gfmToMarkdown()],
  })

  return md.trim()
}

/**
 * Preprocess Asana html_notes before parsing.
 * Asana uses bare \n for line breaks in html_notes, but HTML spec treats \n as
 * insignificant whitespace. Single \n → <br> (hard line break).
 * Multiple consecutive \n or <br> → paragraph break (not stacked hard breaks).
 */
function preprocessAsanaHtml(html: string): string {
  let result = html.replace(/\n/g, "<br>\n")
  // Remove <br> between tags (structural whitespace, e.g. </li>\n<li>)
  result = result.replace(/><br>\n</g, ">\n<")
  // Collapse 2+ consecutive <br> into paragraph break (not stacked hard breaks)
  result = result.replace(/(<br>\s*){2,}/g, "</p><p>")
  return result
}

/**
 * Walk mdast tree and apply transformations:
 * - `delete` nodes → unwrapped to plain text (no GFM extension)
 * Headings are preserved — they get rebased to proper depth during the convert phase.
 */
function transformMdast(node: MdastNode): void {
  if (!("children" in node) || !Array.isArray(node.children)) return

  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i]!
    // Unwrap <del>/<s> nodes — mdast-util-to-markdown can't serialize them without GFM extension
    if (child.type === "delete" && "children" in child) {
      node.children.splice(i, 1, ...child.children)
      i-- // re-check at same index since we spliced
      continue
    }
    transformMdast(child)
  }
}
