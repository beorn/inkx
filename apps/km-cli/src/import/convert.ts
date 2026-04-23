/* oxlint-disable complexity/complexity -- import→KNode converter: each ImportItem field (title, body, status, priority, due, assignee, tags, parent, block refs, custom metadata) maps into its own conditional branch; itemToNodes / projectToNodes / buildPrimaryMap are flat dispatch over a wide domain schema, not tangled logic. Splitting fragments the sequential narrative that keeps field-mapping auditable. */
/**
 * Import Pipeline — Stage 2: Convert
 *
 * Converts ImportData → FileMap (slug → markdown content).
 * Builds KNode trees (typed intermediate) and serializes via nodesToMarkdown().
 */

import type { KNode, TaskMarker, TaskStatus } from "@km/core"
import { getMarkerForStatus } from "@km/core"
import { nodesToMarkdown } from "@km/markdown"
import type { ImportData, ImportItem, ImportProject, ImportSection, FileMap } from "./types.ts"
import { splitConsolidatedComment } from "./adapters/asana/comment-filter.ts"
import { htmlToMarkdown } from "./adapters/asana/html-to-md.ts"

/** Slugify a title for use as filename — preserves Unicode letters (ø, é, ñ) */
export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    // Strip trailing numeric GIDs (13+ digits) that Asana appends to project names
    .replace(/-\d{13,}$/, "")
  return slug || "untitled"
}

/**
 * Build a map of name → unique slug. If multiple entries produce the same slug,
 * append the GID to disambiguate.
 */
export function buildUniqueSlugMap(entries: Array<{ name: string; gid: string }>): Map<string, string> {
  const bySlug = new Map<string, Array<{ name: string; gid: string }>>()
  for (const e of entries) {
    const slug = slugify(e.name)
    const list = bySlug.get(slug) ?? []
    list.push(e)
    bySlug.set(slug, list)
  }
  const map = new Map<string, string>()
  for (const [slug, group] of bySlug) {
    if (group.length === 1 && group[0]) {
      map.set(group[0].name, slug)
    } else {
      for (const e of group) {
        map.set(e.name, `${slug}-${e.gid}`)
      }
    }
  }
  return map
}

/**
 * Strip the author's full name from the start of activity text.
 * E.g., text="Bjørn Stabell added this task" with authorSlug="bjørn-stabell"
 * → "added this task". Matches by slugifying successive words from the text start.
 */
function stripAuthorPrefix(text: string, author: string): string {
  // Try progressively longer word prefixes until slug matches
  const authorSlug = slugify(author)
  const words = text.split(/\s+/)
  for (let i = 1; i <= Math.min(words.length, 5); i++) {
    const prefix = words.slice(0, i).join(" ")
    if (slugify(prefix) === authorSlug) {
      return words.slice(i).join(" ")
    }
  }
  return text
}

/** Resolve a user reference to its slug — handles both display names and pre-slugified values */
export function resolveUserSlug(ref: string, userSlugMap: Map<string, string>): string {
  // Try display name first (e.g., "Bjørn Stabell")
  const direct = userSlugMap.get(ref)
  if (direct) return direct
  // Try pre-slugified form (e.g., "bjørn-stabell" from task-transform)
  for (const [, slug] of userSlugMap) {
    if (slug === ref) return slug
  }
  // Fallback: slugify the raw reference
  return slugify(ref)
}

/**
 * Convert Asana task/project URLs to km block references.
 * Since each task has ^GID as its block ID, links become [[^GID]].
 *
 * Conversion strategy:
 * - Markdown link [text](asana-url) → [[^GID]]
 * - Bare URL → [[^GID]]
 * km's smart resolver provides display titles dynamically from the target node.
 */
const ASANA_TASK_URL_PATTERNS = [
  /https?:\/\/app\.asana\.com\/0\/\d+\/(\d+)(?:\/f)?/,
  /https?:\/\/app\.asana\.com\/1\/\d+\/task\/(\d+)(?:\?[^\S)]*)?/,
  /https?:\/\/app\.asana\.com\/1\/\d+\/project\/\d+\/task\/(\d+)(?:\?[^\S)]*)?/,
]

/** Match project/view URLs: /0/{GID}/list, /0/{GID}/board, /0/{GID}/timeline, /0/{GID} (no task suffix) */
const ASANA_PROJECT_URL_PATTERNS = [
  /https?:\/\/app\.asana\.com\/0\/(\d+)\/(?:list|board|timeline|calendar|overview|files|progress|messages|workflow)(?:[?#]\S*)?/,
  /https?:\/\/app\.asana\.com\/0\/(\d+)(?=[)\s\]]|$)/,
]

function convertAsanaLinks(text: string): string {
  const allPatterns = [...ASANA_TASK_URL_PATTERNS, ...ASANA_PROJECT_URL_PATTERNS]
  // First pass: convert markdown links [text](asana-url) → [[^GID]]
  // No aliases — smart resolver provides display titles dynamically
  for (const pattern of allPatterns) {
    const mdLinkRe = new RegExp(`\\[([^\\]]*?)\\]\\(${pattern.source}\\)`, "g")
    text = text.replace(mdLinkRe, (_match, _linkText: string, gid: string) => `[[^${gid}]]`)
  }
  // Second pass: convert <asana-url> autolinks → [[^GID]] (consuming angle brackets)
  for (const pattern of allPatterns) {
    text = text.replace(new RegExp(`<${pattern.source}>`, "g"), "[[^$1]]")
  }
  // Third pass: convert bare Asana URLs (not in markdown link or autolink syntax)
  for (const pattern of allPatterns) {
    text = text.replace(new RegExp(pattern.source, "g"), "[[^$1]]")
  }
  return text
}

// =============================================================================
// Convert options
// =============================================================================

/** Options for the convert stage */
export interface ConvertOptions {
  /** Skip importing comments and activity logs (default: true) */
  skipActivities?: boolean
}

// =============================================================================
// ImportItem → KNode conversion
// =============================================================================

