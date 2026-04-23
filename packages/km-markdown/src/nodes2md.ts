/* eslint-disable @typescript-eslint/no-non-null-assertion -- codebase idiom: arr[i]! / map.get(k)! / stack.pop()! after surrounding length/has/bounds check; TS noUncheckedIndexedAccess requires the assertion even when invariant is obvious */
/**
 * Nodes to Markdown Converter
 *
 * Serializes km nodes back to markdown format
 */

import { createLogger } from "loggily"
import { stringify as stringifyYaml } from "yaml"
import type { TaskStatus } from "@km/core"
import { KNode, getMarkerForStatus, stringifyMetadata, stringifyTaskMetadata } from "@km/core"
import { buildNodeTree } from "./ast2nodes.ts"
import { serializeRules, normalizeNodeName } from "./parser.ts"

/**
 * Determine the anchor literal to re-emit as ` ^name`, if any.
 *
 * Post schema v6 (storage-architecture §2.3), a node has a single `.name`
 * that is either the anchor literal (`^abc`) or the content-derived slug —
 * we need to distinguish them at serialize time. Rule:
 *
 *   - Item nodes (list items, blocks) have no slug fallback, so ANY `.name`
 *     is an anchor literal.
 *   - Heading/file nodes (those carrying `.title`) may have a content-derived
 *     slug. The anchor is identifiable as "`.name` differs from the title's
 *     normalized slug".
 *
 * Returns the anchor string to emit, or `undefined` when the name is a
 * content-derived slug (nothing to emit).
 */
function anchorLiteralFor(node: KNode): string | undefined {
  if (!node.name) return undefined
  // List items / blocks: name is always the anchor.
  if (node.type !== "h") return node.name
  // Headings: anchor wins when `.name` doesn't equal the slug derived from
  // the heading's display text. The title is the clean heading text
  // post-strip; fall back to content if absent.
  const slugSource = node.title ?? node.content ?? ""
  return node.name === normalizeNodeName(slugSource) ? undefined : node.name
}

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
 * Inline source preservation (km-markdown.inline-format-loss).
 *
 * At parse time, the parser stores the verbatim inline source slice on
 * `node.data._mdSource` and the parse-time content baseline on
 * `node.data._mdSourceContent`. The parser only sets `_mdSource` when
 * `nothingStripped` holds — meaning the source contains no emoji task
 * metadata, no inline `key:: value` properties, and nothing else that
 * the reconstruction path would synthesize.
 *
 * At serialize time, we return the verbatim source iff the node is still
 * in its parse-time shape:
 *   - `content` equals the parse-time baseline (no text edit)
 *   - no task metadata has been added out-of-band (due_at, start_at,
 *     priority, rrule) — the TUI edits these without touching content
 *   - no inline properties have been added via data.propsRaw
 *
 * Any of those conditions failing means "the node was edited" and we fall
 * back to the reconstruction path so the new data survives. Edited nodes
 * lose inline formatting; unedited siblings keep theirs byte-for-byte.
 */
