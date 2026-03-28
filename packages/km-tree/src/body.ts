/**
 * Body Content Utilities
 *
 * Body = leading non-outline content (blocks, list items) that appears
 * before any outline items (type:"h", item:true).
 *
 * These utilities support the "virtual body" pattern where body content
 * is grouped at display time for rendering as virtual columns/cards.
 */

import { KNode } from "@km/core"

/**
 * Result of extracting body content from children.
 */
export interface BodyExtraction<T extends { type: string; item?: boolean }> {
  /** Leading non-outline content (before first outline item) */
  body: T[]
  /** Outline item children */
  items: T[]
}

/**
 * Options for database-accelerated body extraction.
 * When provided, body children come from the pre-fetched array
 * (e.g. from getBodyChildren query) instead of in-memory filtering.
 */
export interface ExtractBodyDbOpts<T extends { type: string; item?: boolean }> {
  /** Pre-fetched body children (block-type nodes from DB query) */
  bodyChildren: T[]
}

/**
 * Extract body content from a node's children.
 *
 * Body = all children before the first outline item.
 * Items = all outline item children.
 *
 * Content appearing AFTER outline items is included in body
 * (we assume non-outline content comes first by convention).
 *
 * When `dbOpts.bodyChildren` is provided, those are used directly as the body
 * instead of scanning the full children array. This enables callers to use
 * targeted SQL queries (e.g. getBodyChildren) for efficiency.
 *
 * @example
 * ```typescript
 * // In-memory (default)
 * const children = [paragraph, code, section1, section2];
 * const { body, items } = extractBody(children);
 * // body = [paragraph, code], items = [section1, section2]
 *
 * // DB-accelerated (body pre-fetched via getBodyChildren query)
 * const bodyNodes = getBodyChildren(db, parentId);
 * const { body, items } = extractBody(children, { bodyChildren: bodyNodes });
 * // body = bodyNodes, items = [section1, section2]
 * ```
 */
export function extractBody<T extends { type: string; item?: boolean }>(
  children: T[],
  dbOpts?: ExtractBodyDbOpts<T>,
): BodyExtraction<T> {
  // Items are always derived from the children array (outline nodes)
  const firstStructuralIdx = children.findIndex((c) => KNode.isOutline(c))
  const items = firstStructuralIdx === -1 ? [] : children.slice(firstStructuralIdx)

  // When pre-fetched body children are provided, use them directly
  if (dbOpts) {
    return { body: dbOpts.bodyChildren, items }
  }

  // In-memory fallback: body = everything before the first outline item
  if (firstStructuralIdx === -1) {
    return { body: children, items: [] }
  }

  if (firstStructuralIdx === 0) {
    return { body: [], items }
  }

  return {
    body: children.slice(0, firstStructuralIdx),
    items,
  }
}
