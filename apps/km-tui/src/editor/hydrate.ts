/**
 * Hydration Layer: markdown string <-> Slate Element[]
 *
 * Converts between km's markdown content and Slate's document model.
 * Uses km's existing @km/markdown parser for the markdown -> AST step,
 * then converts AST to Slate elements.
 *
 * For now, handles plain text with paragraph structure.
 * Inline formatting (bold, italic, code) support can be added later
 * by walking the mdast inline nodes.
 */

import type { Descendant } from "slate"
import { getNodeText, setNodeText } from "@km/tree"
import type { KNode } from "@km/core"
import {
  createParagraph,
  createEmptyDocument,
  descendantsToText,
} from "./schema.ts"

// =============================================================================
// Markdown -> Slate (Hydrate)
// =============================================================================

/**
 * Hydrate a km node's content into Slate descendants.
 *
 * Extracts the editable text (via getNodeText which strips task prefix etc.)
 * and converts it into Slate paragraph elements.
 *
 * @param node - The km node to hydrate
 * @returns Slate descendants ready for editor.children
 */
export function hydrateNode(node: KNode): Descendant[] {
  const text = getNodeText(node)
  if (!text) return createEmptyDocument()

  // Split into paragraphs (double newline = paragraph break)
  // Single newlines within a paragraph are preserved as-is
  const paragraphs = text.split(/\n/)

  if (paragraphs.length === 0) return createEmptyDocument()

  return paragraphs.map((p) => createParagraph(p))
}

// =============================================================================
// Slate -> Markdown (Dehydrate)
// =============================================================================

/**
 * Dehydrate Slate descendants back into km node content.
 *
 * Converts Slate elements back to plain text, then wraps it in the
 * appropriate format for the node type (e.g., task checkbox prefix).
 *
 * @param node - The km node (needed for type-specific formatting)
 * @param descendants - Slate editor.children
 * @returns Content string suitable for repo.updateNode(id, { content })
 */
export function dehydrateNode(node: KNode, descendants: Descendant[]): string {
  const text = descendantsToText(descendants)
  return setNodeText(node, text)
}
