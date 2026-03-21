/**
 * AST to Nodes Converter - KNode Transformation
 *
 * This module converts parsed markdown (mdast AST) into km's KNode structure.
 * It depends on parser.ts for the parsing utilities and @km/core for types.
 *
 * Responsibility split with parser.ts:
 * - parser.ts: Pure parsing utilities (no KNode dependency, text/AST only)
 * - ast2nodes.ts: KNode-specific transformation (uses parser.ts, creates KNodes)
 *
 * Main entry points:
 * - parseMarkdownToNodes: string → KNode[] (simple, no wikilinks)
 * - parseMarkdownWithLinks: string → { nodes, wikilinks, warnings }
 *
 * Internal helpers:
 * - astToNodes: mdast Root → KNode[] (main conversion loop)
 * - convertListItem: ListItem → KNode[] (handles tasks, nested lists)
 * - convertBlock: Content → KNode (paragraphs, quotes, code, etc.)
 *
 * For the reverse operation (KNodes → markdown), see nodes2md.ts.
 */

import { createLogger } from "loggily"
import { ulid } from "ulid"

const log = createLogger("km:markdown:ast2nodes")
import type { Root, RootContent, Heading, List, ListItem } from "mdast"
import { parse as parseYaml } from "yaml"
import type { KNode, NodeType, TaskStatus, TaskMarker } from "@km/core"
import { getStatusForMarker, markToMarker, parseTaskMetadataFromText } from "@km/core"
import {
  parseMarkdown,
  extractFrontmatter,
  nodeToText,
  blockquoteToText,
  tableToMarkdown,
  slugify,
  parseTaskMetadata,
  parseWikiLinks,
  extractAllRefs,
} from "./parser.ts"
import type { WikiLink, PropertyValue, SectionRules } from "./parser.ts"

/**
 * Interpret heading rules from propsRaw (already extracted by kmInlinePropTransform).
 * Reads km.* keys from propsRaw and builds SectionRules.
 * km.add values are comma-separated in propsRaw (concatenated by the transform).
 */
function interpretHeadingRules(propsRaw: Record<string, string>): SectionRules {
  const rules: SectionRules = {}
  for (const [fullKey, value] of Object.entries(propsRaw)) {
    if (!fullKey.startsWith("km.")) continue
    const key = fullKey.slice(3)
    switch (key) {
      case "add": {
        const parts = value.split(", ").map((s) => s.trim())
        rules.add = parts.length === 1 ? parts[0] : parts
        break
      }
      case "sync":
        rules.sync = value
        break
      case "collapse":
        if (value === "true") rules.collapse = true
        break
      case "hidden":
        if (value === "true") rules.hidden = true
        break
      case "limit":
        rules.limit = parseInt(value, 10)
        break
      case "default":
        if (value === "true") rules.default = true
        break
      case "removed":
        if (value === "true") rules.removed = true
        break
      case "color":
        rules.color = value
        break
    }
  }
  return rules
}

/**
 * Parse warning for structural issues
 */
export interface ParseWarning {
  type: "missing_h1" | "multiple_h1"
  message: string
  line?: number
}

/**
 * Extracted link with optional relationship (for property-based links)
 */
export interface ExtractedLink {
  nodeId: string
  link: WikiLink
  /** Property name for property-based links (e.g., "blocked-by"), undefined for content wikilinks */
  relationship?: string
}

/**
 * Result of parsing markdown with wikilinks
 */
export interface ParseResult {
  nodes: KNode[]
  wikilinks: ExtractedLink[]
  warnings: ParseWarning[]
}

/**
 * Extract link targets from a PropertyValue
 * Handles single links and lists of links
 */
function extractLinksFromProperty(propValue: PropertyValue): string[] {
  if (propValue.type === "link") {
    return [propValue.target]
  }
  if (propValue.type === "list") {
    const targets: string[] = []
    for (const item of propValue.values) {
      if (item.type === "link") {
        targets.push(item.target)
      }
    }
    return targets
  }
  return []
}

/**
 * Parse a markdown file into km nodes
 */
export function parseMarkdownToNodes(content: string, fsPath: string, fsIno?: number): KNode[] {
  return parseMarkdownWithLinks(content, fsPath, fsIno).nodes
}

/**
 * Parse a markdown file into km nodes with wikilink extraction
 */