/** Map import status to km TaskStatus */
const TASK_STATUS_MAP: Record<string, TaskStatus> = {
  done: "done",
  wip: "wip",
  blocked: "blocked",
  dropped: "dropped",
}
function toTaskStatus(status?: string): TaskStatus {
  return TASK_STATUS_MAP[status ?? ""] ?? "todo"
}

/** Mutable counter scoped to each conversion pass (avoids module-level state) */
type IdxCounter = { value: number }

/** Create a KNode with required fields */
function mkNode(counter: IdxCounter, fields: Partial<KNode> & Pick<KNode, "id" | "type">): KNode {
  return {
    parent_id: null,
    parent_idx: counter.value++,
    data: {},
    created_at: Date.now(),
    updated_at: Date.now(),
    version: "",
    ...fields,
  }
}

/**
 * Build the content string for a task node.
 * Title + @assignee + #tags + +projects are inline text.
 * Metadata (created::, completed::) is set on data.metadata — the serializer handles formatting.
 */
function buildTaskContent(item: ImportItem, currentProject?: string, userSlugMap?: Map<string, string>): string {
  const prettyTitle = prettifyTitle(item.title)
  const title = item.milestone ? `◆ ${prettyTitle}` : prettyTitle
  const parts: string[] = [title]
  if (item.assignee) {
    const slug = userSlugMap ? resolveUserSlug(item.assignee, userSlugMap) : slugify(item.assignee)
    parts.push(`@${slug}`)
  }
  if (item.tags?.length) parts.push(...new Set(item.tags.map((t) => `#${slugify(t)}`)))
  if (item.projects && item.projects.length > 1) {
    const otherProjects = currentProject
      ? item.projects.filter((p) => slugify(p) !== slugify(currentProject))
      : item.projects
    if (otherProjects.length > 0) {
      parts.push(...otherProjects.map((p) => `+${slugify(p)}`))
    }
  }
  // Inline date properties for markdown round-tripping
  if (item.createdAt) parts.push(`created:: ${item.createdAt.slice(0, 10)}`)
  if (item.dueAt) parts.push(`due:: ${item.dueAt.slice(0, 10)}`)
  if (item.startAt) parts.push(`start:: ${item.startAt.slice(0, 10)}`)
  if (item.completedAt) parts.push(`completed:: ${item.completedAt.slice(0, 10)}`)
  if (item.priority) parts.push(`priority:: ${item.priority}`)
  if (item.rrule) parts.push(`recur:: ${item.rrule}`)
  return parts.join(" ")
}

/** Decode common HTML entities that may remain in saved JSON */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

/** Strip remnant HTML tags (br, em, strong, etc.) but preserve <https://...> autolinks */
function stripHtmlTags(text: string): string {
  // Replace HTML tags but not <https://...> autolinks
  return text.replace(/<\/?[a-zA-Z][a-zA-Z0-9]*\b[^>]*>/g, (match) => {
    // Preserve autolinks like <https://example.com>
    if (/^<https?:\/\//.test(match)) return match
    return ""
  })
}

/**
 * Normalize text shared between body content and comment text.
 * Handles: asset proxy URLs, bullet normalization, list indent, whitespace.
 */
function normalizeImportText(text: string): string {
  // Fix Asana asset URL wrappers: [real-url](asana-asset-url) → <real-url>
  text = text.replace(/\[(https?:\/\/[^\]]+)\]\(https:\/\/app\.asana\.com\/app\/asana\/-\/get_asset[^)]*\)/g, "<$1>")
  // Fix markdown links with descriptive text pointing to asset proxy: [text](asset-url) → text [Asana asset]
  text = text.replace(/\[([^\]]+)\]\(https:\/\/app\.asana\.com\/app\/asana\/-\/get_asset[^)]*\)/g, "$1 [Asana asset]")
  // Replace bare Asana asset proxy URLs with placeholder
  text = text.replace(/https?:\/\/app\.asana\.com\/app\/asana\/-\/get_asset\?asset_id=\d+/g, "[Asana asset]")
  // Clean up redundant [url](url) → <url> autolinks
  text = text.replace(/\[([^\]]+)\]\(\1\)/g, "<$1>")
  // Normalize *-bullets to - (standard markdown uses - for lists)
  text = text.replace(/^(\s*)\*(\s{1,3})/gm, "$1-$2")
  // Normalize 4-space list indent to 2-space (from mdast pipeline with tab listItemIndent)
  text = text.replace(/^(\s*)-   /gm, "$1- ")
  // Normalize bare checkboxes: [] → [ ], [x] stays [x] (standard markdown task list syntax)
  text = text.replace(/^(\s*- )\[\]/gm, "$1[ ]")
  // Collapse 3+ consecutive blank lines to 2 (one blank line between paragraphs)
  text = text.replace(/\n{3,}/g, "\n\n")
  return text
}

/** Build body content string (paragraph body text, not blockquote) */
function buildBodyContent(item: ImportItem): string | null {
  // Prefer raw HTML (re-convert with current pipeline for best quality)
  if (item.htmlBody?.trim()) {
    let text = htmlToMarkdown(item.htmlBody)
    if (text) {
      text = convertAsanaLinks(text)
      text = normalizeImportText(text)
      return text
    }
  }
  // Fallback: pre-converted body (may have lost structure from old converters)
  if (!item.body?.trim()) return null
  let text = convertAsanaLinks(item.body.trim())
  // Clean up HTML artifacts from saved JSON
  text = decodeHtmlEntities(text)
  text = stripHtmlTags(text)
  text = normalizeImportText(text)
  return text
}

/** Split body text at markdown headings into typed sections */
function splitBodyAtHeadings(text: string): Array<{ type: "text" | "heading"; content: string }> {
  const lines = text.split("\n")
  const sections: Array<{ type: "text" | "heading"; content: string }> = []
  let currentLines: string[] = []
  let currentType: "text" | "heading" = "text"

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,6}\s+(.+)$/)
    if (headingMatch) {
      // Flush accumulated text
      if (currentLines.length > 0) {
        const content = currentLines.join("\n").trim()
        if (content) sections.push({ type: currentType, content })
        currentLines = []
      }
      // Push heading as its own section — strip bold/italic (redundant on headings)
      const headingText = (headingMatch[1] ?? "").replace(/\*{1,2}(.+?)\*{1,2}/g, "$1")
      sections.push({ type: "heading", content: headingText })
      currentType = "text"
    } else {
      currentLines.push(line)
    }
  }
  // Flush remaining text
  if (currentLines.length > 0) {
    const content = currentLines.join("\n").trim()
    if (content) sections.push({ type: currentType, content })
  }
  return sections
}

