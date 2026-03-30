/**
 * Task Query Helpers
 *
 * Functions for finding and querying tasks - now accept Repo parameter.
 */

import type { Repo } from "@km/storage"
import { normalizeName } from "@km/core"
import { collapseAncestorsWithTypes, type CollapsedAncestor } from "@km/tree"
import type { KNode } from "@km/core"
import { getNodeDisplayName as getNodeDisplayNameWithRepo } from "./formatters.ts"

/**
 * Find a node by path or ID prefix/suffix
 * Returns the node if found, null otherwise
 */
export function findNodeByPathOrId(repo: Repo, pathOrId: string): KNode | null {
  // Try ID match via resolveNode (handles prefixes)
  const node = repo.resolveNode(pathOrId)
  if (node) return node

  // Try path match with repo path prefix (user may provide relative path)
  // Check if it looks like a relative path
  if (!pathOrId.startsWith("/")) {
    const cwd = process.cwd()
    const fullPath = `${cwd}/${pathOrId}`
    // Try resolving the full path
    const byFullPath = repo.resolveNode(fullPath)
    if (byFullPath) return byFullPath
  }

  return null
}

/**
 * Get all tasks under a root node (recursive)
 */
export function getTasksUnderNode(repo: Repo, nodeId: string): KNode[] {
  const subtree = repo.getSubtree(nodeId)
  return subtree.filter((n) => n.task_marker !== undefined || n.task_status !== undefined)
}

/**
 * Task with computed ancestor data for display
 */
export interface TaskWithAncestors {
  task: KNode
  collapsedAncestors: CollapsedAncestor[] // Collapsed with type suffixes
  ancestorKeys: string[] // For sorting/grouping by normalized name
}

/**
 * Get a stable key for a collapsed ancestor (for grouping)
 * Uses normalized name so similar names group together
 */
function getAncestorKey(repo: Repo, ca: CollapsedAncestor): string {
  return normalizeName(getNodeDisplayNameWithRepo(repo, ca.node))
}

/**
 * Build task tree data (ancestors, keys) for a list of tasks
 */
export function buildTaskTree(repo: Repo, tasks: KNode[]): TaskWithAncestors[] {
  return tasks.map((task) => {
    const rawAncestors = repo.getAncestors(task.id)
    const collapsedAncestors = collapseAncestorsWithTypes(rawAncestors)
    return {
      task,
      collapsedAncestors,
      ancestorKeys: collapsedAncestors.map((ca) => getAncestorKey(repo, ca)),
    }
  })
}

/**
 * Sort tasks so those with shared paths are adjacent
 */
export function sortByPath(tasksWithAncestors: TaskWithAncestors[]): TaskWithAncestors[] {
  return tasksWithAncestors.sort((a, b) => {
    // Compare ancestor paths by keys (fs_path/slug/content), not IDs
    const minLen = Math.min(a.ancestorKeys.length, b.ancestorKeys.length)
    for (let i = 0; i < minLen; i++) {
      const aKey = a.ancestorKeys[i] ?? ""
      const bKey = b.ancestorKeys[i] ?? ""
      if (aKey < bKey) return -1
      if (aKey > bKey) return 1
    }
    // Shorter paths come first
    return a.ancestorKeys.length - b.ancestorKeys.length
  })
}

/**
 * Check if a segment (folder name, filename, section title) matches the filter
 * Default: segment starts with filter (case-insensitive)
 * With *filter*: contains filter anywhere
 */
function segmentMatches(segment: string, filter: string, mode: "prefix" | "contains"): boolean {
  const segmentLower = segment.toLowerCase()
  const filterLower = filter.toLowerCase()

  if (mode === "contains") {
    return segmentLower.includes(filterLower)
  }
  // prefix mode: segment starts with filter
  return segmentLower.startsWith(filterLower)
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
    return node.fs_path.split("/").pop() ?? null
  }
  if (node.content) {
    return node.content
  }
  if (node.name) {
    return node.name
  }
  return null
}

/**
 * Check if a task's path matches the filter
 *
 * Matching modes:
 * - "projects"    -> matches path segments that START with "projects" (default)
 * - "*projects*"  -> matches path segments that CONTAIN "projects" (explicit contains)
 */
export function taskPathMatches(repo: Repo, task: KNode, filter: string): boolean {
  // Determine matching mode based on filter syntax
  let mode: "prefix" | "contains" = "prefix"
  let cleanFilter = filter

  if (filter.startsWith("*") && filter.endsWith("*") && filter.length > 2) {
    // *foo* means contains
    mode = "contains"
    cleanFilter = filter.slice(1, -1)
  } else if (filter.includes("*")) {
    // Has wildcard but not wrapped - treat as contains for flexibility
    mode = "contains"
    cleanFilter = filter.replace(/\*/g, "")
  }

  // Check task content
  const taskName = getNodeSegmentName(task)
  if (taskName && segmentMatches(taskName, cleanFilter, mode)) {
    return true
  }

  // Check ancestors for path match
  const ancestors = repo.getAncestors(task.id)
  for (const ancestor of ancestors) {
    const ancestorName = getNodeSegmentName(ancestor)
    if (ancestorName && segmentMatches(ancestorName, cleanFilter, mode)) {
      return true
    }
  }

  return false
}

/**
 * Check if a string looks like a query (vs a path or ID)
 * Query indicators: starts with @, #, +, -, contains :, or is a known date shortcut
 */
export function looksLikeQuery(str: string): boolean {
  // Reference filters
  if (/^[@#+-]/.test(str)) return true
  // Field:value filters
  if (/[a-z]+:/.test(str)) return true
  // Path patterns (these ARE queries, not just paths)
  if (/\*\*$/.test(str)) return true
  // Quoted phrases
  if (/^".*"$/.test(str)) return true
  return false
}