export function parseMarkdownWithLinks(content: string, fsPath: string, fsIno?: number, fsMtime?: number): ParseResult {
  const start = Date.now()

  const { frontmatter, body } = extractFrontmatter(content)
  const ast = parseMarkdown(body)
  const now = Date.now()

  const fileNode = createFileNode(fsPath, fsIno, fsMtime, frontmatter, now)
  const h1Ids = new Set<string>()
  let childNodes = astToNodes(ast, fileNode, h1Ids)

  const { childNodes: filteredChildren, hadH1 } = mergeH1IntoFileNode(fileNode, childNodes, h1Ids)
  childNodes = filteredChildren

  const allNodes = [fileNode, ...childNodes]
  const wikilinks = extractWikilinksFromNodes(allNodes)
  aggregateRefs(fileNode, childNodes)
  const warnings = validateH1Count(childNodes, fsPath, hadH1, h1Ids)

  log.debug?.("parsed", {
    fsPath,
    nodes: allNodes.length,
    wikilinks: wikilinks.length,
    warnings: warnings.length,
    ms: Date.now() - start,
  })

  return { nodes: allNodes, wikilinks, warnings }
}

/**
 * Parse a plain text file into km nodes.
 * Creates a simple file node with the raw text as content — no markdown parsing.
 * Whitespace, newlines, and all content are preserved exactly.
 */
export function parsePlainTextToNodes(content: string, fsPath: string, fsIno?: number, fsMtime?: number): ParseResult {
  const now = Date.now()
  const filename = fsPath.split("/").pop() || ""
  const ext = filename.lastIndexOf(".") !== -1 ? filename.slice(filename.lastIndexOf(".")) : ""
  const name = ext ? filename.slice(0, -ext.length) : filename

  const fileNode: KNode = {
    id: ulid(),
    type: "h",
    item: true,
    fstype: "txtfile",
    parent_id: null,
    parent_idx: 0,
    fs_path: fsPath,
    fs_ino: fsIno,
    fs_mtime: fsMtime,
    name,
    title: name,
    content: content,
    content_hash: undefined,
    data: {},
    created_at: now,
    updated_at: now,
    version: "",
  }

  return { nodes: [fileNode], wikilinks: [], warnings: [] }
}

/**
 * Parse YAML frontmatter into data object.
 * When YAML is malformed, preserves the raw string in `_rawFrontmatter`
 * so the serializer can emit it verbatim (preventing silent data loss).
 */
function parseFrontmatter(yaml: string): Record<string, unknown> {
  try {
    const data = parseYaml(yaml) as Record<string, unknown>
    return data ?? {}
  } catch {
    return { _rawFrontmatter: yaml }
  }
}

/**
 * Convert AST children to km nodes
 */
