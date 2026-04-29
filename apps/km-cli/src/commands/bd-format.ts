/**
 * Beads Formatting Functions
 *
 * Pure functions for formatting issue data for CLI output.
 */

import { createTerm } from "@silvery/ag-react"

const term = createTerm(process)
import { displayId, type Issue } from "@km/beads"

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
 * Convert Issue to bd-compatible JSON format
 */
export function issueToBdJson(issue: Issue): Record<string, unknown> {
  return {
    id: displayId(issue),
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
  console.log(`${term.cyan(displayId(issue))} [${issue.priority}] [${type}] ${status} - ${issue.title}${location}`)
}

/**
 * Print issue in bd ready format: 1. [P0] [task] km-abc1: Title
 */
export function printReadyIssue(issue: Issue, index: number): void {
  const type = issue.type || "task"
  const location = issue.parentContext ? term.dim(` (${issue.parentContext})`) : ""
  console.log(`${index}. [${issue.priority}] [${type}] ${term.cyan(displayId(issue))}: ${issue.title}${location}`)
}
