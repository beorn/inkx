/**
 * Nodes to Markdown Converter
 *
 * Serializes km nodes back to markdown format
 */

import { createLogger } from "@beorn/logger"
import { stringify as stringifyYaml } from "yaml"
import type { KNode, TaskStatus } from "@km/core"
import { getMarkerForStatus, stringifyMetadata, stringifyTaskMetadata } from "@km/core"
import { buildNodeTree } from "./ast2nodes.ts"
import { serializeRules } from "./parser.ts"

const log = createLogger("km:markdown:nodes2md")

/**
 * Context for serialization - includes node lookup for embedding reconstruction
 */
interface SerializeContext {
  tree: Map<string, KNode[]>
  nodeMap: Map<string, KNode>
  assignBlockId?: (nodeId: string, blockId: string) => void
  existingBlockIds: Set<string>
}

/**
 * Generate a short, unique block ID (4-char base36).
 * 36^4 = 1.7M combinations — plenty for per-repo scope.
 */
function generateBlockId(existingIds: Set<string>): string {
  for (let i = 0; i < 100; i++) {
    const id = Math.random().toString(36).slice(2, 6)
    if (id.length === 4 && !existingIds.has(id)) return id
  }
  // Fallback to 6-char if 4-char space is exhausted
  return Math.random().toString(36).slice(2, 8)
}

/**
 * Convert nodes to markdown
 */
export function nodesToMarkdown(
  nodes: KNode[],
  lookupNodes?: KNode[],
  assignBlockId?: (nodeId: string, blockId: string) => void,
): string {
  log.debug?.(`nodesToMarkdown: ${nodes.length} nodes`)
  if (nodes.length === 0) {
    return ""
  }

  // Build tree structure from file's subtree, but use broader lookup for
  // embedding target resolution (targets may be in other files)
  const tree = buildNodeTree(nodes)
  const mapSource = lookupNodes ?? nodes
  const nodeMap = new Map(mapSource.map((n) => [n.id, n]))

  // Collect existing block IDs to avoid collisions
  const existingBlockIds = new Set<string>()
  for (const n of mapSource) {
    if (n.block_id) existingBlockIds.add(n.block_id)
  }

  const ctx: SerializeContext = {
    tree,
    nodeMap,
    assignBlockId,
    existingBlockIds,
  }

  // Find root node (file node: oi with fstype mdfile, txtfile, or file)
  const fileNode = nodes.find(
    (n) => n.type === "oi" && (n.fstype === "mdfile" || n.fstype === "txtfile" || n.fstype === "file"),
  )
  if (!fileNode) {
    // No file node, serialize all nodes flat
    return nodes.map((n) => serializeNode(n, ctx, 0)).join("")
  }

  // Plain text files: return content as-is (no markdown structure)
  if (fileNode.fstype === "txtfile") {
    return fileNode.content ?? ""
  }

  return serializeFile(fileNode, ctx)
}

/**
 * Serialize children with proper list grouping.
 * Consecutive list items are grouped together with no blank lines between them,
 * and a single blank line is added after each group.
 */
function serializeChildren(children: KNode[], ctx: SerializeContext, depth = 2): string {
  let md = ""
  const seenEmbedTargets = new Set<string>()

  for (let i = 0; i < children.length; i++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- bounds checked by loop condition
    const child = children[i]!
    const nextChild = children[i + 1]

    // Deduplicate embed references pointing to the same target
    if (child.link_to && seenEmbedTargets.has(child.link_to)) {
      continue
    }
    if (child.link_to) {
      seenEmbedTargets.add(child.link_to)
    }

    const isCurrentList = child.type === "li"
    const isNextList = nextChild?.type === "li"

    if (isCurrentList) {
      // For list items: serialize without trailing newline, add blank line only at end of group
      md += serializeNode(child, ctx, 0, false, depth)
      if (!isNextList) {
        // End of list group - add blank line
        md += "\n"
      }
    } else {
      // Non-list items (sections, paragraphs, etc.) handle their own spacing
      md += serializeNode(child, ctx, 0, true, depth)
    }
  }

  return md
}

/**
 * Serialize a file node (top-level document)
 *
 * The file node may have H1 properties merged in (content, title, rules).
 * We serialize the H1 heading first, then frontmatter (minus depth), then children.
 */
