/**
 * Display Name Utilities
 *
 * Utilities for computing display names and comparing node names.
 * Moved from @km/tui-core to @km/tree during architecture restructuring.
 */

import { KNode, extractMetadata, normalizeName, findIndexFile, type ItemData } from "@km/core"
import { PROP_REGEX } from "@km/markdown"

/** Strip inline metadata (key:: value) and block IDs (^id) from display text */
export function stripForDisplay(text: string): string {
  const { clean } = extractMetadata(text)
  return (
    clean
      // Strip "→ ^numericId" and "→ [[^numericId]]" references (Asana recurring task parent refs)
      .replace(/\s*→\s*(?:\[\[)?\^\d+(?:\]\])?/g, "")
      // Strip embed block references ![[^numericId]] (Asana tag file cross-references)
      .replace(/\s*!\[\[\^\d+\]\]/g, "")
      // Strip embed wikilinks ![[target]] and ![[target|alias]] — replace with alias or target name
      .replace(/!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, target: string, alias?: string) => alias ?? target)
      // Strip inline ^numeric-id references (Asana-style 10+ digit IDs) that are NOT inside [[...]]
      .replace(/\^\d{10,}/g, (match, offset: number, str: string) => {
        // Check if this ^ is inside a wikilink by looking for preceding [[ without intervening ]]
        const before = str.slice(0, offset)
        const lastOpen = before.lastIndexOf("[[")
        const lastClose = before.lastIndexOf("]]")
        if (lastOpen > lastClose) return match // inside wikilink, keep it
        return "" // outside wikilink, strip it
      })
      // Strip ^block-id at end of text (alphanumeric/dash block IDs)
      .replace(/\s*\^[\w-]+$/, "")
      // Collapse runs of whitespace to single space
      .replace(/ {2,}/g, " ")
      .trim()
  )
}

/**
 * Lookup function types for dependency injection.
 * These allow tree traversal without importing @km/storage directly.
 */
export type GetChildrenFn = (nodeId: string) => KNode[]
export type GetNodeFn = (nodeId: string) => KNode | null | undefined

/**
 * Strip all key:: value properties from a string (both km.* and bare).
 * Used to produce clean display names from headings.
 */
function stripInlineRules(text: string): string {
  PROP_REGEX.lastIndex = 0
  return text
    .replace(PROP_REGEX, "")
    .replace(/\s*!\[\[\^\d+\]\]/g, "") // Strip embed block references ![[^numericId]]
    .replace(/!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, target: string, alias?: string) => alias ?? target) // Strip embed wikilinks ![[target]] / ![[target|alias]]
    .replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, "$2") // Strip regular wikilinks [[target]] / [[target|display]]
    .replace(/\s+/g, " ")
    .trim()
}

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
 *
 * @param node The node to get display name for
 * @param getChildren Optional function to get children (needed for file nodes to find H1)
 */
export function getNodeDisplayName(node: KNode, getChildren?: GetChildrenFn): string {
  // 1. Frontmatter title takes priority
  if (node.data?.name) {
    return node.data.name as string
  }

  // 2. Use pre-parsed title (for sections, already has rules stripped)
  // node.title comes from the DB title column (reliably synced).
  // data.title is from the DB data JSON blob and may be stale.
  // Only fall back to data.title when node.title is undefined (not just empty).
  if (node.title) {
    return stripInlineRules(node.title)
  }
  if (node.title == null && node.data?.title) {
    return stripInlineRules(node.data.title as string)
  }

  // 3. For file/mdfile nodes, use first section's title or content (H1 heading)
  if (KNode.isOutline(node) && (node.fstype === "file" || node.fstype === "mdfile") && getChildren) {
    const children = getChildren(node.id)
    const firstSection = children.find((c: KNode) => KNode.isOutline(c) && c.fstype === "mdsection")
    if (firstSection) {
      // Use pre-parsed title if available (node.title takes precedence over data.title)
      if (firstSection.title) {
        return stripInlineRules(firstSection.title)
      }
      if (firstSection.title == null && firstSection.data?.title) {
        return stripInlineRules(firstSection.data.title as string)
      }
      // Fallback: strip rules from content
      if (firstSection.content) {
        const heading = firstSection.content.split("\n")[0] ?? ""
        const cleanHeading = stripInlineRules(heading)
        if (cleanHeading) {
          return cleanHeading
        }
      }
    }
  }

  // 4. Use node content (for tasks, etc.) — strip inline metadata and block IDs
  // Check != null (not truthiness) so that content:"" returns "" instead of
  // falling through to the short-ID fallback.  New items start with content:""
  // and should display as blank, not as "(XWJE24KP)".
  if (node.content != null) {
    return stripForDisplay(node.content.split("\n")[0] ?? "")
  }

  // 5. Use filename (strip .md extension)
  // Note: fs_path may be missing for:
  // - In-memory test nodes created without filesystem backing
  // - Dynamically generated/synthetic nodes
  // - Legacy data migration scenarios
  // This is intentional - we fall back to short ID rather than throwing.
  if (node.fs_path) {
    const filename = node.fs_path.split("/").pop() || ""
    return filename.replace(/\.md$/, "") || `(${node.id.slice(-8)})`
  }

  // 6. Fallback to short ID in parentheses (signals "untitled" to rendering layer)
  return `(${node.id.slice(-8)})`
}

