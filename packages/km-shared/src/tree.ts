/**
 * Tree Utilities
 *
 * Shared utilities for tree display, node unification, and type indicators.
 * Used by board TUI, tasks CLI, and any other tree-based views.
 */

import type { Node } from "@km/core";
import { getChildren, getNode } from "@km/store";

/**
 * Get display name for a node
 *
 * Priority:
 * 1. frontmatter title (data.name)
 * 2. node.title (pre-parsed clean title, for sections)
 * 3. For files: first section's title or content (H1 heading)
 * 4. node.content (first line, for tasks)
 * 5. filename (without .md extension)
 * 6. short ID
 */
export function getNodeDisplayName(node: Node): string {
  // 1. Frontmatter title takes priority
  if (node.data?.name) {
    return node.data.name as string;
  }

  // 2. Use pre-parsed title (for sections, already has rules stripped)
  // Check node.title first (set during parsing), then data.title (persisted to DB)
  if (node.title) {
    return node.title.slice(0, 50);
  }
  if (node.data?.title) {
    return (node.data.title as string).slice(0, 50);
  }

  // 3. For file nodes, use first section's title or content (H1 heading)
  if (node.type === "file") {
    const children = getChildren(node.id);
    const firstSection = children.find((c) => c.type === "section");
    if (firstSection) {
      // Use pre-parsed title if available (node.title or data.title)
      if (firstSection.title) {
        return firstSection.title.slice(0, 50);
      }
      if (firstSection.data?.title) {
        return (firstSection.data.title as string).slice(0, 50);
      }
      // Fallback: strip rules from content
      if (firstSection.content) {
        const heading = firstSection.content.split("\n")[0] ?? "";
        const cleanHeading = heading
          .replace(
            /\s+(add|sync|collapse|limit|default)=("[^"]*"|'[^']*'|\S+)/g,
            "",
          )
          .trim();
        if (cleanHeading) {
          return cleanHeading.slice(0, 50);
        }
      }
    }
  }

  // 4. Use node content (for tasks, etc.)
  if (node.content) {
    return node.content.split("\n")[0].slice(0, 50);
  }

  // 5. Use filename (strip .md extension)
  if (node.fs_path) {
    const filename = node.fs_path.split("/").pop() || "";
    return filename.replace(/\.md$/, "") || node.id.slice(0, 8);
  }

  // 6. Fallback to short ID
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
    case "folder":
      return "/";
    case "file":
      return ".md";
    case "section":
      return "#";
    default:
      return "";
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
    .replace(/^#+\s*/, "") // Remove leading # from sections
    .replace(/\.md$/i, "") // Remove .md extension
    .replace(/[-_]/g, " ") // Treat - and _ as spaces
    .replace(/[^\w\s]/g, "") // Remove special chars
    .replace(/\s+/g, " ") // Collapse whitespace
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
    const matchingChild = children.find(
      (c) => normalizeName(getNodeDisplayName(c)) === nodeName,
    );
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
  typeSuffix: string; // e.g., "/ .md" if folder and file were unified
}

/**
 * Filter ancestors to remove redundant levels where name matches parent/child.
 * Returns simplified nodes with type suffixes showing what was collapsed.
 *
 * Example: Given path [projects/, projects.md, # Projects, ## Subtask]
 * Returns: [{node: projects/, suffix: "/ .md #"}, {node: ## Subtask, suffix: ""}]
 */
export function collapseRedundantAncestors(ancestors: Node[]): Node[] {
  return collapseAncestorsWithTypes(ancestors).map((ca) => ca.node);
}

/**
 * Collapse ancestors and return type suffix information
 */
export function collapseAncestorsWithTypes(
  ancestors: Node[],
): CollapsedAncestor[] {
  if (ancestors.length === 0) return [];

  const result: CollapsedAncestor[] = [];
  let i = 0;

  while (i < ancestors.length) {
    const current = ancestors[i];
    if (!current) break;
    const currentName = normalizeName(getNodeDisplayName(current));

    // Collect all consecutive ancestors with the same normalized name
    const collapsedTypes: string[] = [];
    let j = i;
    while (j < ancestors.length) {
      const candidate = ancestors[j];
      if (!candidate) break;
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
    const keptNode = ancestors[j - 1];
    if (!keptNode) break;
    const typeSuffix =
      collapsedTypes.length > 1 ? collapsedTypes.join(" ") : "";

    result.push({ node: keptNode, typeSuffix });
    i = j;
  }

  return result;
}

/**
 * Get parent context for a node (for board card display)
 *
 * Walks up the parent chain to find meaningful context:
 * - For symlinked nodes (transclusions), follows symlink_to to get original context
 * - Skips board columns/sections (immediate parent in board view)
 * - Returns the containing file's display name
 *
 * This is useful for showing where a task "belongs" when displayed on a board.
 * For example, a task from "projects/green-card.md" would return "Green card".
 *
 * @param node The node to get context for
 * @param skipParentId Optional parent ID to skip (e.g., current column)
 * @returns The parent context string, or null if at root or no meaningful context
 */
export function getParentContext(
  node: Node,
  skipParentId?: string | null,
): string | null {
  // For symlinked nodes (transclusions), follow the symlink to get original context
  // This allows board items to show their original location even when displayed on a board
  let targetNode = node;
  if (node.symlink_to) {
    const originalNode = getNode(node.symlink_to);
    if (originalNode) {
      targetNode = originalNode;
    }
  }

  if (!targetNode.parent_id) return null;

  let currentId: string | null = targetNode.parent_id;

  // Walk up the parent chain
  while (currentId) {
    // Skip the specified parent (e.g., board column)
    if (skipParentId && currentId === skipParentId) {
      const parent = getNode(currentId);
      currentId = parent?.parent_id ?? null;
      continue;
    }

    const parent = getNode(currentId);
    if (!parent) break;

    // If we find a file node, return its display name
    if (parent.type === "file") {
      return getNodeDisplayName(parent);
    }

    // If we find a meaningful section (not a board column), return it
    // Board columns typically have rules like add=, sync=, default=
    if (parent.type === "section" && !parent.rules) {
      return getNodeDisplayName(parent);
    }

    currentId = parent.parent_id;
  }

  return null;
}
