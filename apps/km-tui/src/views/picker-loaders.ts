/**
 * Picker Loader Functions
 *
 * Each loader function produces PickerOption[] from the repo for a specific
 * picker type (project, tag, assignee). Used with the generic Picker component.
 */
import { KNode } from "@km/core"
import type { Repo } from "../repo-context.tsx"
import { getNodeDisplayName } from "../state.ts"
import { getParentName, extractTags } from "./search-utils.ts"
import type { PickerOption } from "./ItemPicker.tsx"

// =============================================================================
// Helpers
// =============================================================================

/**
 * Get project path from a node (folder/file ancestors)
 */
function getProjectPath(
  node: KNode,
  getNode: (id: string) => KNode | null,
  displayName: (node: KNode) => string,
): string {
  const parts: string[] = []
  let current: KNode | null = node

  while (current) {
    if (
      KNode.isOutline(current) &&
      (current.fstype === "folder" || current.fstype === "file" || current.fstype === "mdfile")
    ) {
      parts.unshift(displayName(current))
    }
    current = current.parent_id ? (getNode(current.parent_id) ?? null) : null
  }

  return parts.join(" / ")
}

// =============================================================================
// Project loader (existing behavior, extracted from ItemPicker)
// =============================================================================

export function loadProjectOptions(repo: Repo, recentIds: string[]): PickerOption[] {
  const allNodes = repo.rawQuery<KNode>("SELECT * FROM nodes")
  const options: PickerOption[] = []
  const recentSet = new Set(recentIds)
  const displayName = (node: KNode) => getNodeDisplayName(repo, node)

  for (const node of allNodes) {
    // Only show outline items (sections, files, folders) as valid targets
    if (KNode.isOutline(node)) {
      const title = displayName(node)
      const parentContext = getParentName(node, repo.getNode.bind(repo), displayName)
      const path = getProjectPath(node, repo.getNode.bind(repo), displayName)
      options.push({
        node,
        title,
        parentContext,
        path: path || title,
        isRecent: recentSet.has(node.id),
      })
    }
  }

  return options
}

// =============================================================================
// Tag loader — distinct #tags extracted from node content
// =============================================================================

export function loadTagOptions(repo: Repo, recentIds: string[]): PickerOption[] {
  const allNodes = repo.rawQuery<KNode>("SELECT * FROM nodes")
  const tagMap = new Map<string, KNode>() // tag name -> first node containing it
  const recentSet = new Set(recentIds)

  for (const node of allNodes) {
    const tags = extractTags(node.content)
    for (const tag of tags) {
      if (!tagMap.has(tag)) {
        tagMap.set(tag, node)
      }
    }
  }

  const options: PickerOption[] = []
  for (const [tag, sourceNode] of tagMap) {
    options.push({
      node: sourceNode,
      title: `#${tag}`,
      parentContext: null,
      path: `#${tag}`,
      isRecent: recentSet.has(tag),
    })
  }

  return options
}

// =============================================================================
// Assignee loader — distinct assigned_to values
// =============================================================================

export function loadAssigneeOptions(repo: Repo, recentIds: string[]): PickerOption[] {
  const allNodes = repo.rawQuery<KNode>("SELECT * FROM nodes")
  const assigneeMap = new Map<string, KNode>() // assignee name -> first node assigned to them
  const recentSet = new Set(recentIds)

  for (const node of allNodes) {
    if (node.assigned_to) {
      if (!assigneeMap.has(node.assigned_to)) {
        assigneeMap.set(node.assigned_to, node)
      }
    }
  }

  // Also extract @mentions from content as potential assignees
  for (const node of allNodes) {
    if (node.content) {
      const mentionRegex = /@([\p{L}\p{N}_/.-]+)/gu
      let match
      while ((match = mentionRegex.exec(node.content)) !== null) {
        const name = match[1]
        if (name && !assigneeMap.has(name)) {
          assigneeMap.set(name, node)
        }
      }
    }
  }

  const options: PickerOption[] = []
  for (const [assignee, sourceNode] of assigneeMap) {
    options.push({
      node: sourceNode,
      title: `@${assignee}`,
      parentContext: null,
      path: `@${assignee}`,
      isRecent: recentSet.has(assignee),
    })
  }

  return options
}
