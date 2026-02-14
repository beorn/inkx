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

/**
 * Check if children array has body content (non-outline before outline items).
 */
export function hasBody<T extends { type: string }>(children: T[]): boolean {
  const first = children[0]
  if (!first) return false
  // Has body if first child is not an outline item
  return !isOutline(first.type)
}

/**
 * Check if a node type is structural/outline (oi — creates hierarchy).
 */
export function isStructuralType(type: string): boolean {
  return isOutline(type)
}

/**
 * Check if a node type is body content (not an outline item).
 */
export function isBodyType(type: string): boolean {
  return !isOutline(type)
}