// oxlint-disable-next-line complexity/complexity -- Recursive AST conversion with many node types
function astToNodes(ast: Root, fileNode: KNode, h1Ids?: Set<string>): KNode[] {
  const nodes: KNode[] = []
  const sectionStack: Array<{ depth: number; node: KNode }> = []
  let currentParent = fileNode
  let sortOrder = 0
  const now = Date.now()

  for (const child of ast.children) {
    // Handle headings - create section hierarchy
    if (child.type === "heading") {
      const heading = child as Heading

      // Clamp heading depth so it can't escape above the root section.
      // An H1 inside an H3 section becomes H4 (root section depth + 1).
      // At root level (no sections on stack), trust the markdown depth.
      const effectiveDepth =
        sectionStack.length > 0 ? Math.max(heading.depth, (sectionStack[0]?.depth ?? 0) + 1) : heading.depth

      // Pop stack until we find a shallower heading (using effective depth)
      while (sectionStack.length > 0) {
        const top = sectionStack[sectionStack.length - 1]
        if (top && top.depth >= effectiveDepth) {
          sectionStack.pop()
        } else {
          break
        }
      }

      // All heading data extracted by kmast transforms:
      // - blockId: kmBlockIdTransform (strips ^id suffix)
      // - taskMark: kmHeadingTaskMarkTransform (strips [x] prefix)
      // - props/cleanText: kmInlinePropTransform (extracts key:: value)
      // - tags/mentions/projects: kmRefsTransform
      const sectionBlockId = heading.data?.blockId as string | undefined
      const taskMark = heading.data?.taskMark as string | undefined
      const propsRaw = (heading.data?.propsRaw as Record<string, string> | undefined) ?? {}
      const cleanText = (heading.data?.cleanText as string | undefined) ?? nodeToText(heading)

      // Heading rules from kmast propsRaw (km.* keys extracted by kmInlinePropTransform)
      const rules = interpretHeadingRules(propsRaw)
      const hasRules = Object.keys(rules).length > 0
      const title = cleanText
      const sectionName = slugify(title)

      const taskMarker = taskMark !== undefined ? markToMarker(taskMark) : undefined
      const taskStatus = getStatusForMarker(taskMarker)

      // Track H1 nodes at root level for mergeH1IntoFileNode
      const isRootH1 = heading.depth === 1 && sectionStack.length === 0

      const parentSection = sectionStack[sectionStack.length - 1]
      const nodeId = ulid()
      const sectionNode: KNode = {
        id: nodeId,
        type: "h",
        item: true,
        fstype: "mdsection",
        parent_id: parentSection ? parentSection.node.id : fileNode.id,
        parent_idx: sortOrder++,
        name: sectionName, // Slug/identifier derived from heading
        md_pos: heading.position?.start.offset,
        block_id: sectionBlockId,
        content: cleanText, // Clean content (block-id, task mark, and props stripped by transforms)
        content_hash: undefined,
        title, // Clean title without rules and task mark
        rules: hasRules ? rules : undefined, // Only set if rules exist
        task_status: taskStatus,
        task_marker: taskMarker,
        data: hasRules ? { rules, title } : {},
        created_at: now,
        updated_at: now,
        version: "",
      }

      // Detect embed syntax in heading content (from import cross-project dedup serialization)
      // Reuse parseWikiLinks which already handles all wikilink variants including bare block refs
      if (getEmbeddingText(cleanText)) {
        const links = parseWikiLinks(cleanText)
        const link = links[0]
        if (links.length === 1 && link?.embedded) {
          const target = link.blockId ? `^${link.blockId}` : link.target
          if (target) {
            sectionNode.data = { ...sectionNode.data, embeddingTarget: target }
            if (link.alias) {
              ;(sectionNode.data as Record<string, unknown>).embeddingAlias = link.alias
            }
          }
        }
      }

      if (isRootH1 && h1Ids) {
        h1Ids.add(nodeId)
      }

      nodes.push(sectionNode)
      sectionStack.push({ depth: effectiveDepth, node: sectionNode })
      currentParent = sectionNode
      continue
    }

    // Handle lists - create list items/tasks
    if (child.type === "list") {
      const list = child as List

      for (const item of list.children) {
        const listItem = item as ListItem
        const itemNodes = convertListItem(listItem, currentParent, list.ordered ?? false, sortOrder++, list.start)
        nodes.push(...itemNodes)
      }
      continue
    }

    // Handle other block types
    const blockNode = convertBlock(child, currentParent, sortOrder++)
    if (blockNode) {
      nodes.push(blockNode)
    }
  }

  return nodes
}

/**
 * Convert a list item to nodes (may include nested items)
 */