function serializeFile(node: KNode, ctx: SerializeContext): string {
  let md = ""

  // Frontmatter - exclude internal/computed fields
  // Original frontmatter values (tags, mentions, projects, title) are preserved
  const frontmatterData = { ...node.data }
  delete frontmatterData.depth // Internal: H1 merge tracking
  delete frontmatterData.rules // Internal: heading rules
  delete frontmatterData._h1Title // Internal: H1 heading title (distinct from frontmatter title)
  delete frontmatterData._allMentions // Computed: aggregated from content
  delete frontmatterData._allTags // Computed: aggregated from content
  delete frontmatterData._allProjects // Computed: aggregated from content

  if (Object.keys(frontmatterData).length > 0) {
    md += "---\n"
    md += stringifyYaml(frontmatterData)
    md += "---\n\n"
  }

  // H1 heading (merged into file node)
  if (node.content) {
    md += `# ${node.content}\n\n`
  }

  // Children (with proper list grouping) — depth 2 for direct children of # heading
  const children = ctx.tree.get(node.id) ?? []
  md += serializeChildren(children, ctx, 2)

  return md
}

/**
 * Serialize a single node
 * @param addTrailingNewline - Whether to add trailing newline for list items (default true for backwards compat)
 */
function serializeNode(node: KNode, ctx: SerializeContext, indent: number, addTrailingNewline: boolean = true, depth = 2): string {
  const children = ctx.tree.get(node.id) ?? []

  // Link nodes with embed flag or any node with link_to is a transclusion
  if (node.type === "link" || node.link_to) {
    return serializeEmbedding(node, ctx)
  }

  switch (node.type) {
    case "oi":
      // Dispatch by fstype
      if (node.fstype === "txtfile") {
        return node.content ?? ""
      }
      if (node.fstype === "mdfile" || node.fstype === "file") {
        return serializeFile(node, ctx)
      }
      // mdsection or other oi types
      return serializeSection(node, children, ctx, depth)

    case "li":
      return serializeLi(node, children, ctx, indent, addTrailingNewline)

    case "p": {
      let paraContent = node.content ?? ""
      if (node.block_id) paraContent += ` ^${node.block_id}`
      return paraContent + "\n\n"
    }

    case "h": {
      // Heading block (inside list items or blockquotes — not the oi title heading)
      const hDepth = (node.data?.depth as number) ?? 2
      const hPrefix = "#".repeat(hDepth)
      return `${hPrefix} ${node.content ?? ""}\n\n`
    }

    case "quote":
      return serializeQuote(node)

    case "code":
      return serializeCode(node)

    case "hr":
      return (node.content || "---") + "\n\n"

    case "table":
      return (node.content ?? "") + "\n\n"

    case "html":
      return (node.content ?? "") + "\n\n"

    default:
      return node.content ? node.content + "\n" : ""
  }
}

/**
 * Serialize a section (heading + children)
 */
function serializeSection(node: KNode, children: KNode[], ctx: SerializeContext, treeDepth = 2): string {
  // Prefer tree-computed depth; fall back to data.depth for parsed markdown roundtrip
  const depth = (node.data?.depth as number) ?? treeDepth
  const prefix = "#".repeat(depth)
  // Reconstruct heading from title + serialized rules (ensures roundtrip fidelity)
  const title = node.title ?? node.content ?? ""
  const ruleStr = node.rules ? serializeRules(node.rules) : ""
  // Prepend task marker if present (e.g., "## [x] Task title")
  const markerPrefix = node.task_marker ? `${statusToMarker(node.task_status, node.task_marker)} ` : ""
  let headingLine = ruleStr ? `${prefix} ${markerPrefix}${title} ${ruleStr}` : `${prefix} ${markerPrefix}${title}`
  if (node.block_id) headingLine += ` ^${node.block_id}`
  let md = headingLine + "\n\n"

  // Use serializeChildren for proper list grouping
  md += serializeChildren(children, ctx, depth + 1)

  return md
}

/**
 * Serialize an embedding node back to ![[path|alias]] syntax
 */
