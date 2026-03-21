/**
 * Beads Sync/Export
 *
 * Export km markdown tasks to .beads/issues.jsonl format for bd compatibility.
 */

import { join } from "node:path"
import { createLogger } from "loggily"
import type { Issue, BeadsFs } from "./types.ts"
import { parseBeadsIssuesJsonl, type BeadsIssue } from "./schema.ts"

const log = createLogger("km:beads:sync")

/**
 * Convert km status to beads status
 */
function convertStatus(status: Issue["status"]): BeadsIssue["status"] {
  switch (status) {
    case "todo":
      return "open"
    case "wip":
      return "in_progress"
    case "done":
    case "dropped":
      return "closed"
    case "blocked":
      return "blocked"
    default:
      return "open"
  }
}

/**
 * Convert km Issue to beads JSONL format
 */
export function issueToBeadsJson(issue: Issue): BeadsIssue {
  const beadsIssue: BeadsIssue = {
    id: issue.shortId,
    title: issue.title,
    status: convertStatus(issue.status),
    priority: issue.priority,
    created_at: new Date(issue.createdAt).toISOString(),
    updated_at: new Date(issue.updatedAt).toISOString(),
  }

  if (issue.description && issue.description !== issue.title) {
    beadsIssue.description = issue.description
  }

  if (issue.type) {
    beadsIssue.issue_type = issue.type
  }

  if (issue.assignee) {
    beadsIssue.assignee = issue.assignee
  }

  if (issue.createdBy) {
    beadsIssue.created_by = issue.createdBy
  }

  if (issue.blockedBy && issue.blockedBy.length > 0) {
    beadsIssue.blocked_by = issue.blockedBy
  }

  // Handle closed/dropped status
  if (issue.status === "done" || issue.status === "dropped") {
    beadsIssue.closed_at = new Date(issue.updatedAt).toISOString()
    if (issue.status === "dropped") {
      beadsIssue.close_reason = "Dropped"
    }
  }

  return beadsIssue
}

export interface SyncOptions {
  /** Path to .beads directory */
  beadsDir: string
  /** Whether to append or replace */
  mode: "append" | "replace"
  /** Dry run - don't write files */
  dryRun?: boolean
  /** Filesystem implementation (DI - avoids direct node:fs import) */
  fs: BeadsFs
}

export interface SyncResult {
  exported: number
  errors: string[]
  outputPath: string
}

/**
 * Export km issues to .beads/issues.jsonl
 */
export function exportToBeads(issues: Issue[], options: SyncOptions): SyncResult {
  const result: SyncResult = {
    exported: 0,
    errors: [],
    outputPath: join(options.beadsDir, "issues.jsonl"),
  }

  const { fs } = options

  // Ensure .beads directory exists
  if (!options.dryRun && !fs.existsSync(options.beadsDir)) {
    fs.mkdirSync(options.beadsDir, { recursive: true })
  }

  // Read existing issues if appending (with validation)
  let existingIssues: BeadsIssue[] = []
  if (options.mode === "append" && fs.existsSync(result.outputPath)) {
    const content = fs.readFileSync(result.outputPath, "utf-8")
    const { issues, errors } = parseBeadsIssuesJsonl(content)
    existingIssues = issues
    // Log validation errors but continue - allows partial recovery
    if (errors.length > 0) {
      log.warn?.(`Skipped ${errors.length} malformed lines in existing issues`)
    }
  }

  // Convert issues to beads format
  const beadsIssues: BeadsIssue[] = []
  const existingIds = new Set(existingIssues.map((i) => i.id))

  for (const issue of issues) {
    try {
      const beadsIssue = issueToBeadsJson(issue)

      // Skip if already exists in append mode
      if (options.mode === "append" && existingIds.has(beadsIssue.id)) {
        continue
      }

      beadsIssues.push(beadsIssue)
      result.exported++
    } catch (error) {
      result.errors.push(`${issue.shortId}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  if (!options.dryRun) {
    // Combine existing and new issues
    const allIssues = options.mode === "append" ? [...existingIssues, ...beadsIssues] : beadsIssues

    // Write JSONL
    const content = allIssues.map((i) => JSON.stringify(i)).join("\n") + "\n"
    fs.writeFileSync(result.outputPath, content, "utf-8")
  }

  return result
}

/**
 * Sync both directions - merge km issues with beads issues
 */
export interface BidirectionalSyncResult {
  kmToBeads: number
  beadsToKm: number
  conflicts: Array<{ id: string; kmUpdated: number; beadsUpdated: string }>
}

/**
 * Compare timestamps to find which version is newer
 */
export function findConflicts(
  kmIssues: Issue[],
  beadsIssues: BeadsIssue[],
): Array<{
  id: string
  kmUpdated: number
  beadsUpdated: string
  kmIssue: Issue
  beadsIssue: BeadsIssue
}> {
  const conflicts: Array<{
    id: string
    kmUpdated: number
    beadsUpdated: string
    kmIssue: Issue
    beadsIssue: BeadsIssue
  }> = []

  const beadsById = new Map(beadsIssues.map((i) => [i.id, i]))

  for (const kmIssue of kmIssues) {
    const beadsIssue = beadsById.get(kmIssue.shortId)
    if (beadsIssue) {
      const kmTime = kmIssue.updatedAt
      const beadsTime = new Date(beadsIssue.updated_at).getTime()

      // If timestamps differ by more than 1 second, it's a potential conflict
      if (Math.abs(kmTime - beadsTime) > 1000) {
        conflicts.push({
          id: kmIssue.shortId,
          kmUpdated: kmTime,
          beadsUpdated: beadsIssue.updated_at,
          kmIssue,
          beadsIssue,
        })
      }
    }
  }

  return conflicts
}
