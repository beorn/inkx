/**
 * Slate Schema for km
 *
 * Defines the document structure for per-item Slate editing.
 * Each km node gets its own Slate editor with a flat list of paragraphs.
 *
 * Slate owns: content within one item (paragraphs, inline formatting)
 * km owns: tree between items (parent_id, parent_idx, move/reparent)
 */

import type { BaseEditor, Descendant } from "slate"
import type { HistoryEditor } from "slate-history"

// =============================================================================
// Custom Element Types
// =============================================================================

export interface ParagraphElement {
  type: "paragraph"
  children: FormattedText[]
}

export interface FormattedText {
  text: string
  bold?: true
  italic?: true
  code?: true
  strikethrough?: true
}

export type KmElement = ParagraphElement
export type KmText = FormattedText

// =============================================================================
// Custom Types Declaration
// =============================================================================

/** The km Slate editor type (base + history) */
export type KmEditor = BaseEditor & HistoryEditor

declare module "slate" {
  interface CustomTypes {
    Editor: KmEditor
    Element: KmElement
    Text: KmText
  }
}

// =============================================================================
// Helpers
// =============================================================================

export function createParagraph(text: string): ParagraphElement {
  return { type: "paragraph", children: [{ text }] }
}

export function createEmptyDocument(): Descendant[] {
  return [createParagraph("")]
}

/**
 * Extract plain text from Slate descendants.
 * Joins paragraph texts with newlines.
 */
export function descendantsToText(descendants: Descendant[]): string {
  return descendants
    .map((node) => {
      if ("children" in node) {
        return (node.children as FormattedText[]).map((t) => t.text).join("")
      }
      return (node as FormattedText).text
    })
    .join("\n")
}

/**
 * Convert plain text to Slate descendants.
 * Each line becomes a paragraph.
 */
export function textToDescendants(text: string): Descendant[] {
  if (!text) return createEmptyDocument()
  const lines = text.split("\n")
  return lines.map((line) => createParagraph(line))
}