/** Prettify URL-only titles: strip protocol, www., trailing /, truncate to ~60 chars */
export function prettifyTitle(title: string): string {
  // Only transform if the entire title is a URL
  if (!/^https?:\/\/\S+$/.test(title.trim())) return title
  let pretty = title
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "")
  if (pretty.length > 60) {
    pretty = pretty.slice(0, 57) + "..."
  }
  return pretty
}

/** Convert an ImportItem to KNode(s) and append to the nodes array */
function itemToNodes(
  counter: IdxCounter,
  item: ImportItem,
  parentId: string,
  nodes: KNode[],
  rendered?: Set<string>,
  primaryMap?: Map<string, string>,
  currentProject?: string,
  localRendered?: Set<string>,
  userSlugMap?: Map<string, string>,
  convertOpts?: ConvertOptions,
): void {
  // Within-file dedup: skip entirely if already rendered in this project
  if (localRendered && item.sourceId && localRendered.has(item.sourceId)) {
    return
  }
  // Cross-project dedup: if already rendered in another project, emit embed reference.
  //
  // Embed data model (see docs/design/model/kast.md):
  //   embed_of  — target node ID to transclude (e.g., "^1234567890")
  //   content       — optional alias override; if non-empty, displayed INSTEAD of target's title
  //                   (like ![[^GID|My custom title]]). If empty, TUI resolves title from target.
  //   name          — optional alias for markdown serialization (![[path|alias]])
  //
  // TODO(km-wk17l): content is currently stored redundantly as a copy of the target's title.
  // Once getDisplayContent respects the alias-override semantics, drop content here and let
  // the TUI resolve it from embed_of. Also remove embedTitle computation.
  if (rendered && primaryMap && item.sourceId && rendered.has(item.sourceId)) {
    const status = toTaskStatus(item.status)
    const marker = status === "done" ? "[x]" : "[ ]"
    const refNodeId = `ref-${item.sourceId}`
    const embedTitle = prettifyTitle(item.title || `(ref:${item.sourceId.slice(0, 6)})`)
    nodes.push(
      mkNode(counter, {
        id: refNodeId,
        type: "h",
        item: { task: { marker: marker as TaskMarker, status } },
        parent_id: parentId,
        content: embedTitle,
        embed_of: `^${item.sourceId}`,
        created_at: item.createdAt ? new Date(item.createdAt).getTime() : undefined,
        updated_at: item.modifiedAt ? new Date(item.modifiedAt).getTime() : undefined,
      }),
    )
    return
  }
  if (localRendered && item.sourceId) localRendered.add(item.sourceId)
  if (rendered && item.sourceId) rendered.add(item.sourceId)

  // Separator items become HR nodes instead of regular tasks
  if (item.metadata?.isSeparator) {
    nodes.push(
      mkNode(counter, {
        id: item.sourceId,
        type: "hr",
        parent_id: parentId,
        // External source ID → `.name` (post-v6 fold, storage-architecture §2.3).
        name: item.sourceId,
        created_at: item.createdAt ? new Date(item.createdAt).getTime() : undefined,
        updated_at: item.modifiedAt ? new Date(item.modifiedAt).getTime() : undefined,
      }),
    )
    return
  }

  const status = toTaskStatus(item.status)

  const metadata: Record<string, string> = {}
  if (item.createdAt) metadata.created = item.createdAt.slice(0, 10)
  if (item.modifiedAt) metadata.modified = item.modifiedAt.slice(0, 10)
  if (item.completedAt) metadata.completed = item.completedAt.slice(0, 10) // inline metadata for markdown

  // Build data object with metadata and project memberships
  const nodeData: Record<string, unknown> = {}
  if (Object.keys(metadata).length > 0) nodeData.metadata = metadata
  if (item.projectMemberships && item.projectMemberships.length > 0) {
    nodeData.projectMemberships = item.projectMemberships
  }

  // Dependencies: tasks this item depends on (deps) and tasks blocked by this item (blocks)
  const deps = item.metadata?.dependencies as Array<{ gid: string }> | undefined
  const dependents = item.metadata?.dependents as Array<{ gid: string }> | undefined
  if (deps?.length) {
    nodeData.deps = deps.map((d) => `^${d.gid}`).join(",")
  }
  if (dependents?.length) {
    nodeData.blocks = dependents.map((d) => `^${d.gid}`).join(",")
  }

  // Permalink — always store if present
  if (item.permalink) nodeData.asana_permalink = item.permalink

  // External and other Asana-specific metadata
  if (item.metadata?.external) nodeData.asana_external = item.metadata.external
  if (item.metadata?.assigneeSectionName) nodeData.asana_assignee_section = item.metadata.assigneeSectionName
  if (item.metadata?.parentGid) nodeData.asana_parent_gid = item.metadata.parentGid
  if (item.metadata?.parentName) nodeData.asana_parent_name = item.metadata.parentName
  if (item.metadata?.customFields) nodeData.custom_fields = item.metadata.customFields

  // Resolve parentTaskGid (from → ^numericId in title) to embed_of if target exists
  const parentTaskGid = item.metadata?.parentTaskGid as string | undefined
  const linkTo = parentTaskGid && primaryMap?.has(parentTaskGid) ? `^${parentTaskGid}` : null

  // Compute timestamps once — child nodes inherit these
  const itemCreatedAt = item.createdAt ? new Date(item.createdAt).getTime() : Date.now()
  const itemUpdatedAt = item.modifiedAt ? new Date(item.modifiedAt).getTime() : Date.now()

  const taskNode = mkNode(counter, {
    id: item.sourceId,
    type: "h",
    item: { task: { marker: getMarkerForStatus(status), status } },
    parent_id: parentId,
    content: buildTaskContent(item, currentProject, userSlugMap),
    // External source ID (Asana GID etc.) → `.name` post-v6 (storage §2.3).
    // For anchored headings, anchor wins over slug — same rule applies here.
    name: item.sourceId,
    assigned_to: item.assignee
      ? `@${userSlugMap ? resolveUserSlug(item.assignee, userSlugMap) : slugify(item.assignee)}`
      : undefined,
    due_at: item.dueAt?.slice(0, 10),
    start_at: item.startAt?.slice(0, 10),
    priority: item.priority,
    rrule: item.rrule,
    completed_at: item.completedAt ? new Date(item.completedAt).getTime() : undefined,
    created_at: itemCreatedAt,
    updated_at: itemUpdatedAt,
    ...(linkTo && { embed_of: linkTo }),
    data: Object.keys(nodeData).length > 0 ? nodeData : undefined,
  })
  nodes.push(taskNode)

  // Body as child nodes — split at headings to create proper sub-items
  const bodyContent = buildBodyContent(item)
  if (bodyContent) {
    const sections = splitBodyAtHeadings(bodyContent)
    let sectionIdx = 0
    let parentForBody = item.sourceId
    for (const section of sections) {
      if (section.type === "text") {
        nodes.push(
          mkNode(counter, {
            id: `body-${item.sourceId}${sectionIdx > 0 ? `-${sectionIdx}` : ""}`,
            type: "p",
            parent_id: parentForBody,
            content: section.content,
            created_at: itemCreatedAt,
            updated_at: itemUpdatedAt,
          }),
        )
      } else {
        // Heading → oi node (child of the task, gets correct depth from serializer)
        const sectionId = `body-h-${item.sourceId}-${sectionIdx}`
        nodes.push(
          mkNode(counter, {
            id: sectionId,
            type: "h",
            item: {},
            parent_id: item.sourceId,
            content: section.content,
            created_at: itemCreatedAt,
            updated_at: itemUpdatedAt,
          }),
        )
        // Subsequent text goes under this heading section
        parentForBody = sectionId
      }
      sectionIdx++
    }
  }

  // Comments as child list nodes under a "Comments" parent
  // Split consolidated comments (pre-2020 Asana merged multiple comments into one),
  // extract dates from headers, filter system actions.
  if (item.comments?.length && !(convertOpts?.skipActivities ?? true)) {
    const splitEntries: Array<{ text: string; date: string; author?: string; createdAt: number }> = []
    for (const c of item.comments) {
      const entries = splitConsolidatedComment(c.text, c.createdAt)
      const authorSlug = c.author ? `@${userSlugMap ? resolveUserSlug(c.author, userSlugMap) : slugify(c.author)}` : ""
      for (const entry of entries) {
        const date = entry.date ?? c.createdAt.slice(0, 10)
        const createdAt = entry.date ? new Date(entry.date).getTime() : new Date(c.createdAt).getTime()
        splitEntries.push({ text: entry.text, date, author: authorSlug, createdAt })
      }
    }
    if (splitEntries.length) {
      nodes.push(
        mkNode(counter, {
          id: `comments-${item.sourceId}`,
          type: "h",
          item: {},
          parent_id: item.sourceId,
          content: "Comments km.collapse:: true",
          created_at: itemCreatedAt,
          updated_at: itemUpdatedAt,
        }),
      )
      for (const entry of splitEntries) {
        const fullText = normalizeImportText(convertAsanaLinks(entry.text.trim()))
        const commentId = `comment-${item.sourceId}-${counter.value}`

        // Split comment at headings (same as body content)
        const sections = splitBodyAtHeadings(fullText)
        const hasHeadings = sections.some((s) => s.type === "heading")

        if (!hasHeadings) {
          // Simple comment — single node with date prefix
          nodes.push(
            mkNode(counter, {
              id: commentId,
              type: "p",
              item: {},
              parent_id: `comments-${item.sourceId}`,
              content: `${entry.date} ${entry.author}: ${fullText}`.trim(),
              created_at: entry.createdAt,
              updated_at: itemUpdatedAt,
            }),
          )
        } else {
          // Structured comment — date/author as parent, headings as children
          nodes.push(
            mkNode(counter, {
              id: commentId,
              type: "h",
              item: {},
              parent_id: `comments-${item.sourceId}`,
              content: `${entry.date} ${entry.author}`.trim(),
              created_at: entry.createdAt,
              updated_at: itemUpdatedAt,
            }),
          )
          let sectionIdx = 0
          let parentForSection = commentId
          for (const section of sections) {
            if (section.type === "text") {
              nodes.push(
                mkNode(counter, {
                  id: `${commentId}-${sectionIdx}`,
                  type: "p",
                  parent_id: parentForSection,
                  content: section.content,
                  created_at: entry.createdAt,
                  updated_at: itemUpdatedAt,
                }),
              )
            } else {
              const sectionId = `${commentId}-h-${sectionIdx}`
              nodes.push(
                mkNode(counter, {
                  id: sectionId,
                  type: "h",
                  item: {},
                  parent_id: commentId,
                  content: section.content,
                  created_at: entry.createdAt,
                  updated_at: itemUpdatedAt,
                }),
              )
              parentForSection = sectionId
            }
            sectionIdx++
          }
        }
      }
    }
  }

  // Attachments as child list nodes under an "Attachments" parent
  if (item.attachments?.length) {
    nodes.push(
      mkNode(counter, {
        id: `attachments-${item.sourceId}`,
        type: "h",
        item: {},
        parent_id: item.sourceId,
        content: "Attachments km.collapse:: true",
        created_at: itemCreatedAt,
        updated_at: itemUpdatedAt,
      }),
    )
    for (const att of item.attachments) {
      // When attachment name IS a URL and href is an Asana asset proxy, use the name as href
      const isAssetProxy = att.url.includes("app.asana.com/app/asana/-/get_asset")
      const nameIsUrl = /^https?:\/\//.test(att.name)
      const href = att.localPath ?? (isAssetProxy && nameIsUrl ? att.name : att.url)
      // Build attachment link markdown:
      // - Always render as a markdown link (even dead asset proxy URLs)
      // - [url](url) where name === href → bare URL
      // - Otherwise → standard markdown link
      const linkMd =
        att.type === "image" ? `![${att.name}](${href})` : att.name === href ? href : `[${att.name}](${href})`
      nodes.push(
        mkNode(counter, {
          id: `att-${item.sourceId}-${counter.value}`,
          type: "p",
          item: {},
          parent_id: `attachments-${item.sourceId}`,
          content: linkMd,
          created_at: att.createdAt ? new Date(att.createdAt).getTime() : itemCreatedAt,
          updated_at: itemUpdatedAt,
        }),
      )
    }
  }

  // Activity log as child list nodes under an "Activity" parent
  if (item.activityLog?.length && !(convertOpts?.skipActivities ?? true)) {
    nodes.push(
      mkNode(counter, {
        id: `activity-${item.sourceId}`,
        type: "h",
        item: {},
        parent_id: item.sourceId,
        content: "Activity km.collapse:: true",
        created_at: itemCreatedAt,
        updated_at: itemUpdatedAt,
      }),
    )
    for (const a of item.activityLog) {
      const date = a.createdAt.slice(0, 10)
      const authorSlug = a.author ? `@${userSlugMap ? resolveUserSlug(a.author, userSlugMap) : slugify(a.author)}` : ""
      // Strip author's full name from text start — we already show @username
      const text = a.author ? stripAuthorPrefix(a.text, a.author) : a.text
      nodes.push(
        mkNode(counter, {
          id: `act-${item.sourceId}-${counter.value}`,
          type: "p",
          item: {},
          parent_id: `activity-${item.sourceId}`,
          content: `${date} ${authorSlug}: ${text}`.trim(),
          created_at: new Date(a.createdAt).getTime(),
          updated_at: itemUpdatedAt,
        }),
      )
    }
  }

  // Recursive children (subtasks)
  if (item.children?.length) {
    for (const child of item.children) {
      itemToNodes(
        counter,
        child,
        item.sourceId,
        nodes,
        rendered,
        primaryMap,
        currentProject,
        localRendered,
        userSlugMap,
        convertOpts,
      )
    }
  }
}

