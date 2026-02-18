/**
 * Import Pipeline — Stage 2: Convert
 *
 * Converts ImportData → FileMap (slug → markdown content).
 * One markdown file per project, sections as H2 headings.
 */

import type { ImportData, ImportItem, ImportProject, ImportSection, FileMap } from "./types.ts"

/** Slugify a title for use as filename */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/**
 * Convert Asana task/project URLs to km block references.
 * Since each task has ^GID as its block ID, links become [[^GID]].
 * Formats: https://app.asana.com/0/PROJECT_GID/TASK_GID
 *          https://app.asana.com/1/WORKSPACE_GID/task/TASK_GID
 *          https://app.asana.com/1/WORKSPACE_GID/project/PROJECT_GID/task/TASK_GID
 */
function convertAsanaLinks(text: string): string {
  return text
    // /0/project/task format
    .replace(/https?:\/\/app\.asana\.com\/0\/\d+\/(\d+)(?:\/f)?/g, "[[^$1]]")
    // /1/workspace/task/id format
    .replace(/https?:\/\/app\.asana\.com\/1\/\d+\/task\/(\d+)(?:\?[^\s)]*)?/g, "[[^$1]]")
    // /1/workspace/project/pid/task/tid format
    .replace(/https?:\/\/app\.asana\.com\/1\/\d+\/project\/\d+\/task\/(\d+)(?:\?[^\s)]*)?/g, "[[^$1]]")
}

/** Format a compact reference to a task rendered elsewhere (GIDs are globally unique) */
function formatReference(item: ImportItem, indent: number): string {
  const prefix = "  ".repeat(indent)
  const marker = item.status === "done" ? "[x]" : "[ ]"
  return `${prefix}- ${marker} ${item.title} → [[^${item.sourceId}]]`
}

/** Format a single task item as a markdown line */
function formatItem(item: ImportItem, indent: number, rendered?: Set<string>, primaryMap?: Map<string, string>): string {
  // Multi-project dedup: if this task was already rendered in another project, emit reference
  if (rendered && primaryMap && item.sourceId && rendered.has(item.sourceId)) {
    return formatReference(item, indent)
  }
  if (rendered && item.sourceId) rendered.add(item.sourceId)
  const prefix = "  ".repeat(indent)
  const marker = item.milestone
    ? (item.status === "done" ? "[x]" : "[◆]")
    : (item.status === "done" ? "[x]" : "[ ]")
  const parts: string[] = [`${prefix}- ${marker} ${item.title}`]

  // Inline metadata (canonical key:: value format)
  if (item.assignee) parts.push(`@${item.assignee}`)
  if (item.dueAt) parts.push(`due:: ${item.dueAt.slice(0, 10)}`)
  if (item.startAt) parts.push(`start:: ${item.startAt.slice(0, 10)}`)
  if (item.createdAt) parts.push(`created:: ${item.createdAt.slice(0, 10)}`)
  if (item.completedAt) parts.push(`completed:: ${item.completedAt.slice(0, 10)}`)
  if (item.priority) parts.push(`p:: ${item.priority}`)
  if (item.tags?.length) parts.push(...item.tags.map((t) => `#${t}`))
  // Multi-project membership as +Project tags
  if (item.projects && item.projects.length > 1) {
    parts.push(...item.projects.map((p) => `+${slugify(p)}`))
  }
  // Block ID = Asana GID (makes task addressable via ^gid syntax)
  if (item.sourceId) parts.push(`^${item.sourceId}`)

  const lines: string[] = [parts.join(" ")]

  // Body, attachments, and comments in a blockquote (keeps them separate from subtask list)
  const bqLines: string[] = []

  if (item.body) {
    const bodyLines = convertAsanaLinks(item.body.trim()).split("\n")
    for (const line of bodyLines) {
      bqLines.push(line)
    }
  }

  // Attachments (prefer local path if downloaded)
  if (item.attachments?.length) {
    if (bqLines.length) bqLines.push("")
    for (const att of item.attachments) {
      const href = att.localPath ?? att.url
      if (att.type === "image") {
        bqLines.push(`![${att.name}](${href})`)
      } else {
        bqLines.push(`[${att.name}](${href})`)
      }
    }
  }

  // Comments
  if (item.comments?.length) {
    if (bqLines.length) bqLines.push("")
    bqLines.push("**Comments:**")
    for (const c of item.comments) {
      const date = c.createdAt.slice(0, 10)
      const author = c.author ? `@${c.author}` : ""
      const firstLine = c.text.split("\n")[0]!
      bqLines.push(`- ${date} ${author}: ${firstLine}`)
      // Multi-line comments: indent continuation lines
      const rest = c.text.split("\n").slice(1)
      for (const line of rest) {
        bqLines.push(`  ${line}`)
      }
    }
  }

  // Emit blockquote
  if (bqLines.length) {
    for (const line of bqLines) {
      lines.push(line ? `${prefix}  > ${line}` : `${prefix}  >`)
    }
  }

  // Recursive children
  if (item.children?.length) {
    for (const child of item.children) {
      lines.push(formatItem(child, indent + 1, rendered, primaryMap))
    }
  }

  return lines.join("\n")
}