function getUneditedInlineSource(node: KNode): string | undefined {
  const src = node.data?._mdSource as string | undefined
  if (src === undefined) return undefined
  const baseline = node.data?._mdSourceContent as string | undefined
  if (baseline === undefined) return undefined
  if ((node.content ?? "") !== baseline) return undefined

  // Out-of-band edits: if any metadata field is now set but the source was
  // captured with nothingStripped=true (no metadata in source), the node
  // must have been edited through another path — reconstruct instead.
  if (node.due_at !== undefined) return undefined
  if (node.start_at !== undefined) return undefined
  if (node.priority !== undefined) return undefined
  if (node.rrule !== undefined) return undefined
  const propsRaw = node.data?.propsRaw as Record<string, string> | undefined
  if (propsRaw && Object.keys(propsRaw).length > 0) return undefined
  const dataMetadata = node.data?.metadata as Record<string, string> | undefined
  if (dataMetadata && Object.keys(dataMetadata).length > 0) return undefined

  return src
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

  // Collect existing anchor literals to avoid collisions when minting new
  // anchors during serialization. Post-v6 anchors live in `.name`; we
  // include slug-derived names too — worst case we dodge a collision that
  // wouldn't have happened. Safe-conservative.
  const existingBlockIds = new Set<string>()
  for (const n of mapSource) {
    if (n.name) existingBlockIds.add(n.name)
  }

  const ctx: SerializeContext = {
    tree,
    nodeMap,
    assignBlockId,
    existingBlockIds,
  }

  // Find root node (file node: outline item with fstype mdfile, txtfile, or file)
  const fileNode = nodes.find(
    (n) => KNode.isOutline(n) && (n.fstype === "mdfile" || n.fstype === "txtfile" || n.fstype === "file"),
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
  let orderedIndex = 0

  for (let i = 0; i < children.length; i++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- bounds checked by loop condition
    const child = children[i]!
    const nextChild = children[i + 1]

    const isCurrentList = KNode.isListItem(child)
    const isNextList = nextChild ? KNode.isListItem(nextChild) : false

    if (isCurrentList) {
      // For list items: serialize without trailing newline, add blank line only at end of group
      md += serializeNode(child, ctx, 0, false, depth, orderedIndex)
      orderedIndex++
      if (!isNextList) {
        // End of list group - add blank line
        md += "\n"
        orderedIndex = 0
      }
    } else {
      // Non-list items (sections, paragraphs, etc.) handle their own spacing
      md += serializeNode(child, ctx, 0, true, depth)
      orderedIndex = 0
    }
  }

  return md
}

/**
 * Serialize a file node (top-level document)
 *
 * The file node may have H1 properties merged in (content, title, rules).
 * We serialize the H1 heading first, then frontmatter, then children.
 */
function serializeFile(node: KNode, ctx: SerializeContext): string {
  let md = ""

  // Frontmatter - exclude internal/computed fields
  // Original frontmatter values (tags, mentions, projects, title) are preserved
  const frontmatterData = { ...node.data }
  delete frontmatterData.rules // Internal: heading rules
  delete frontmatterData._h1Title // Internal: H1 heading title (distinct from frontmatter title)
  delete frontmatterData._allMentions // Computed: aggregated from content
  delete frontmatterData._allTags // Computed: aggregated from content
  delete frontmatterData._allProjects // Computed: aggregated from content
  delete frontmatterData._mdSource // Internal: verbatim inline source (km-markdown.inline-format-loss)
  delete frontmatterData._mdSourceContent // Internal: content baseline for edit detection
  delete frontmatterData._mdBullet // Internal: original list bullet char

  // If raw frontmatter was preserved due to malformed YAML, emit it verbatim
  const rawFrontmatter = frontmatterData._rawFrontmatter as string | undefined
  delete frontmatterData._rawFrontmatter

  if (rawFrontmatter && Object.keys(frontmatterData).length === 0) {
    // Malformed YAML — emit raw block verbatim to prevent data loss
    md += "---\n"
    md += rawFrontmatter + "\n"
    md += "---\n\n"
  } else if (Object.keys(frontmatterData).length > 0) {
    md += "---\n"
    md += stringifyYaml(frontmatterData)
    md += "---\n\n"
  }

  // H1 heading (merged into file node) — use same logic as serializeSection for fidelity
  if (node.content) {
    // km-markdown.inline-format-loss: prefer verbatim source when unedited
    // (source already contains any anchor / inline props, so skip the
    // reconstructed appendings in that branch).
    const source = getUneditedInlineSource(node)
    if (source !== undefined) {
      const markerPrefix = node.item?.task ? `${statusToMarker(node.item.task.status, node.item.task.marker)} ` : ""
      let headingLine = `# ${markerPrefix}${source}`
      if (node.embed_of) headingLine = headingLine.trimEnd() + ` ![[${node.embed_of}]]`
      md += headingLine + "\n\n"
    } else {
      // Use || (not ??) — empty string title should fall through to content
      const title = node.title || node.content || ""
      const ruleStr = node.rules ? serializeRules(node.rules) : ""
      const markerPrefix = node.item?.task ? `${statusToMarker(node.item.task.status, node.item.task.marker)} ` : ""
      let headingLine = ruleStr ? `# ${markerPrefix}${title} ${ruleStr}` : `# ${markerPrefix}${title}`
      const anchor = anchorLiteralFor(node)
      if (node.embed_of || anchor) headingLine = headingLine.trimEnd()
      if (node.embed_of) headingLine += ` ![[${node.embed_of}]]`
      if (anchor) headingLine += ` ^${anchor}`
      md += headingLine + "\n\n"
    }
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
function serializeNode(
  node: KNode,
  ctx: SerializeContext,
  indent: number,
  addTrailingNewline: boolean = true,
  depth = 2,
  orderedIndex = 0,
): string {
  const children = ctx.tree.get(node.id) ?? []

  // Nodes with embed_of serialize as transclusions ![[target]].
  // Exception: outline heading nodes with task + embed_of serialize as
  // headings with inline embed ref (import cross-project dedup)
  if (node.embed_of && !(KNode.isOutline(node) && node.item?.task)) {
    return serializeEmbedding(node, ctx)
  }

  // Outline items (type === "h" && item != null)
  if (KNode.isOutline(node)) {
    // Dispatch by fstype
    if (node.fstype === "txtfile") {
      return node.content ?? ""
    }
    if (node.fstype === "mdfile" || node.fstype === "file") {
      return serializeFile(node, ctx)
    }
    // mdsection or other outline items
    return serializeSection(node, children, ctx, depth)
  }

  // List items (item != null && not outline)
  if (KNode.isListItem(node)) {
    return serializeLi(node, children, ctx, indent, addTrailingNewline, orderedIndex)
  }

  switch (node.type) {
    case "p": {
      // km-markdown.inline-format-loss: prefer verbatim source when unedited.
      // The source slice already contains the ^anchor if it was present in
      // the original, so we skip the reconstructed append in that branch.
      const source = getUneditedInlineSource(node)
      if (source !== undefined) {
        return source + "\n\n"
      }
      let paraContent = node.content ?? ""
      const anchor = anchorLiteralFor(node)
      if (anchor) paraContent += ` ^${anchor}`
      return paraContent + "\n\n"
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
  // Depth derived from tree position (parent chain), not stored on the node
  // Markdown only supports h1-h6; clamp to avoid invalid headings (e.g., ####### becomes a paragraph)
  const depth = Math.min(treeDepth, 6)
  const prefix = "#".repeat(depth)
  const markerPrefix = node.item?.task ? `${statusToMarker(node.item.task.status, node.item.task.marker)} ` : ""

  // km-markdown.inline-format-loss: prefer verbatim inline source when unedited.
  // The source slice already contains any anchor / inline props that would
  // otherwise be appended separately, so we skip those reconstructions.
  const source = getUneditedInlineSource(node)
  let headingLine: string
  if (source !== undefined) {
    headingLine = `${prefix} ${markerPrefix}${source}`
    if (node.embed_of) headingLine = headingLine.trimEnd() + ` ![[${node.embed_of}]]`
  } else {
    // Reconstruct heading from title + serialized rules (ensures roundtrip fidelity)
    // Use || (not ??) — empty string title should fall through to content
    const title = node.title || node.content || ""
    const ruleStr = node.rules ? serializeRules(node.rules) : ""
    headingLine = ruleStr ? `${prefix} ${markerPrefix}${title} ${ruleStr}` : `${prefix} ${markerPrefix}${title}`
    // Trim trailing whitespace before appending embed/anchor to avoid double spaces
    // (e.g., when title is empty and markerPrefix ends with space)
    const anchor = anchorLiteralFor(node)
    if (node.embed_of || anchor) headingLine = headingLine.trimEnd()
    if (node.embed_of) headingLine += ` ![[${node.embed_of}]]`
    if (anchor) headingLine += ` ^${anchor}`
  }
  let md = headingLine + "\n\n"

  // Use serializeChildren for proper list grouping
  md += serializeChildren(children, ctx, depth + 1)

  return md
}

/**
 * Serialize an embedding node back to ![[path|alias]] syntax
 */
function serializeEmbedding(node: KNode, ctx: SerializeContext): string {
  const target = node.embed_of
  if (!target) {
    // Fallback to content if no target
    return (node.content ?? "") + "\n\n"
  }

  // Look up target node to get its path
  const targetNode = ctx.nodeMap.get(target)
  if (!targetNode) {
    // Target not found - fallback to content
    log.debug?.(`serializeEmbedding: target not found ${target}`)
    return (node.content ?? "") + "\n\n"
  }

  // Build embed path: prefer human-readable references that survive DB rebuilds.
  // ULIDs are session-specific and become stale after re-parse.
  const path = getEmbedPath(targetNode, ctx)

  // Add alias if present and different from path
  const alias = node.name
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

  // Named section inside a file — qualify with ancestor file path
  // (bare names like "source-text" are ambiguous when multiple files have the same section name)
  if (target.name || target.title) {
    const displayName = target.title ?? target.name!
    const filePath = findAncestorFilePath(target, ctx)
    // If section has an anchor (distinct from slug), prefer it for stability.
    const anchor = anchorLiteralFor(target)
    if (anchor) {
      if (filePath) return `${filePath}#^${anchor}`
      return `^${anchor}`
    }
    if (filePath) {
      return `${filePath}#${displayName}`
    }
    // No ancestor file — use bare name (top-level named node like a folder)
    return displayName
  }

  // Task or other inline node — prefer anchor for stable references
  const filePath = findAncestorFilePath(target, ctx)

  // Use existing anchor literal (lives in `.name` for un-headings)
  const anchor = anchorLiteralFor(target)
  if (anchor) {
    if (filePath) return `${filePath}#^${anchor}`
    return `^${anchor}`
  }

  // Generate an anchor on-demand if callback is available. The assigned
  // value overwrites `.name` (anchor wins over any content-derived slug
  // that might otherwise have populated it).
  if (ctx.assignBlockId) {
    const newAnchor = generateBlockId(ctx.existingBlockIds)
    ctx.existingBlockIds.add(newAnchor)
    ctx.assignBlockId(target.id, newAnchor)
    target.name = newAnchor // Local mutation for this serialization pass
    if (filePath) return `${filePath}#^${newAnchor}`
    return `^${newAnchor}`
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
      KNode.isOutline(parent) &&
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
 * Serialize a code block.
 * Scans content for backtick runs and uses a fence longer than the longest run,
 * or switches to tilde fences when content contains backtick fences.
 */
function serializeCode(node: KNode): string {
  const lang = (node.data?.lang as string) ?? ""
  const meta = (node.data?.meta as string) ?? ""
  const header = lang + (meta ? " " + meta : "")
  const content = node.content ?? ""

  // Find the longest consecutive backtick run in the content
  let maxBacktickRun = 0
  const backtickRunRegex = /`+/g
  let match
  while ((match = backtickRunRegex.exec(content)) !== null) {
    maxBacktickRun = Math.max(maxBacktickRun, match[0].length)
  }

  // If content contains triple+ backticks, use a longer backtick fence or switch to tildes
  let fence: string
  if (maxBacktickRun >= 3) {
    // Use tilde fences to avoid any backtick ambiguity
    fence = "~".repeat(Math.max(3, maxBacktickRun + 1))
  } else {
    fence = "```"
  }

  return fence + header + "\n" + content + "\n" + fence + "\n\n"
}

/**
 * Derive the task marker from status.
 * This ensures edits to task status are reflected in the serialized output.
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
  orderedIndex = 0,
): string {
  const indentStr = "  ".repeat(indent)

  // km-markdown.inline-format-loss: prefer verbatim inline source when unedited.
  // The source slice already contains any ^anchor, task metadata (due::, etc.),
  // and inline properties (key:: value) that would otherwise be reconstructed
  // via appendTaskMetadata and the ^anchor suffix. Skip those in the source path.
  const source = getUneditedInlineSource(node)
  // Preserve original bullet marker char (*, +, -, or ordered like "1.") for
  // unedited list items. mdast normalizes all bullets to the same AST, so the
  // parser sniffs the source directly and stores the char in data._mdBullet.
  const originalBullet = node.data?._mdBullet as string | undefined

  // Build the line prefix and content
  let line: string
  if (node.item?.task) {
    const marker = statusToMarker(node.item.task.status, node.item.task.marker)
    const content = source !== undefined ? source : appendTaskMetadata(node)
    line = `${indentStr}- ${marker} ${content}`
  } else {
    let listMarker: string
    if (node.item?.list === "1.") {
      const start = (node.data?.list_start as number | undefined) ?? 1
      listMarker = `${start + orderedIndex}.`
    } else if (originalBullet && (originalBullet === "*" || originalBullet === "+" || originalBullet === "-")) {
      // Preserve the original bullet char for unordered lists
      listMarker = originalBullet
    } else {
      listMarker = "-"
    }
    const body = source !== undefined ? source : (node.content ?? "")
    line = `${indentStr}${listMarker} ${body}`
  }

  // Only append ^anchor if we didn't already emit via source (source includes it).
  if (source === undefined) {
    const anchor = anchorLiteralFor(node)
    if (anchor) line += ` ^${anchor}`
  }
  let md = line + "\n"

  // Child nodes: list items nested, block content indented under this item
  for (const child of children) {
    if (KNode.isListItem(child)) {
      md += serializeNode(child, ctx, indent + 1)
    } else if (child.type === "quote") {
      const content = child.content ?? ""
      for (const ql of content.split("\n")) {
        md += ql ? `${indentStr}  > ${ql}\n` : `${indentStr}  >\n`
      }
    } else if (child.type === "p") {
      // Blank line before extra paragraphs — required by CommonMark for multi-paragraph list items
      md += "\n"
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

/** Append task metadata as key:: value pairs (plus data.metadata and data.propsRaw entries). */
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