/** Section titles that should be treated as "no section" (items go directly under parent) */
const NO_SECTION_TITLES = new Set(["", "(no section)", "untitled section", "untitled"])

/** Convert a section to KNode(s) — skips header for placeholder sections like "(no section)" */
function sectionToNodes(
  counter: IdxCounter,
  section: ImportSection,
  parentId: string,
  nodes: KNode[],
  rendered?: Set<string>,
  primaryMap?: Map<string, string>,
  currentProject?: string,
  localRendered?: Set<string>,
  userSlugMap?: Map<string, string>,
  convertOpts?: ConvertOptions,
): void {
  const isPlaceholder = NO_SECTION_TITLES.has(section.title.toLowerCase().trim())
  const itemParentId = isPlaceholder ? parentId : `section-${section.sourceId}`

  if (!isPlaceholder) {
    nodes.push(
      mkNode(counter, {
        id: itemParentId,
        type: "h",
        item: {},
        parent_id: parentId,
        fstype: "mdsection",
        content: section.title,
        title: section.title,
      }),
    )
  }

  for (const item of section.items) {
    itemToNodes(
      counter,
      item,
      itemParentId,
      nodes,
      rendered,
      primaryMap,
      currentProject,
      localRendered,
      userSlugMap,
      convertOpts,
    )
  }
}