function convertListItem(
  item: ListItem,
  parent: KNode,
  ordered: boolean,
  sortOrder: number,
  listStart?: number | null,
): KNode[] {
  const nodes: KNode[] = []
  const now = Date.now()

  // Extract only the first paragraph's text for node.content.
  // Extra paragraphs are handled as child nodes below (convertBlock).
  const firstPara = item.children.find((c) => c.type === "paragraph" || (c as { type: string }).type === "text")
  const text = firstPara ? nodeToText(firstPara as RootContent) : ""

  // Read task mark from kmast data (set by kmTaskMark tokenizer)
  const taskMark = item.data?.taskMark as string | undefined

  // A task has a task mark (set by the km tokenizer for all marks: space, x, X, /, -, !)
  const isTask = taskMark !== undefined

  // Block ID already extracted by kmBlockIdTransform (in item.data.blockId)
  const blockId = item.data?.blockId as string | undefined

  const taskMarker: TaskMarker | undefined = isTask ? markToMarker(taskMark) : undefined
  const taskStatus = isTask ? (getStatusForMarker(taskMarker) ?? ("todo" as TaskStatus)) : undefined

  // Parse task metadata from text
  const metadata = isTask ? parseTaskMetadata(text) : {}
  // Read refs and props from kmast data (set by kmRefsTransform and kmInlinePropTransform)
  const tags = (item.data?.tags as string[] | undefined) ?? []
  const mentions = (item.data?.mentions as string[] | undefined) ?? []
  const projects = (item.data?.projects as string[] | undefined) ?? []
  const parsedProps = {
    props: (item.data?.props as Record<string, unknown> | undefined) ?? {},
    propsRaw: (item.data?.propsRaw as Record<string, string> | undefined) ?? {},
    cleanText: (item.data?.cleanText as string | undefined) ?? text,
  }

  // Priority from metadata only (now a free-form string)
  const priority: string | undefined = metadata.priority

  // Strip metadata from content for tasks only.
  // The serializer (nodes2md appendTaskMetadata) reconstructs task metadata from node fields
  // and inline properties from data.metadata + data.propsRaw.
  // Non-task items keep everything in content since their serializer doesn't reconstruct.
  let displayContent = text
  if (isTask) {
    if (Object.keys(parsedProps.propsRaw).length > 0) {
      // Strip ALL key:: value pairs (cleanText) — they're stored in propsRaw/metadata
      // and reconstructed by the serializer.
      displayContent = parsedProps.cleanText
      // Also strip emoji/legacy task metadata formats that cleanText doesn't handle
      displayContent = parseTaskMetadataFromText(displayContent).cleanContent
    } else {
      // No inline properties, just strip task-specific metadata (due::, start::, priority::, recur::, due:, 📅, ⏳, 🔁)
      displayContent = parseTaskMetadataFromText(text).cleanContent
    }
  }

  // Separate metadata-like props (created, completed) from structured props
  const metadataFromProps: Record<string, string> = {}
  const structuralPropsRaw: Record<string, string> = {}
  for (const [k, v] of Object.entries(parsedProps.propsRaw)) {
    if (k === "created" || k === "completed") {
      metadataFromProps[k] = v
    } else {
      structuralPropsRaw[k] = v
    }
  }

  // Use inline created:: metadata to populate created_at if present
  const inlineCreatedAt = parseFrontmatterTimestamp(metadataFromProps.created)

  const node: KNode = {
    id: ulid(),
    type: "p",
    item: true,
    list_marker: ordered ? "1." : "-",
    task_marker: taskMarker,
    parent_id: parent.id,
    parent_idx: sortOrder,
    md_pos: item.position?.start.offset,
    md_line: item.position?.start.line ? item.position.start.line - 1 : undefined, // Convert 1-indexed to 0-indexed
    block_id: blockId,
    content: displayContent,
    content_hash: undefined,
    task_status: taskStatus,
    due_at: metadata.dueAt,
    start_at: metadata.startAt,
    priority,
    rrule: metadata.rrule,
    data: {
      ...(tags.length > 0 ? { tags } : {}),
      ...(mentions.length > 0 ? { mentions } : {}),
      ...(projects.length > 0 ? { projects } : {}),
      ...(metadata.rrule ? { rrule: metadata.rrule } : {}),
      ...(Object.keys(parsedProps.props).length > 0 ? { props: parsedProps.props } : {}),
      ...(Object.keys(structuralPropsRaw).length > 0 ? { propsRaw: structuralPropsRaw } : {}),
      ...(Object.keys(metadataFromProps).length > 0 ? { metadata: metadataFromProps } : {}),
      ...(ordered && listStart !== null && listStart !== 1 ? { list_start: listStart } : {}),
    },
    created_at: inlineCreatedAt ?? now,
    updated_at: now,
    version: "",
  }

  nodes.push(node)

  // Handle nested lists and block content (blockquotes, code, headings, extra paragraphs, tables, html, hr)
  let childSort = 0
  // Skip the first paragraph (already extracted as the list item's text content)
  let skippedFirstPara = false
  for (const child of item.children) {
    if (child.type === "list") {
      const list = child as List
      for (const nestedItem of list.children) {
        const nestedNodes = convertListItem(nestedItem, node, list.ordered ?? false, childSort++)
        nodes.push(...nestedNodes)
      }
    } else if (child.type === "heading") {
      // Headings inside list items become li children (not sections — oi only inside oi)
      const heading = child as Heading
      const liNode: KNode = {
        id: ulid(),
        type: "p",
        item: true,
        parent_id: node.id,
        parent_idx: childSort++,
        content: nodeToText(heading),
        data: {},
        created_at: now,
        updated_at: now,
        version: "",
      }
      nodes.push(liNode)
    } else if (child.type === "paragraph") {
      // First paragraph is the item's own text — skip it (already in node.content)
      if (!skippedFirstPara) {
        skippedFirstPara = true
        continue
      }
      // Extra paragraphs in multi-paragraph list items
      const blockNode = convertBlock(child, node, childSort++)
      if (blockNode) nodes.push(blockNode)
    } else if (
      child.type === "blockquote" ||
      child.type === "code" ||
      child.type === "table" ||
      child.type === "html" ||
      child.type === "thematicBreak"
    ) {
      const blockNode = convertBlock(child, node, childSort++)
      if (blockNode) nodes.push(blockNode)
    }
  }

  return nodes
}