function serializeEmbedding(node: KNode, ctx: SerializeContext): string {
  if (!node.link_to) {
    // Fallback to content if no link_to
    return (node.content ?? "") + "\n\n"
  }

  // Look up target node to get its path
  const targetNode = ctx.nodeMap.get(node.link_to)
  if (!targetNode) {
    // Target not found - fallback to content
    log.debug?.(`serializeEmbedding: target not found ${node.link_to}`)
    return (node.content ?? "") + "\n\n"
  }

  // Build embed path: prefer human-readable references that survive DB rebuilds.
  // ULIDs are session-specific and become stale after re-parse.
  const path = getEmbedPath(targetNode, ctx)

  // Add alias if present and different from path
  const alias = node.link_alias
  if (alias && alias !== path) {
    return `![[${path}|${alias}]]\n\n`
  }

  return `![[${path}]]\n\n`
}

/**
 * Get embed path for a target node.
 * Files/folders use their basename. Tasks/sections without fs_path
 * use ancestor file's basename + #content fragment.
 */
function getEmbedPath(target: KNode, ctx: SerializeContext): string {
  // File or folder with fs_path — use basename
  if (target.fs_path) {
    const filename = target.fs_path.split("/").pop() ?? ""
    return filename.replace(/\.md$/, "")
  }

  // Named node (folder without fs_path, named section)
  if (target.name) {
    return target.name
  }

  // Section with title — find ancestor file for qualified reference
  if (target.title) {
    const filePath = findAncestorFilePath(target, ctx)
    // If section has a block_id, prefer it for stability
    if (target.block_id) {
      if (filePath) return `${filePath}#^${target.block_id}`
      return `^${target.block_id}`
    }
    if (filePath) {
      return `${filePath}#${target.title}`
    }
    return target.title
  }

  // Task or other inline node — prefer block_id for stable references
  const filePath = findAncestorFilePath(target, ctx)

  // Use existing block_id
  if (target.block_id) {
    if (filePath) return `${filePath}#^${target.block_id}`
    return `^${target.block_id}`
  }

  // Generate block_id on-demand if callback is available
  if (ctx.assignBlockId) {
    const blockId = generateBlockId(ctx.existingBlockIds)
    ctx.existingBlockIds.add(blockId)
    ctx.assignBlockId(target.id, blockId)
    target.block_id = blockId // Local mutation for this serialization pass
    if (filePath) return `${filePath}#^${blockId}`
    return `^${blockId}`
  }

  // Fallback: content-based reference
  const content = target.content?.replace(/^- \[.\]\s*/, "") ?? ""
  if (content) {
    if (filePath) {
      return `${filePath}#${content}`
    }
    return content
  }

  // Last resort — ID
  return target.id
}

/** Walk up parent chain to find the ancestor file and return its basename */
function findAncestorFilePath(node: KNode, ctx: SerializeContext): string | null {
  let current = node
  for (let i = 0; i < 20; i++) {
    if (!current.parent_id) return null
    const parent = ctx.nodeMap.get(current.parent_id)
    if (!parent) return null
    if (
      parent.type === "oi" &&
      (parent.fstype === "file" || parent.fstype === "mdfile" || parent.fstype === "txtfile") &&
      parent.fs_path
    ) {
      const filename = parent.fs_path.split("/").pop() ?? ""
      return filename.replace(/\.md$/, "")
    }
    current = parent
  }
  return null
}

/**
 * Serialize a blockquote
 */
function serializeQuote(node: KNode): string {
  const content = node.content ?? ""
  const lines = content.split("\n")
  return lines.map((l) => "> " + l).join("\n") + "\n\n"
}

/**
 * Serialize a code block
 */
function serializeCode(node: KNode): string {
  const lang = (node.data?.lang as string) ?? ""
  const meta = (node.data?.meta as string) ?? ""
  const header = lang + (meta ? " " + meta : "")
  return "```" + header + "\n" + (node.content ?? "") + "\n```\n\n"
}

/**
 * Derive the task marker from task_status.
 * This ensures edits to task_status are reflected in the serialized output.
 */
function statusToMarker(status: string | undefined, existingMarker?: string): string {
  if (!status) return existingMarker ?? "[ ]"
  return getMarkerForStatus(status as TaskStatus)
}

/**
 * Serialize a list item (unified: handles tasks, unordered, and ordered lists)
 */
