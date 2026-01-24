/**
 * Body Content Utilities
 *
 * Body = leading non-section content (paragraphs, code, quotes, tasks, etc.)
 * that appears before any structural children (sections, files, folders).
 *
 * These utilities support the "virtual body" pattern where body content
 * is grouped at display time for rendering as virtual columns/cards.
 */

import type { TNode } from "./types.ts";

/**
 * Node types that create structural hierarchy (columns, cards, subitems).
 * Everything else is considered "body content" when it appears before these.
 */
const STRUCTURAL_TYPES = new Set(["section", "file", "folder"]);

/**
 * Result of extracting body content from children.
 */
export interface BodyExtraction<T extends { type: string }> {
  /** Leading non-structural content (before first section/file/folder) */
  body: T[];
  /** Structural children (sections, files, folders) */
  items: T[];
}

/**
 * Extract body content from a node's children.
 *
 * Body = all children before the first structural child (section/file/folder).
 * Items = all structural children.
 *
 * Content appearing AFTER structural children is included in body
 * (we assume non-structural content comes first by convention).
 *
 * @example
 * ```typescript
 * const children = [paragraph, code, section1, section2];
 * const { body, items } = extractBody(children);
 * // body = [paragraph, code]
 * // items = [section1, section2]
 * ```
 */
export function extractBody<T extends { type: string }>(
  children: T[],
): BodyExtraction<T> {
  const firstStructuralIdx = children.findIndex((c) =>
    STRUCTURAL_TYPES.has(c.type),
  );

  if (firstStructuralIdx === -1) {
    // No structural children - all content is body
    return { body: children, items: [] };
  }

  if (firstStructuralIdx === 0) {
    // No leading body content
    return { body: [], items: children };
  }

  return {
    body: children.slice(0, firstStructuralIdx),
    items: children.slice(firstStructuralIdx),
  };
}

/**
 * Check if children array has body content (non-structural before structural).
 */
export function hasBody<T extends { type: string }>(children: T[]): boolean {
  if (children.length === 0) return false;
  // Has body if first child is not structural
  return !STRUCTURAL_TYPES.has(children[0].type);
}

/**
 * Check if a node type is structural (creates hierarchy) vs body content.
 */
export function isStructuralType(type: string): boolean {
  return STRUCTURAL_TYPES.has(type);
}

/**
 * Check if a node type is body content (non-structural).
 */
export function isBodyType(type: string): boolean {
  return !STRUCTURAL_TYPES.has(type);
}