/**
 * Check if text is purely an embedding (nothing but ![[...]])
 * Returns the embedding text if so, null otherwise
 */
function getEmbeddingText(text: string): string | null {
  const trimmed = text.trim()
  // Check if text is purely an embedding: ![[...]] with nothing outside
  if (/^!\[\[[^\]]+\]\]$/.test(trimmed)) return trimmed
  return null
}

/**
 * Convert a block element to a node
 */
function convertBlock(block: RootContent, parent: KNode, sortOrder: number): KNode | null {
  const now = Date.now()

  let type: NodeType
  let content: string | null = null
  const data: Record<string, unknown> = {}

  // Block ID already extracted by kmBlockIdTransform (in block.data.blockId)
  const blockId = block.data?.blockId as string | undefined

  switch (block.type) {
    case "paragraph": {
      type = "p"
      content = nodeToText(block)
      // Detect embedding syntax ![[...]] and store target for reconciliation
      if (getEmbeddingText(content)) {
        const links = parseWikiLinks(content)
        const link = links[0]
        if (links.length === 1 && link?.embedded) {
          const target = link.blockId ? `^${link.blockId}` : link.target
          if (target) {
            data.embeddingTarget = target
            if (link.alias) data.embeddingAlias = link.alias
          }
        }
      }
      break
    }

    case "blockquote":
      type = "quote"
      content = blockquoteToText(block)
      break

    case "code":
      type = "code"
      content = block.value
      if (block.lang) {
        data.lang = block.lang
      }
      if (block.meta) {
        data.meta = block.meta
      }
      break

    case "thematicBreak":
      type = "hr"
      // HR marker style (---, ***, ___) is not preserved — we use canonical `---`
      break

    case "table":
      type = "table"
      content = tableToMarkdown(block)
      break

    case "html":
      type = "html"
      content = block.value
      break

    default:
      // Skip unknown types
      return null
  }

  return {
    id: ulid(),
    type,
    parent_id: parent.id,
    parent_idx: sortOrder,
    md_pos: block.position?.start.offset,
    block_id: blockId,
    content: content ?? undefined,
    content_hash: undefined,
    data,
    created_at: now,
    updated_at: now,
    version: "",
  }
}

/**
 * Build a tree structure from flat nodes
 */
export function buildNodeTree(nodes: KNode[]): Map<string, KNode[]> {
  const tree = new Map<string, KNode[]>()

  for (const node of nodes) {
    const parentId = node.parent_id ?? "__root__"
    if (!tree.has(parentId)) {
      tree.set(parentId, [])
    }
    tree.get(parentId)?.push(node)
  }

  // Sort children by parent_idx
  for (const children of tree.values()) {
    children.sort((a, b) => a.parent_idx - b.parent_idx)
  }

  return tree
}

// ---------------------------------------------------------------------------
// Helpers for parseMarkdownWithLinks (extracted to reduce cognitive complexity)
// ---------------------------------------------------------------------------

/**
 * Create the initial file node from filesystem path and frontmatter
 */