/** Convert a project to a KNode tree (file + sections + items) */
function projectToNodes(
  project: ImportProject,
  rendered?: Set<string>,
  primaryMap?: Map<string, string>,
  userSlugMap?: Map<string, string>,
  convertOpts?: ConvertOptions,
): KNode[] {
  const counter: IdxCounter = { value: 0 }
  const nodes: KNode[] = []
  // Track sourceIds within this project to skip within-file duplicates
  const localRendered = new Set<string>()

  // File root node — data becomes frontmatter, content becomes H1
  const fileId = `file-${project.sourceId}`
  const frontmatter: Record<string, unknown> = {}
  if (project.owner) {
    const ownerSlug = userSlugMap ? resolveUserSlug(project.owner, userSlugMap) : slugify(project.owner)
    frontmatter.owner = `@${ownerSlug}`
  }

  const projectTitle = project.title.trim() || "(untitled)"
  nodes.push(
    mkNode(counter, {
      id: fileId,
      type: "h",
      item: {},
      fstype: "mdfile",
      content: projectTitle,
      data: frontmatter,
      created_at: project.createdAt ? new Date(project.createdAt).getTime() : Date.now(),
      updated_at: project.modifiedAt ? new Date(project.modifiedAt).getTime() : Date.now(),
    }),
  )

  // Sections
  if (project.sections?.length) {
    for (const section of project.sections) {
      sectionToNodes(
        counter,
        section,
        fileId,
        nodes,
        rendered,
        primaryMap,
        project.title,
        localRendered,
        userSlugMap,
        convertOpts,
      )
    }
  }

  // Loose items
  if (project.items?.length) {
    for (const item of project.items) {
      itemToNodes(
        counter,
        item,
        fileId,
        nodes,
        rendered,
        primaryMap,
        project.title,
        localRendered,
        userSlugMap,
        convertOpts,
      )
    }
  }

  // Status Updates section
  if (project.statusUpdates?.length) {
    const statusSectionId = `status-updates-${project.sourceId}`
    nodes.push(
      mkNode(counter, {
        id: statusSectionId,
        type: "h",
        item: {},
        parent_id: fileId,
        fstype: "mdsection",
        content: "Status Updates",
        title: "Status Updates",
        data: {},
      }),
    )
    for (const [i, su] of project.statusUpdates.entries()) {
      const statusId = `status-${project.sourceId}-${i}`
      const statusLines: string[] = []
      if (su.text) statusLines.push(su.text)
      const metaParts: string[] = []
      if (su.color) metaParts.push(`Status: ${su.color}`)
      if (su.author) {
        const authorSlug = userSlugMap ? resolveUserSlug(su.author, userSlugMap) : slugify(su.author)
        metaParts.push(`Author: @${authorSlug}`)
      }
      if (su.createdAt) metaParts.push(`Date: ${su.createdAt.slice(0, 10)}`)
      if (metaParts.length) {
        if (statusLines.length) statusLines.push("")
        statusLines.push(metaParts.join(" | "))
      }
      nodes.push(
        mkNode(counter, {
          id: statusId,
          type: "p",
          item: {},
          parent_id: statusSectionId,
          content: su.title || "Status update",
        }),
      )
      if (statusLines.length) {
        nodes.push(
          mkNode(counter, {
            id: `bq-${statusId}`,
            type: "quote",
            parent_id: statusId,
            content: statusLines.join("\n"),
          }),
        )
      }
    }
  }

  // Chain recurring task instances via recur_prev
  linkRecurringInstances(project, nodes)

  // Custom Fields section
  if (project.customFieldSettings?.length) {
    const cfSectionId = `custom-fields-${project.sourceId}`
    nodes.push(
      mkNode(counter, {
        id: cfSectionId,
        type: "h",
        item: {},
        parent_id: fileId,
        fstype: "mdsection",
        content: "Custom Fields",
        title: "Custom Fields",
        data: {},
      }),
    )
    for (const [i, cf] of project.customFieldSettings.entries()) {
      const cfId = `cf-${project.sourceId}-${i}`
      const detailParts: string[] = [`Type: ${cf.type}`]
      if (cf.description) detailParts.push(cf.description)
      if (cf.precision != null) detailParts.push(`Precision: ${cf.precision}`)
      if (cf.enumOptions?.length) {
        detailParts.push(`Options: ${cf.enumOptions.join(", ")}`)
      }
      nodes.push(
        mkNode(counter, {
          id: cfId,
          type: "p",
          item: {},
          parent_id: cfSectionId,
          content: cf.name,
        }),
      )
      nodes.push(
        mkNode(counter, {
          id: `bq-${cfId}`,
          type: "quote",
          parent_id: cfId,
          content: detailParts.join("\n"),
        }),
      )
    }
  }

  return nodes
}