/**
 * Check if a node has no meaningful display name (would fall back to ID).
 *
 * Used by rendering layer to apply dim styling for untitled nodes.
 */
export function isNodeUntitled(node: KNode, getChildren?: GetChildrenFn): boolean {
  if (node.data?.name) return false
  if (node.title) return false
  // Only check data.title when node.title is undefined (not just empty "")
  if (node.title == null && node.data?.title) return false
  if (KNode.isOutline(node) && (node.fstype === "file" || node.fstype === "mdfile") && getChildren) {
    const children = getChildren(node.id)
    const firstSection = children.find((c: KNode) => KNode.isOutline(c) && c.fstype === "mdsection")
    if (firstSection?.title || firstSection?.data?.title || firstSection?.content) return false
  }
  if (node.content) return false
  if (node.fs_path) return false
  return true
}

/**
 * Get type indicator for a node's fstype
 * - folder: /
 * - file/mdfile: .md
 * - mdsection: #
 */
export function getTypeIndicator(type: string, fstype?: string, item?: ItemData): string {
  if (!KNode.isOutline({ type, item })) return ""
  switch (fstype) {
    case "folder":
    case "repo":
      return "/"
    case "file":
    case "mdfile":
      return ".md"
    case "mdsection":
      return "#"
    default:
      return ""
  }
}

/**
 * Build collapsed type suffix for unified nodes
 *
 * When a folder, file, and section all share the same name (after normalization),
 * they represent the same conceptual entity. Instead of showing each level,
 * we show one entry with type indicators: "Project Name / .md #"
 *
 * Returns empty string if no unification (single type only)
 *
 * @param node The node to get collapsed type suffix for
 * @param getChildren Function to get children of a node (required for traversal)
 */
export function getCollapsedTypeSuffix(node: KNode, getChildren?: GetChildrenFn): string {
  const indicators: string[] = []

  // Add this node's type indicator
  const thisIndicator = getTypeIndicator(node.type, node.fstype, node.item)
  if (thisIndicator) {
    indicators.push(thisIndicator)
  }

  // Without getChildren, we can't traverse - return just this node's indicator
  if (!getChildren) {
    return ""
  }

  // Follow children with matching normalized name — but skip index files
  // (they're semantically part of the folder, not separate entities)
  const nodeName = normalizeName(getNodeDisplayName(node, getChildren))
  let current: KNode | undefined = node

  while (current) {
    const children: KNode[] = getChildren(current.id)
    // Find a child with the same normalized name
    const matchingChild: KNode | undefined = children.find(
      (c: KNode) => normalizeName(getNodeDisplayName(c, getChildren)) === nodeName,
    )
    if (!matchingChild) break

    // If this is a folder→file collapse where the file is the folder's index file,
    // don't show the type suffix — the index file is absorbed into the folder
    if (current.fstype === "folder" && (matchingChild.fstype === "mdfile" || matchingChild.fstype === "file")) {
      const idx = findIndexFile(current, children)
      if (idx?.id === matchingChild.id) break
    }

    const childIndicator = getTypeIndicator(matchingChild.type, matchingChild.fstype, matchingChild.item)
    if (childIndicator) {
      indicators.push(childIndicator)
    }
    current = matchingChild
  }

  // If only one indicator (just the node itself), don't show suffix
  if (indicators.length <= 1) return ""

  return indicators.join(" ")
}

/**
 * Result of collapsing ancestors - includes both the nodes and their type suffixes
 */
export interface CollapsedAncestor {
  node: KNode
  typeSuffix: string // e.g., "/ .md" if folder and file were unified
}

/**
 * Filter ancestors to remove redundant levels where name matches parent/child.
 * Returns simplified nodes with type suffixes showing what was collapsed.
 *
 * Example: Given path [projects/, projects.md, # Projects, ## Subtask]
 * Returns: [{node: projects/, suffix: "/ .md #"}, {node: ## Subtask, suffix: ""}]
 */