function createFileNode(
  fsPath: string,
  fsIno: number | undefined,
  fsMtime: number | undefined,
  frontmatter: string | null,
  now: number,
): KNode {
  const filename = fsPath.split("/").pop() || ""
  const name = filename.replace(/\.md$/i, "")
  const data = frontmatter ? parseFrontmatter(frontmatter) : {}

  // Extract timestamps from frontmatter (created_at, modified_at, or created/modified date strings)
  const createdAt = parseFrontmatterTimestamp(data.created_at ?? data.created) ?? now
  const updatedAt = parseFrontmatterTimestamp(data.modified_at ?? data.modified) ?? now

  return {
    id: ulid(),
    type: "h",
    item: true,
    fstype: "mdfile",
    parent_id: null, // Will be set based on folder structure
    parent_idx: 0,
    fs_path: fsPath,
    fs_ino: fsIno,
    fs_mtime: fsMtime,
    name, // Slug/identifier derived from filename
    content: undefined,
    content_hash: undefined,
    data,
    created_at: createdAt,
    updated_at: updatedAt,
    version: "",
  }
}

/** Parse a frontmatter value (ISO date string, Date object, or epoch ms) into a Unix timestamp in ms.
 *  Returns undefined if the value is missing or unparseable. */
function parseFrontmatterTimestamp(value: unknown): number | undefined {
  if (value === null) return undefined
  if (typeof value === "number") return value
  if (value instanceof Date) {
    const t = value.getTime()
    return Number.isNaN(t) ? undefined : t
  }
  if (typeof value === "string") {
    const t = new Date(value).getTime()
    return Number.isNaN(t) ? undefined : t
  }
  return undefined
}

/**
 * Merge H1 section into file node (file + H1 = one conceptual node).
 * The H1 title becomes the file's title, and H1's children become file's children.
 * Returns filtered childNodes (H1 removed) and whether an H1 was found.
 */
function mergeH1IntoFileNode(
  fileNode: KNode,
  childNodes: KNode[],
  h1Ids: Set<string>,
): { childNodes: KNode[]; hadH1: boolean } {
  const h1Section = childNodes.find((n) => h1Ids.has(n.id))

  if (!h1Section) {
    return { childNodes, hadH1: false }
  }

  // Copy H1 properties to file node
  fileNode.title = h1Section.title
  fileNode.content = h1Section.content
  fileNode.md_pos = h1Section.md_pos
  if (h1Section.block_id) {
    fileNode.block_id = h1Section.block_id
  }
  if (h1Section.rules) {
    fileNode.rules = h1Section.rules
  }
  // Copy task properties from H1 (if present)
  if (h1Section.task_status) {
    fileNode.task_status = h1Section.task_status
  }
  if (h1Section.task_marker) {
    fileNode.task_marker = h1Section.task_marker
  }
  // Merge H1's data into file data, but frontmatter takes precedence
  // (frontmatter fields overwrite H1 data fields)
  if (h1Section.data) {
    fileNode.data = { ...h1Section.data, ...fileNode.data }
  }
  // Store H1 title in data for DB persistence (using _h1Title to avoid collision with frontmatter title)
  if (h1Section.title) {
    fileNode.data = { ...fileNode.data, _h1Title: h1Section.title }
  }

  // Re-parent H1's children to the file node
  const filtered = childNodes.filter((n) => n.id !== h1Section.id)
  for (const child of filtered) {
    if (child.parent_id === h1Section.id) {
      child.parent_id = fileNode.id
    }
  }

  // Renumber direct children of file for consistent indexing after merge.
  // Without this, children keep their original AST sortOrder (which skipped
  // index 0 for the removed H1), causing structural key mismatches in the differ.
  let idx = 0
  for (const child of filtered) {
    if (child.parent_id === fileNode.id) {
      child.parent_idx = idx++
    }
  }

  return { childNodes: filtered, hadH1: true }
}

/**
 * Extract wikilinks from all nodes (both inline content and property-based links)
 */
function extractWikilinksFromNodes(allNodes: KNode[]): ExtractedLink[] {
  const wikilinks: ExtractedLink[] = []

  for (const node of allNodes) {
    // Extract wikilinks from content
    if (node.content) {
      const links = parseWikiLinks(node.content)
      for (const link of links) {
        wikilinks.push({ nodeId: node.id, link })
      }
    }

    // Extract links from properties (e.g., blocked-by:: [[target]])
    const nodeData = node.data as { props?: Record<string, PropertyValue> } | undefined
    if (nodeData?.props) {
      for (const [propName, propValue] of Object.entries(nodeData.props)) {
        const propLinks = extractLinksFromProperty(propValue)
        for (const target of propLinks) {
          wikilinks.push({
            nodeId: node.id,
            link: { type: "wikiLink", target, embedded: false },
            relationship: propName,
          })
        }
      }
    }
  }

  return wikilinks
}