// =============================================================================
// Public API
// =============================================================================

/** Collect all task sourceIds from a project, recursively including children */
function collectTaskIds(items: ImportItem[], out: string[]): void {
  for (const item of items) {
    if (item.sourceId) out.push(item.sourceId)
    if (item.children?.length) collectTaskIds(item.children, out)
  }
}

/** Collect all recurring items (those with parentTaskGid) from a project, recursively */
function collectRecurringItems(items: ImportItem[], out: ImportItem[]): void {
  for (const item of items) {
    if (item.metadata?.parentTaskGid) out.push(item)
    if (item.children?.length) collectRecurringItems(item.children, out)
  }
}

/**
 * Chain recurring task instances via recur_prev.
 * Instances are grouped by their template GID (parentTaskGid), sorted by dueAt then createdAt,
 * and each instance's recur_prev is set to the previous instance's sourceId.
 * The first instance's recur_prev points to the template task sourceId (the parentTaskGid itself).
 */
function linkRecurringInstances(project: ImportProject, nodes: KNode[]): void {
  // Collect all recurring items from this project
  const recurringItems: ImportItem[] = []
  if (project.sections?.length) {
    for (const section of project.sections) {
      collectRecurringItems(section.items, recurringItems)
    }
  }
  if (project.items?.length) {
    collectRecurringItems(project.items, recurringItems)
  }

  if (recurringItems.length === 0) return

  // Build a map from sourceId → KNode for fast lookup. Source IDs live in
  // `.name` post-v6 (storage-architecture §2.3).
  const nodeById = new Map<string, KNode>()
  for (const node of nodes) {
    if (node.name) nodeById.set(node.name, node)
  }

  // Group instances by template GID
  const byTemplate = new Map<string, ImportItem[]>()
  for (const item of recurringItems) {
    const templateGid = item.metadata?.parentTaskGid as string
    const group = byTemplate.get(templateGid) ?? []
    group.push(item)
    byTemplate.set(templateGid, group)
  }

  // For each template group, sort and set recur_prev
  for (const [templateGid, instances] of byTemplate) {
    // Sort by dueAt, falling back to createdAt, then sourceId for stability
    instances.sort((a, b) => {
      const aTime = a.dueAt ?? a.createdAt ?? ""
      const bTime = b.dueAt ?? b.createdAt ?? ""
      if (aTime < bTime) return -1
      if (aTime > bTime) return 1
      return (a.sourceId ?? "").localeCompare(b.sourceId ?? "")
    })

    let prevId = `^${templateGid}` // first instance points to the template
    for (const instance of instances) {
      const node = instance.sourceId ? nodeById.get(instance.sourceId) : undefined
      if (node) {
        node.recur_prev = prevId
        prevId = `^${instance.sourceId}`
      }
    }
  }
}

/** Export for testing: convert a single ImportItem to KNode, slug helpers */
export { itemToNodes, buildTaskContent, buildBodyContent, decodeHtmlEntities, stripHtmlTags, normalizeImportText }

/**
 * Build the primaryMap (task sourceId → filename) and filename list.
 * Pass 1 of the two-pass convert: lightweight ID scan only.
 *
 * Directory structure: {workspace}/{team}/{project}.md
 * User task lists: {workspace}/users/@{user}.md (importing user stays at top level)
 * Tag files: {workspace}/tags/#{tag}.md
 */
