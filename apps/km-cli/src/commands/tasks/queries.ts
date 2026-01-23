/**
 * Task Query Helpers
 *
 * Functions for finding and querying tasks.
 */

import {
  getNodeByPath,
  getNodeByIdPrefix,
  getAncestors,
  getTasksUnderNode as storageGetTasksUnderNode,
} from "@km/storage";
import {
  normalizeName,
  collapseAncestorsWithTypes,
  type CollapsedAncestor,
} from "@km/tree";
import type { KNode } from "@km/core";
import { getNodeDisplayName } from "./formatters.ts";

/**
 * Find a node by path or ID prefix/suffix
 * Returns the node if found, null otherwise
 */
export function findNodeByPathOrId(pathOrId: string): KNode | null {
  // Try ID match (exact, prefix, or suffix)
  const node = getNodeByIdPrefix(pathOrId);
  if (node) return node;

  // Try path match (exact)
  const byPath = getNodeByPath(pathOrId);
  if (byPath) return byPath;

  // Try path match with vault path prefix (user may provide relative path)
  // Check if it looks like a relative path
  if (!pathOrId.startsWith("/")) {
    const cwd = process.cwd();
    const fullPath = `${cwd}/${pathOrId}`;
    const byFullPath = getNodeByPath(fullPath);
    if (byFullPath) return byFullPath;
  }

  return null;
}

/**
 * Get all tasks under a root node (recursive)
 * Re-exports from @km/storage for backwards compatibility
 */
export const getTasksUnderNode = storageGetTasksUnderNode;

/**
 * Task with computed ancestor data for display
 */
export interface TaskWithAncestors {
  task: KNode;
  collapsedAncestors: CollapsedAncestor[]; // Collapsed with type suffixes
  ancestorKeys: string[]; // For sorting/grouping by normalized name
}

/**
 * Get a stable key for a collapsed ancestor (for grouping)
 * Uses normalized name so similar names group together
 */
function getAncestorKey(ca: CollapsedAncestor): string {
  return normalizeName(getNodeDisplayName(ca.node));
}

/**
 * Build task tree data (ancestors, keys) for a list of tasks
 */
export function buildTaskTree(tasks: KNode[]): TaskWithAncestors[] {
  return tasks.map((task) => {
    const rawAncestors = getAncestors(task.id);
    const collapsedAncestors = collapseAncestorsWithTypes(rawAncestors);
    return {
      task,
      collapsedAncestors,
      ancestorKeys: collapsedAncestors.map((ca) => getAncestorKey(ca)),
    };
  });
}

/**
 * Sort tasks so those with shared paths are adjacent
 */
export function sortByPath(
  tasksWithAncestors: TaskWithAncestors[],
): TaskWithAncestors[] {
  return tasksWithAncestors.sort((a, b) => {
    // Compare ancestor paths by keys (fs_path/slug/content), not IDs
    const minLen = Math.min(a.ancestorKeys.length, b.ancestorKeys.length);
    for (let i = 0; i < minLen; i++) {
      if (a.ancestorKeys[i] < b.ancestorKeys[i]) return -1;
      if (a.ancestorKeys[i] > b.ancestorKeys[i]) return 1;
    }
    // Shorter paths come first
    return a.ancestorKeys.length - b.ancestorKeys.length;
  });
}

/**
 * Check if a segment (folder name, filename, section title) matches the filter
 * Default: segment starts with filter (case-insensitive)
 * With *filter*: contains filter anywhere
 */
function segmentMatches(
  segment: string,
  filter: string,
  mode: "prefix" | "contains",
): boolean {
  const segmentLower = segment.toLowerCase();
  const filterLower = filter.toLowerCase();

  if (mode === "contains") {
    return segmentLower.includes(filterLower);
  }
  // prefix mode: segment starts with filter
  return segmentLower.startsWith(filterLower);
}

/**
 * Get the "name" part of a node for matching purposes
 * - For folders/files: the last path segment (basename)
 * - For sections: the content (heading text)
 * - For tasks: the content
 */
function getNodeSegmentName(node: KNode): string | null {
  if (node.fs_path) {
    // Get basename from path
    return node.fs_path.split("/").pop() ?? null;
  }
  if (node.content) {
    return node.content;
  }
  if (node.md_slug) {
    return node.md_slug;
  }
  return null;
}

/**
 * Check if a task's path matches the filter
 *
 * Matching modes:
 * - "projects"    -> matches path segments that START with "projects" (default)
 * - "*projects*"  -> matches path segments that CONTAIN "projects" (explicit contains)
 */
export function taskPathMatches(task: KNode, filter: string): boolean {
  // Determine matching mode based on filter syntax
  let mode: "prefix" | "contains" = "prefix";
  let cleanFilter = filter;

  if (filter.startsWith("*") && filter.endsWith("*") && filter.length > 2) {
    // *foo* means contains
    mode = "contains";
    cleanFilter = filter.slice(1, -1);
  } else if (filter.includes("*")) {
    // Has wildcard but not wrapped - treat as contains for flexibility
    mode = "contains";
    cleanFilter = filter.replace(/\*/g, "");
  }

  // Check task content
  const taskName = getNodeSegmentName(task);
  if (taskName && segmentMatches(taskName, cleanFilter, mode)) {
    return true;
  }

  // Check ancestors for path match
  const ancestors = getAncestors(task.id);
  for (const ancestor of ancestors) {
    const ancestorName = getNodeSegmentName(ancestor);
    if (ancestorName && segmentMatches(ancestorName, cleanFilter, mode)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a string looks like a query (vs a path or ID)
 * Query indicators: starts with @, #, +, -, contains :, or is a known date shortcut
 */
export function looksLikeQuery(str: string): boolean {
  // Reference filters
  if (/^[@#+-]/.test(str)) return true;
  // Field:value filters
  if (/[a-z]+:/.test(str)) return true;
  // Path patterns (these ARE queries, not just paths)
  if (/\*\*$/.test(str)) return true;
  // Quoted phrases
  if (/^".*"$/.test(str)) return true;
  return false;
}