/**
 * Aggregate mentions, tags, projects from all nodes to file node's data.
 * This enables queries like @issue to find files where any content has that mention.
 * Mutates fileNode.data to add _allMentions, _allTags, _allProjects.
 */
// oxlint-disable-next-line complexity/complexity -- Nested iteration over nodes/refs is inherent to aggregation
function aggregateRefs(fileNode: KNode, childNodes: KNode[]): void {
  const aggregatedMentions = new Set<string>()
  const aggregatedTags = new Set<string>()
  const aggregatedProjects = new Set<string>()

  // km-load-perf.1: Use single-pass extraction for all refs
  // Include file node's own content (e.g., H1 heading with @issue #feature)
  if (fileNode.content) {
    const refs = extractAllRefs(fileNode.content)
    for (const m of refs.mentions) aggregatedMentions.add(m)
    for (const t of refs.tags) aggregatedTags.add(t)
    for (const p of refs.projects) aggregatedProjects.add(p)
  }

  for (const node of childNodes) {
    if (node.content) {
      // Single-pass extraction instead of 3 separate passes
      const refs = extractAllRefs(node.content)
      for (const m of refs.mentions) aggregatedMentions.add(m)
      for (const t of refs.tags) aggregatedTags.add(t)
      for (const p of refs.projects) aggregatedProjects.add(p)
    }
    // Also include from node's own data (for list items that already extracted these)
    const nodeData = node.data as Record<string, unknown> | undefined
    if (nodeData?.mentions) {
      for (const m of nodeData.mentions as string[]) aggregatedMentions.add(m)
    }
    if (nodeData?.tags) {
      for (const t of nodeData.tags as string[]) aggregatedTags.add(t)
    }
    if (nodeData?.projects) {
      for (const p of nodeData.projects as string[]) aggregatedProjects.add(p)
    }
  }

  // Store aggregated refs in separate fields to preserve original frontmatter
  // Original frontmatter values stay in data.tags/mentions/projects
  // Aggregated values (content + frontmatter) go in data._allTags/_allMentions/_allProjects
  const fileData = fileNode.data as Record<string, unknown>
  const existingMentions = (fileData.mentions as string[] | undefined) || []
  const existingTags = (fileData.tags as string[] | undefined) || []
  const existingProjects = (fileData.projects as string[] | undefined) || []

  // Add original frontmatter values to aggregation
  for (const m of existingMentions) aggregatedMentions.add(m)
  for (const t of existingTags) aggregatedTags.add(t)
  for (const p of existingProjects) aggregatedProjects.add(p)

  // Store aggregated values in separate fields (for queries)
  // Original frontmatter values (data.tags etc.) are preserved for serialization
  if (aggregatedMentions.size > 0) {
    fileData._allMentions = [...aggregatedMentions]
  }
  if (aggregatedTags.size > 0) {
    fileData._allTags = [...aggregatedTags]
  }
  if (aggregatedProjects.size > 0) {
    fileData._allProjects = [...aggregatedProjects]
  }
}

/**
 * Validate that the file has exactly one H1 heading.
 * Returns warnings for missing or multiple H1s.
 */
function validateH1Count(childNodes: KNode[], fsPath: string, hadH1: boolean, h1Ids: Set<string>): ParseWarning[] {
  const warnings: ParseWarning[] = []
  const h1Count = childNodes.filter((n) => h1Ids.has(n.id)).length
  // Add 1 for the merged H1 if it existed
  const totalH1s = hadH1 ? h1Count + 1 : h1Count

  if (totalH1s === 0) {
    warnings.push({
      type: "missing_h1",
      message: `${fsPath}: Missing H1 heading. Each markdown file should have exactly one # heading as its title.`,
    })
  } else if (totalH1s > 1) {
    // Find the second H1 for line number
    const secondH1 = childNodes.find((n) => h1Ids.has(n.id))
    warnings.push({
      type: "multiple_h1",
      message: `${fsPath}: Multiple H1 headings found (${totalH1s}). Each markdown file should have exactly one # heading.`,
      line: secondH1?.md_line,
    })
  }

  return warnings
}
