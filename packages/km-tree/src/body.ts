/**
 * Body Content Utilities
 *
 * Body = leading non-outline content (blocks, list items) that appears
 * before any outline items (oi nodes).
 *
 * These utilities support the "virtual body" pattern where body content
 * is grouped at display time for rendering as virtual columns/cards.
 */

import { isOutline } from "@km/core"

/**
 * Result of extracting body content from children.
 */
export interface BodyExtraction<T extends { type: string }> {
  /** Leading non-outline content (before first oi node) */
  body: T[]
  /** Outline item children (oi nodes) */
  items: T[]
}

/**
 * Extract body content from a node's children.
 *
 * Body = all children before the first outline item (oi).
 * Items = all outline item children.
 *
 * Content appearing AFTER outline items is included in body
 * (we assume non-outline content comes first by convention).
 *
 * @example
 * ```typescript
 * const children = [paragraph, code, section1, section2];
 * const { body, items } = extractBody(children);
 * // body = [paragraph, code]
 * // items = [section1, section2]
 * ```
 */
export function extractBody<T extends { type: string }>(children: T[]): BodyExtraction<T> {
  const firstStructuralIdx = children.findIndex((c) => isOutline(c.type))

  if (firstStructuralIdx === -1) {
    // No structural children - all content is body
    return { body: children, items: [] }
  }

  if (firstStructuralIdx === 0) {
    // No leading body content
    return { body: [], items: children }
  }

  return {
    body: children.slice(0, firstStructuralIdx),
    items: children.slice(firstStructuralIdx),
  }
}