export function collapseRedundantAncestors(ancestors: KNode[]): KNode[] {
  return collapseAncestorsWithTypes(ancestors).map((ca) => ca.node)
}

/**
 * Collapse ancestors and return type suffix information
 */
export function collapseAncestorsWithTypes(ancestors: KNode[]): CollapsedAncestor[] {
  if (ancestors.length === 0) return []

  const result: CollapsedAncestor[] = []
  let i = 0

  while (i < ancestors.length) {
    const current = ancestors[i]
    if (!current) break
    const currentName = normalizeName(getNodeDisplayName(current))

    // Collect all consecutive ancestors with the same normalized name
    const collapsedTypes: string[] = []
    let j = i
    while (j < ancestors.length) {
      const candidate = ancestors[j]
      if (!candidate) break
      const candidateName = normalizeName(getNodeDisplayName(candidate))
      if (candidateName !== currentName) break

      const indicator = getTypeIndicator(candidate.type, (candidate as KNode).fstype, (candidate as KNode).item)
      if (indicator) {
        collapsedTypes.push(indicator)
      }
      j++
    }

    // If we collapsed multiple items, the LAST one is kept (deepest in hierarchy)
    // and we show all the types as a suffix
    const keptNode = ancestors[j - 1]
    if (!keptNode) break
    const typeSuffix = collapsedTypes.length > 1 ? collapsedTypes.join(" ") : ""

    result.push({ node: keptNode, typeSuffix })
    i = j
  }

  return result
}

/**
 * Get parent context for a node (for board card display)
 *
 * Walks up the parent chain to find meaningful context:
 * - For embed nodes (transclusions), follows symlink_to to get original context
 * - Skips board columns/sections (immediate parent in board view)
 * - Returns the containing file's display name
 *
 * This is useful for showing where a task "belongs" when displayed on a board.
 * For example, a task from "projects/green-card.md" would return "Green card".
 *
 * @param node The node to get context for
 * @param skipParentId Optional parent ID to skip (e.g., current column)
 * @param getNode Function to get a node by ID (required for traversal)
 * @returns The parent context string, or null if at root or no meaningful context
 */
export function getParentContext(node: KNode, skipParentId?: string | null, getNode?: GetNodeFn): string | null {
  const result = findParentContextNode(node, skipParentId, getNode)
  return result ? getNodeDisplayName(result) : null
}

/**
 * Extended parent context result with source node metadata.
 * Used for sigil-aware suppression in board views.
 */
export interface ParentContextResult {
  /** Display name of the parent (same as getParentContext return value) */
  displayName: string
  /** The parent node's ID (for navigation links) */
  nodeId: string
  /** The parent node's name (sigil-style, e.g., "@next") if available */
  nodeName: string | undefined
  /** The parent node's fs_path if available */
  fsPath: string | undefined
}

/**
 * Get parent context with source node metadata.
 * Same logic as getParentContext, but returns richer data for sigil-aware suppression.
 */
export function getParentContextEx(
  node: KNode,
  skipParentId?: string | null,
  getNode?: GetNodeFn,
): ParentContextResult | null {
  const parent = findParentContextNode(node, skipParentId, getNode)
  if (!parent) return null
  return {
    displayName: getNodeDisplayName(parent),
    nodeId: parent.id,
    nodeName: parent.name,
    fsPath: parent.fs_path,
  }
}

/**
 * Shared traversal logic for getParentContext and getParentContextEx.
 *
 * Walks up the parent chain to find meaningful context:
 * - For embed nodes (transclusions), follows symlink_to to get original context
 * - Skips board columns/sections (immediate parent in board view)
 * - Returns the containing file/section node
 */
function findParentContextNode(node: KNode, skipParentId?: string | null, getNode?: GetNodeFn): KNode | null {
  if (!getNode) return null

  // For embed nodes (transclusions), follow symlink_to to get original context
  let targetNode = node
  if (node.symlink_to) {
    const originalNode = getNode(node.symlink_to)
    if (originalNode) {
      targetNode = originalNode
    }
  }

  if (!targetNode.parent_id) return null

  let currentId: string | null = targetNode.parent_id

  while (currentId) {
    if (skipParentId && currentId === skipParentId) {
      const parent = getNode(currentId)
      currentId = parent?.parent_id ?? null
      continue
    }

    const parent = getNode(currentId)
    if (!parent) break

    // File/mdfile node — meaningful context
    if (KNode.isOutline(parent) && (parent.fstype === "file" || parent.fstype === "mdfile")) {
      return parent
    }

    // Meaningful section (not a board column — those have rules)
    if (KNode.isOutline(parent) && parent.fstype === "mdsection" && !parent.rules) {
      return parent
    }

    currentId = parent.parent_id
  }

  return null
}