function buildPrimaryMap(data: ImportData): {
  primaryMap: Map<string, string>
  filenames: (string | undefined)[]
  userSlugMap: Map<string, string>
} {
  const primaryMap = new Map<string, string>()
  const filenames: (string | undefined)[] = []

  // Build slug maps for users and teams
  const userSlugMap = buildUniqueSlugMap((data.users ?? []).map((u) => ({ name: u.name, gid: u.gid })))
  const teamSlugMap = buildUniqueSlugMap((data.teams ?? []).map((t) => ({ name: t.name, gid: t.gid })))

  const wsSlug = data.workspace ? slugify(data.workspace) : undefined

  // Detect project slug collisions within each team
  const projectsByTeam = new Map<string, Array<{ project: ImportProject; slug: string }>>()
  for (const project of data.projects) {
    if (project.sourceId.startsWith("tag-") || project.sourceId.startsWith("user-")) continue
    const teamKey = project.team ?? "(no-team)"
    const slug = slugify(project.title.trim() || "untitled")
    const list = projectsByTeam.get(teamKey) ?? []
    list.push({ project, slug })
    projectsByTeam.set(teamKey, list)
  }

  // Find collisions per team
  const projectSlugOverrides = new Map<string, string>() // sourceId → final slug
  for (const [, projects] of projectsByTeam) {
    const bySlug = new Map<string, Array<{ project: ImportProject; slug: string }>>()
    for (const p of projects) {
      const list = bySlug.get(p.slug) ?? []
      list.push(p)
      bySlug.set(p.slug, list)
    }
    for (const [slug, group] of bySlug) {
      if (group.length === 1 && group[0]) {
        projectSlugOverrides.set(group[0].project.sourceId, slug)
      } else {
        for (const p of group) {
          projectSlugOverrides.set(p.project.sourceId, `${slug}-${p.project.sourceId}`)
        }
      }
    }
  }

  for (const project of data.projects) {
    const isTag = project.sourceId.startsWith("tag-")
    const isUser = project.sourceId.startsWith("user-")
    let filename: string | undefined

    if (isTag) {
      // Tag projects don't get their own file — generateTagFiles() produces #slug.md instead
      filename = undefined
    } else if (isUser) {
      const userName = project.title.replace(/^@/, "").trim()
      const userSlug = userSlugMap.get(userName) ?? slugify(userName)
      const isImportingUser = data.importingUserGid != null && project.sourceId === `user-${data.importingUserGid}`

      if (isImportingUser) {
        // Importing user's My Tasks at top level (spans workspaces)
        filename = `@${userSlug}.md`
      } else if (wsSlug) {
        filename = `${wsSlug}/users/@${userSlug}.md`
      } else {
        filename = `@${userSlug}.md`
      }
    } else {
      const rawTitle = project.title.trim() || "untitled"
      const projectSlug = projectSlugOverrides.get(project.sourceId) ?? slugify(rawTitle)
      const teamSlug = project.team ? (teamSlugMap.get(project.team) ?? slugify(project.team)) : undefined

      if (wsSlug && teamSlug) {
        filename = `${wsSlug}/${teamSlug}/${projectSlug}.md`
      } else if (wsSlug) {
        filename = `${wsSlug}/${projectSlug}.md`
      } else if (teamSlug) {
        filename = `${teamSlug}/${projectSlug}.md`
      } else {
        filename = `${projectSlug}.md`
      }
    }

    filenames.push(filename)

    const ids: string[] = []
    if (project.sections?.length) {
      for (const section of project.sections) {
        collectTaskIds(section.items, ids)
      }
    }
    if (project.items?.length) collectTaskIds(project.items, ids)

    // For tag projects, point cross-references to the tag file path
    const tagSlug = slugify(project.title.replace(/^#/, "").replace(/^@/, ""))
    const mapTarget = isTag ? (wsSlug ? `${wsSlug}/tags/#${tagSlug}.md` : `#${tagSlug}.md`) : (filename ?? "")
    for (const id of ids) {
      if (!primaryMap.has(id)) primaryMap.set(id, mapTarget)
    }
  }

  return { primaryMap, filenames, userSlugMap }
}

/** Convert ImportData to a map of relative file paths → markdown content */
export function convert(data: ImportData, opts?: ConvertOptions): FileMap {
  const files: FileMap = new Map()
  for (const [filename, markdown] of convertBatch(data, opts)) {
    files.set(filename, markdown)
  }
  return files
}

/**
 * Streaming convert: yields [filename, markdown] pairs one project at a time.
 * Memory-efficient for large imports — each project's KNode tree is GC'd after yield.
 */
export function* convertBatch(data: ImportData, opts?: ConvertOptions): Generator<[string, string]> {
  const { primaryMap, filenames, userSlugMap } = buildPrimaryMap(data)
  const rendered = new Set<string>()

  for (const [i, project] of data.projects.entries()) {
    const filename = filenames[i]
    if (!filename) continue
    const nodes = projectToNodes(project, rendered, primaryMap, userSlugMap, opts)
    const markdown = nodesToMarkdown(nodes)
    yield [filename, markdown]
  }

  // Tag aggregate files: collect items by tag across all projects
  yield* generateTagFiles(data, rendered, primaryMap)

  // User aggregate files: collect tasks assigned to each non-importing user
  yield* generateUserFiles(data, rendered, primaryMap, userSlugMap)
}

/**
 * Generate #tag.md aggregate files: one per tag, containing all tasks with that tag.
 * Only includes tags that appear on 2+ tasks (single-use tags aren't worth aggregating).
 */
function* generateTagFiles(
  data: ImportData,
  rendered: Set<string>,
  primaryMap: Map<string, string>,
): Generator<[string, string]> {
  // Collect items by tag
  const tagItems = new Map<string, ImportItem[]>()
  const collectByTag = (items: ImportItem[]): void => {
    for (const item of items) {
      if (item.tags?.length) {
        for (const tag of item.tags) {
          let list = tagItems.get(tag)
          if (!list) {
            list = []
            tagItems.set(tag, list)
          }
          list.push(item)
        }
      }
      if (item.children?.length) collectByTag(item.children)
    }
  }

  for (const proj of data.projects) {
    for (const item of proj.items ?? []) collectByTag([item])
    for (const sec of proj.sections ?? []) collectByTag(sec.items)
  }

  // Generate a file per tag (only for tags with 2+ unique items)
  for (const [tag, rawItems] of tagItems) {
    // Deduplicate: same task may appear in multiple sections
    const seen = new Set<string>()
    const items = rawItems.filter((item) => {
      if (seen.has(item.sourceId)) return false
      seen.add(item.sourceId)
      return true
    })
    if (items.length < 2) continue
    const counter: IdxCounter = { value: 0 }
    const nodes: KNode[] = []
    const fileId = `tag-${tag}`
    const tagSlug = slugify(tag)
    nodes.push(
      mkNode(counter, {
        id: fileId,
        type: "h",
        item: {},
        fstype: "mdfile",
        content: `#${tagSlug}`,
      }),
    )

    for (const item of items) {
      if (rendered.has(item.sourceId)) {
        // Embed reference: no content — TUI resolves display title from embed_of target.
        // See embed data model comment in itemToNodes cross-project dedup section.
        const status = toTaskStatus(item.status)
        nodes.push(
          mkNode(counter, {
            id: `tagref-${tag}-${item.sourceId}`,
            type: "h",
            item: { task: { marker: getMarkerForStatus(status), status } },
            parent_id: fileId,
            embed_of: `^${item.sourceId}`,
            created_at: item.createdAt ? new Date(item.createdAt).getTime() : undefined,
            updated_at: item.modifiedAt ? new Date(item.modifiedAt).getTime() : undefined,
          }),
        )
      } else {
        itemToNodes(counter, item, fileId, nodes, rendered, primaryMap)
      }
    }

    const markdown = nodesToMarkdown(nodes)
    const wsSlug = data.workspace ? slugify(data.workspace) : undefined
    const tagPath = wsSlug ? `${wsSlug}/tags/#${slugify(tag)}.md` : `#${slugify(tag)}.md`
    yield [tagPath, markdown]
  }
}

/**
 * Generate @user.md aggregate files for non-importing users.
 * Collects all tasks assigned to each user across projects as embed references.
 */
function* generateUserFiles(
  data: ImportData,
  rendered: Set<string>,
  primaryMap: Map<string, string>,
  userSlugMap: Map<string, string>,
): Generator<[string, string]> {
  if (!data.users?.length) return

  // Find the importing user's name to exclude them (they already have a top-level file)
  const importingUser = data.users.find((u) => u.gid === data.importingUserGid)
  const importingUserName = importingUser?.name

  // Collect items by assignee across all projects
  const userItems = new Map<string, ImportItem[]>()
  const collectByAssignee = (items: ImportItem[]): void => {
    for (const item of items) {
      if (item.assignee) {
        let list = userItems.get(item.assignee)
        if (!list) {
          list = []
          userItems.set(item.assignee, list)
        }
        list.push(item)
      }
      if (item.children?.length) collectByAssignee(item.children)
    }
  }

  for (const proj of data.projects) {
    for (const item of proj.items ?? []) collectByAssignee([item])
    for (const sec of proj.sections ?? []) collectByAssignee(sec.items)
  }

  const wsSlug = data.workspace ? slugify(data.workspace) : undefined

  for (const [assigneeName, rawItems] of userItems) {
    // Skip the importing user (already has a dedicated file)
    // Note: assigneeName is pre-slugified by task-transform (lowercase-hyphenated)
    const importingSlug = importingUserName
      ? (userSlugMap.get(importingUserName) ?? slugify(importingUserName))
      : undefined
    if (assigneeName === importingUserName || assigneeName === importingSlug) continue

    // Deduplicate
    const seen = new Set<string>()
    const items = rawItems.filter((item) => {
      if (seen.has(item.sourceId)) return false
      seen.add(item.sourceId)
      return true
    })
    if (items.length === 0) continue

    const userSlug = userSlugMap.get(assigneeName) ?? slugify(assigneeName)
    const counter: IdxCounter = { value: 0 }
    const nodes: KNode[] = []
    const fileId = `user-${userSlug}`
    nodes.push(
      mkNode(counter, {
        id: fileId,
        type: "h",
        item: {},
        fstype: "mdfile",
        content: `@${userSlug}`,
      }),
    )

    // Group items by assignee section (preserving order of first appearance)
    const sectionOrder: string[] = []
    const sectionGroups = new Map<string, ImportItem[]>()
    const unsectioned: ImportItem[] = []
    for (const item of items) {
      const sectionName = item.metadata?.assigneeSectionName as string | undefined
      if (sectionName) {
        let group = sectionGroups.get(sectionName)
        if (!group) {
          group = []
          sectionGroups.set(sectionName, group)
          sectionOrder.push(sectionName)
        }
        group.push(item)
      } else {
        unsectioned.push(item)
      }
    }

    const emitUserItem = (item: ImportItem, parentId: string): void => {
      if (rendered.has(item.sourceId)) {
        // Embed reference: no content — TUI resolves display title from embed_of target.
        // See embed data model comment in itemToNodes cross-project dedup section.
        const status = toTaskStatus(item.status)
        nodes.push(
          mkNode(counter, {
            id: `userref-${userSlug}-${item.sourceId}`,
            type: "h",
            item: { task: { marker: getMarkerForStatus(status), status } },
            parent_id: parentId,
            embed_of: `^${item.sourceId}`,
            created_at: item.createdAt ? new Date(item.createdAt).getTime() : undefined,
            updated_at: item.modifiedAt ? new Date(item.modifiedAt).getTime() : undefined,
          }),
        )
      } else {
        itemToNodes(counter, item, parentId, nodes, rendered, primaryMap)
      }
    }

    // Emit sectioned items under section headings
    for (const sectionName of sectionOrder) {
      const sectionId = `usersec-${userSlug}-${slugify(sectionName)}`
      nodes.push(
        mkNode(counter, {
          id: sectionId,
          type: "h",
          item: {},
          parent_id: fileId,
          fstype: "mdsection",
          content: sectionName,
          title: sectionName,
        }),
      )
      for (const item of sectionGroups.get(sectionName) ?? []) {
        emitUserItem(item, sectionId)
      }
    }

    // Emit unsectioned items directly under file root
    for (const item of unsectioned) {
      emitUserItem(item, fileId)
    }

    const markdown = nodesToMarkdown(nodes)
    const userPath = wsSlug ? `${wsSlug}/users/@${userSlug}.md` : `@${userSlug}.md`
    yield [userPath, markdown]
  }
}
