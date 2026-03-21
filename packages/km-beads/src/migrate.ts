/**
 * Beads Migration
 *
 * Migrate issues from .beads/issues.jsonl to km markdown tasks.
 */

import { join, dirname } from "node:path"
import { createLogger } from "loggily"
import type { BeadsFs } from "./types.ts"
import { parseBeadsIssuesJsonl, type BeadsIssue } from "./schema.ts"

const log = createLogger("km:beads:migrate")

// Re-export for backwards compatibility
export type { BeadsIssue } from "./schema.ts"

/**
 * Find the .beads directory starting from a path
 */
export function findBeadsDir(fs: BeadsFs, startFrom?: string): string | null {
  let dir = startFrom || process.cwd()

  while (dir !== "/") {
    const beadsDir = join(dir, ".beads")
    if (fs.existsSync(beadsDir)) {
      return beadsDir
    }
    dir = dirname(dir)
  }

  return null
}

/**
 * Read issues from .beads/issues.jsonl with validation
 */
export function readBeadsIssues(fs: BeadsFs, beadsDir: string): BeadsIssue[] {
  const issuesPath = join(beadsDir, "issues.jsonl")
  if (!fs.existsSync(issuesPath)) {
    return []
  }

  const content = fs.readFileSync(issuesPath, "utf-8")
  const { issues, errors } = parseBeadsIssuesJsonl(content)

  // Log validation errors but don't fail - allows partial recovery
  if (errors.length > 0) {
    log.warn?.(`Skipped ${errors.length} malformed lines in ${issuesPath}`)
  }

  return issues
}

/**
 * Convert beads status to task mark
 */
function statusToMark(status: BeadsIssue["status"]): string {
  switch (status) {
    case "open":
      return " "
    case "in_progress":
      return "/"
    case "closed":
      return "x"
    case "blocked":
      return "!"
    default:
      return " "
  }
}

/**
 * Convert beads issue to markdown content
 *
 * Format: Status expressed via task mark in heading, type/priority via tags
 *
 * ```markdown
 * ---
 * id: km-01c
 * created_by: beorn
 * created_at: 2024-01-15T...
 * ---
 *
 * # [x] Title @issue #feature #P2
 *
 * Description...
 * ```
 */
export function issueToMarkdown(issue: BeadsIssue, boardTag?: string): string {
  const lines: string[] = []

  // Frontmatter - only essential metadata (status/type/priority now in heading)
  lines.push("---")
  lines.push(`id: ${issue.id}`)
  if (issue.created_by) {
    lines.push(`created_by: ${issue.created_by}`)
  }
  lines.push(`created_at: ${issue.created_at}`)
  if (issue.closed_at) {
    lines.push(`closed_at: ${issue.closed_at}`)
  }
  if (issue.close_reason) {
    lines.push(`close_reason: "${issue.close_reason.replace(/"/g, '\\"')}"`)
  }
  if (issue.blocked_by && issue.blocked_by.length > 0) {
    lines.push(`blocked_by: [${issue.blocked_by.map((b) => `"${b}"`).join(", ")}]`)
  }
  if (issue.parent_id) {
    lines.push(`parent_id: ${issue.parent_id}`)
  }
  lines.push("---")
  lines.push("")

  // Build tags for heading
  const tags: string[] = []
  if (boardTag) {
    tags.push(`@${boardTag}`)
  }
  if (issue.issue_type) {
    tags.push(`#${issue.issue_type}`)
  }
  tags.push(`#${issue.priority}`)
  if (issue.labels) {
    tags.push(...issue.labels.map((l) => `#${l}`))
  }
  if (issue.assignee) {
    tags.push(`@${issue.assignee}`)
  }

  // Title as h1 with task mark and tags
  const mark = statusToMark(issue.status)
  const tagStr = tags.length > 0 ? ` ${tags.join(" ")}` : ""
  lines.push(`# [${mark}] ${issue.title}${tagStr}`)
  lines.push("")

  // Description
  if (issue.description) {
    lines.push(issue.description)
  }

  return lines.join("\n")
}

/**
 * Generate a safe filename from issue title
 */
function _slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
}

export interface MigrateOptions {
  /** Directory to write markdown files to */
  targetDir: string
  /** Board tag to add to issues (e.g., "issue") */
  boardTag?: string
  /** Only migrate issues with these statuses */
  statusFilter?: string[]
  /** Dry run - don't write files */
  dryRun?: boolean
  /** Filesystem implementation (DI - avoids direct node:fs import) */
  fs: BeadsFs
}

export interface MigrateResult {
  migrated: number
  skipped: number
  errors: string[]
  files: string[]
}

/**
 * Migrate issues from .beads/issues.jsonl to markdown files
 */
export function migrateBeadsToMarkdown(beadsDir: string, options: MigrateOptions): MigrateResult {
  const { fs } = options
  const issues = readBeadsIssues(fs, beadsDir)
  const result: MigrateResult = {
    migrated: 0,
    skipped: 0,
    errors: [],
    files: [],
  }

  // Filter by status if specified
  let filtered = issues
  if (options.statusFilter && options.statusFilter.length > 0) {
    const { statusFilter } = options
    filtered = issues.filter((i) => statusFilter.includes(i.status))
  }

  // Ensure target directory exists
  if (!options.dryRun && !fs.existsSync(options.targetDir)) {
    fs.mkdirSync(options.targetDir, { recursive: true })
  }

  for (const issue of filtered) {
    try {
      const filename = `${issue.id}.md`
      const filepath = join(options.targetDir, filename)

      // Skip if file already exists
      if (fs.existsSync(filepath)) {
        result.skipped++
        continue
      }

      const content = issueToMarkdown(issue, options.boardTag)

      if (!options.dryRun) {
        fs.writeFileSync(filepath, content, "utf-8")
      }

      result.migrated++
      result.files.push(filepath)
    } catch (error) {
      result.errors.push(`${issue.id}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return result
}

/**
 * Get migration stats without migrating
 */
export function getMigrationStats(
  fs: BeadsFs,
  beadsDir: string,
): {
  total: number
  byStatus: Record<string, number>
  byType: Record<string, number>
} {
  const issues = readBeadsIssues(fs, beadsDir)

  const byStatus: Record<string, number> = {}
  const byType: Record<string, number> = {}

  for (const issue of issues) {
    byStatus[issue.status] = (byStatus[issue.status] || 0) + 1
    const type = issue.issue_type || "task"
    byType[type] = (byType[type] || 0) + 1
  }

  return {
    total: issues.length,
    byStatus,
    byType,
  }
}
