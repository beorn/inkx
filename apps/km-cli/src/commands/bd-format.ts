/**
 * Beads Formatting Functions
 *
 * Pure functions for formatting issue data for CLI output.
 */

import { createTerm } from "@silvery/ag-react"

const term = createTerm(process)
import type { Issue } from "@km/beads"

/**
 * Convert internal status to bd-compatible status string
 */
function bdStatus(status: Issue["status"]): string {
  switch (status) {
    case "todo":
      return "open"
    case "wip":
      return "in_progress"
    case "blocked":
      return "blocked"
    case "done":
      return "closed"
    case "dropped":
      return "dropped"
  }
}

/**
 * Format timestamp as bd-compatible date string
 */
function formatDate(ts: number): string {
  const d = new Date(ts)
  return d.toISOString().replace("T", " ").slice(0, 16)
}

/**
 * Convert Issue to bd-compatible JSON format
 */
export function issueToBdJson(issue: Issue): Record<string, unknown> {
  return {
    id: issue.shortId,
    title: issue.title,
    description: issue.description || "",
    status: bdStatus(issue.status),
    priority: issue.priority,
    issue_type: issue.type || "task",
    created_at: new Date(issue.createdAt).toISOString(),
    created_by: issue.createdBy || "unknown",
    updated_at: new Date(issue.updatedAt).toISOString(),
    path: issue.path,
    parent_context: issue.parentContext,
    dependency_count: issue.dependencyCount || 0,
    dependent_count: issue.dependentCount || 0,
  }
}

/**
 * Print issue in bd list format: km-abc1 [P2] [task] open - Title
 */
export function printIssue(issue: Issue): void {
  const status = bdStatus(issue.status)
  const type = issue.type || "task"
  const location = issue.parentContext ? term.dim(` (${issue.parentContext})`) : ""
  console.log(`${term.cyan(issue.shortId)} [P${issue.priority}] [${type}] ${status} - ${issue.title}${location}`)
}

/**
 * Print issue in bd ready format: 1. [P0] [task] km-abc1: Title
 */
export function printReadyIssue(issue: Issue, index: number): void {
  const type = issue.type || "task"
  const location = issue.parentContext ? term.dim(` (${issue.parentContext})`) : ""
  console.log(`${index}. [P${issue.priority}] [${type}] ${term.cyan(issue.shortId)}: ${issue.title}${location}`)
}

/**
 * Print issue details in bd show format
 */
export function printIssueDetails(issue: Issue): void {
  console.log(`${term.bold(issue.shortId)}: ${issue.title}`)
  console.log(`Status: ${bdStatus(issue.status)}`)
  console.log(`Priority: P${issue.priority}`)
  console.log(`Type: ${issue.type || "task"}`)
  console.log(`Created: ${formatDate(issue.createdAt)}`)
  if (issue.createdBy) console.log(`Created by: ${issue.createdBy}`)
  console.log(`Updated: ${formatDate(issue.updatedAt)}`)

  if (issue.path) {
    console.log(`Path: ${issue.path}`)
  }
  if (issue.parentContext) {
    console.log(`Context: ${issue.parentContext}`)
  }

  if (issue.assignee) {
    console.log(`Assignee: @${issue.assignee}`)
  }

  if (issue.blockedBy && issue.blockedBy.length > 0) {
    console.log(`\nBlocked by (${issue.blockedBy.length}):`)
    for (const dep of issue.blockedBy) {
      console.log(`  ↳ ${dep}`)
    }
  }

  if (issue.description && issue.description !== issue.title) {
    console.log(`\nDescription:\n${issue.description}`)
  }
}
