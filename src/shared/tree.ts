/**
 * Tree Utilities
 *
 * Shared utilities for tree display, node unification, and type indicators.
 * Used by board TUI, tasks CLI, and any other tree-based views.
 */

import type { Node } from "../node/types.ts";
import { getChildren } from "../node/db.ts";

/**
 * Get display name for a node (content, filename, or slug)
 */
export function getNodeDisplayName(node: Node): string {
  if (node.data?.name) {
    return node.data.name as string;
  }
  if (node.content) {
    return node.content.split("\n")[0].slice(0, 50);
  }
  if (node.fs_path) {
    return node.fs_path.split("/").pop() || node.id.slice(0, 8);
  }
  return node.id.slice(0, 8);
}

/**
 * Get type indicator for a node type
 * - folder: /
 * - file: .md
 * - section: #
 */
export function getTypeIndicator(type: string): string {
  switch (type) {
    case "folder": return "/";
    case "file": return ".md";
    case "section": return "#";
    default: return "";
  }
}

/**
 * Normalize a name for comparison
 * - Removes # prefixes from sections
 * - Removes .md extension
 * - Treats underscores and hyphens as spaces
 * - Lowercases everything
 */
export function normalizeName(name: string): string {
  return name
    .replace(/^#+\s*/, "")        // Remove leading # from sections
    .replace(/\.md$/i, "")        // Remove .md extension
    .replace(/[-_]/g, " ")        // Treat - and _ as spaces
    .replace(/[^\w\s]/g, "")      // Remove special chars
    .replace(/\s+/g, " ")         // Collapse whitespace
    .trim()
    .toLowerCase();
}

/**
 * Check if two names are substantially the same
 */
export function namesAreSimilar(a: string, b: string): boolean {
  return normalizeName(a) === normalizeName(b);
}

/**
 * Build collapsed type suffix for unified nodes
 *
 * When a folder, file, and section all share the same name (after normalization),
 * they represent the same conceptual entity. Instead of showing each level,
 * we show one entry with type indicators: "Project Name / .md #"
 *
 * Returns empty string if no unification (single type only)
 */
export function getCollapsedTypeSuffix(node: Node): string {
  const indicators: string[] = [];

  // Add this node's type indicator
  const thisIndicator = getTypeIndicator(node.type);
  if (thisIndicator) {
    indicators.push(thisIndicator);
  }

  // Follow children with matching normalized name
  const nodeName = normalizeName(getNodeDisplayName(node));
  let current: Node | undefined = node;

  while (current) {
    const children = getChildren(current.id);
    // Find a child with the same normalized name
    const matchingChild = children.find(c => normalizeName(getNodeDisplayName(c)) === nodeName);
    if (!matchingChild) break;

    const childIndicator = getTypeIndicator(matchingChild.type);
    if (childIndicator) {
      indicators.push(childIndicator);
    }
    current = matchingChild;
  }

  // If only one indicator (just the node itself), don't show suffix
  if (indicators.length <= 1) return "";

  return indicators.join(" ");
}

/**
 * Result of collapsing ancestors - includes both the nodes and their type suffixes
 */
export interface CollapsedAncestor {
  node: Node;
  typeSuffix: string;  // e.g., "/ .md" if folder and file were unified
}

/**
 * Filter ancestors to remove redundant levels where name matches parent/child.
 * Returns simplified nodes with type suffixes showing what was collapsed.
 *
 * Example: Given path [projects/, projects.md, # Projects, ## Subtask]
 * Returns: [{node: projects/, suffix: "/ .md #"}, {node: ## Subtask, suffix: ""}]
 */
export function collapseRedundantAncestors(ancestors: Node[]): Node[] {
  return collapseAncestorsWithTypes(ancestors).map(ca => ca.node);
}

/**
 * Collapse ancestors and return type suffix information
 */
export function collapseAncestorsWithTypes(ancestors: Node[]): CollapsedAncestor[] {
  if (ancestors.length === 0) return [];

  const result: CollapsedAncestor[] = [];
  let i = 0;

  while (i < ancestors.length) {
    const current = ancestors[i]!;
    const currentName = normalizeName(getNodeDisplayName(current));

    // Collect all consecutive ancestors with the same normalized name
    const collapsedTypes: string[] = [];
    let j = i;
    while (j < ancestors.length) {
      const candidate = ancestors[j]!;
      const candidateName = normalizeName(getNodeDisplayName(candidate));
      if (candidateName !== currentName) break;

      const indicator = getTypeIndicator(candidate.type);
      if (indicator) {
        collapsedTypes.push(indicator);
      }
      j++;
    }

    // If we collapsed multiple items, the LAST one is kept (deepest in hierarchy)
    // and we show all the types as a suffix
    const keptNode = ancestors[j - 1]!;
    const typeSuffix = collapsedTypes.length > 1 ? collapsedTypes.join(" ") : "";

    result.push({ node: keptNode, typeSuffix });
    i = j;
  }

  return result;
}