function serializeLi(
  node: KNode,
  children: KNode[],
  ctx: SerializeContext,
  indent: number,
  addTrailingNewline: boolean = true,
): string {
  const indentStr = "  ".repeat(indent)

  // Build the line prefix and content
  let line: string
  if (node.task_marker) {
    const marker = statusToMarker(node.task_status, node.task_marker)
    const content = appendTaskMetadata(node)
    line = `${indentStr}- ${marker} ${content}`
  } else {
    const listMarker = node.list_marker === "1." ? "1." : "-"
    line = `${indentStr}${listMarker} ${node.content ?? ""}`
  }

  if (node.block_id) line += ` ^${node.block_id}`
  let md = line + "\n"

  // Child nodes: list items nested, block content indented under this item
  for (const child of children) {
    if (child.type === "li") {
      md += serializeNode(child, ctx, indent + 1)
    } else if (child.type === "quote") {
      const content = child.content ?? ""
      for (const ql of content.split("\n")) {
        md += ql ? `${indentStr}  > ${ql}\n` : `${indentStr}  >\n`
      }
    } else if (child.type === "p") {
      const content = child.content ?? ""
      for (const pl of content.split("\n")) {
        md += `${indentStr}  ${pl}\n`
      }
    } else if (child.type === "code") {
      const lang = (child.data?.lang as string) ?? ""
      const meta = (child.data?.meta as string) ?? ""
      const fence = meta ? `\`\`\`${lang} ${meta}` : `\`\`\`${lang}`
      md += `${indentStr}  ${fence}\n`
      for (const cl of (child.content ?? "").split("\n")) {
        md += `${indentStr}  ${cl}\n`
      }
      md += `${indentStr}  \`\`\`\n`
    } else if (child.type === "h") {
      const hDepth = (child.data?.depth as number) ?? 2
      const hPrefix = "#".repeat(hDepth)
      md += `${indentStr}  ${hPrefix} ${child.content ?? ""}\n`
    } else {
      // table, hr, html, math — indent each line
      const content = child.content ?? (child.type === "hr" ? "---" : "")
      for (const bl of content.split("\n")) {
        md += `${indentStr}  ${bl}\n`
      }
    }
  }

  // Add trailing newline only at top level when requested
  if (indent === 0 && addTrailingNewline) md += "\n"

  return md
}

/** Append task metadata as text key:value tags (due:, start:, p:, recur:, plus data.metadata and data.propsRaw entries). */
function appendTaskMetadata(node: KNode): string {
  let content = stringifyTaskMetadata(node.content ?? "", node)
  const metadata = (node.data?.metadata as Record<string, string>) ?? {}
  if (Object.keys(metadata).length > 0) {
    content = stringifyMetadata(content, metadata)
  }
  // Also emit structural inline properties (blocked-by::, rating::, etc.)
  // Use raw values directly (no quoting) to preserve wikilinks and special chars.
  const propsRaw = (node.data?.propsRaw as Record<string, string>) ?? {}
  for (const [key, value] of Object.entries(propsRaw)) {
    if (value === undefined || value === "") continue
    // Skip if already present in content (e.g., not stripped)
    const keyPattern = new RegExp(`\\b${key}:: `)
    if (keyPattern.test(content)) continue
    content += ` ${key}:: ${value}`
  }
  return content
}

/**
 * Regenerate a file's markdown from its nodes
 */
export function regenerateFile(fileNodeId: string, allNodes: KNode[]): string {
  // Filter to just this file's nodes
  const fileNodes = getFileSubtree(fileNodeId, allNodes)
  log.debug?.(`regenerateFile: ${fileNodeId} → ${fileNodes.length} nodes`)
  return nodesToMarkdown(fileNodes)
}

/**
 * Get all nodes belonging to a file
 */
function getFileSubtree(fileId: string, allNodes: KNode[]): KNode[] {
  const result: KNode[] = []
  const nodeMap = new Map(allNodes.map((n) => [n.id, n]))

  function addWithDescendants(nodeId: string) {
    const node = nodeMap.get(nodeId)
    if (!node) return

    result.push(node)

    // Find children
    for (const n of allNodes) {
      if (n.parent_id === nodeId) {
        addWithDescendants(n.id)
      }
    }
  }

  addWithDescendants(fileId)
  return result
}