/** Format a section as H2 + items */
function formatSection(section: ImportSection, rendered?: Set<string>, primaryMap?: Map<string, string>): string {
  const lines: string[] = [`## ${section.title}`, ""]
  for (const item of section.items) {
    lines.push(formatItem(item, 0, rendered, primaryMap))
  }
  return lines.join("\n")
}

/** Generate frontmatter for a project file */
function formatFrontmatter(project: ImportProject, source: string, fetchedAt: string): string {
  const lines = [
    "---",
    `imported_from: ${source}`,
    `imported_at: "${fetchedAt}"`,
    `${source}_project_id: "${project.sourceId}"`,
  ]
  if (project.workspace) lines.push(`workspace: "${project.workspace}"`)
  if (project.owner) lines.push(`owner: "${project.owner}"`)
  if (project.team) lines.push(`team: "${project.team}"`)
  if (project.createdAt) lines.push(`created_at: "${project.createdAt}"`)
  if (project.modifiedAt) lines.push(`modified_at: "${project.modifiedAt}"`)
  lines.push("---")
  return lines.join("\n")
}

/** Convert a single project to markdown */
function convertProject(
  project: ImportProject,
  source: string,
  fetchedAt: string,
  rendered?: Set<string>,
  primaryMap?: Map<string, string>,
): string {
  const parts: string[] = []

  parts.push(formatFrontmatter(project, source, fetchedAt))
  parts.push("")
  parts.push(`# ${project.title}`)

  // Sections
  if (project.sections?.length) {
    for (const section of project.sections) {
      parts.push("")
      parts.push(formatSection(section, rendered, primaryMap))
    }
  }

  // Loose items (not in any section)
  if (project.items?.length) {
    parts.push("")
    for (const item of project.items) {
      parts.push(formatItem(item, 0, rendered, primaryMap))
    }
  }

  return parts.join("\n") + "\n"
}

/** Collect all task sourceIds from a project, recursively including children */
function collectTaskIds(items: ImportItem[], out: string[]): void {
  for (const item of items) {
    if (item.sourceId) out.push(item.sourceId)
    if (item.children?.length) collectTaskIds(item.children, out)
  }
}

/** Convert ImportData to a map of relative file paths → markdown content */
export function convert(data: ImportData): FileMap {
  const files: FileMap = new Map()

  // Build primaryMap: task sourceId → filename of the first project that contains it
  const primaryMap = new Map<string, string>()
  const projectFilenames: string[] = []
  for (const project of data.projects) {
    const slug = slugify(project.title)
    const filename = `${project.sourceId}-${slug}.md`
    projectFilenames.push(filename)
    const ids: string[] = []
    if (project.sections?.length) {
      for (const section of project.sections) collectTaskIds(section.items, ids)
    }
    if (project.items?.length) collectTaskIds(project.items, ids)
    for (const id of ids) {
      if (!primaryMap.has(id)) primaryMap.set(id, filename)
    }
  }

  // Convert projects with dedup: first occurrence gets full content, rest get reference
  const rendered = new Set<string>()
  for (let i = 0; i < data.projects.length; i++) {
    const project = data.projects[i]!
    const filename = projectFilenames[i]!
    const content = convertProject(project, data.source, data.fetchedAt, rendered, primaryMap)
    files.set(filename, content)
  }

  return files
}
