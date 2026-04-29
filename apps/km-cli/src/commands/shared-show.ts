/**
 * Shared "show details" helper for `bd show` and `tasks <id>`.
 *
 * Both subcommands display a single node — bd as an issue (priority chip,
 * blocked-by section, status mapped to bd terms) and tasks as a task
 * (raw status, no #P0 chip). The two views read the same fields off the
 * same KNode; only formatting differs.
 *
 * The pipeline is:
 *
 *   KNode ──► nodeToIssue() ──► Issue ──► render
 *
 * Routing both modes through `nodeToIssue` means anything the bead layer
 * learns to extract (assignee normalization, blocked-by resolution,
 * priority canonicalization) is automatically picked up by task mode too.
 */

import { createTerm } from "@silvery/ag-react"
import { nodeToIssue, type Issue } from "@km/beads"
import type { KNode } from "@km/core"
import type { Repo } from "@km/storage"

const term = createTerm(process)

/** Mode flag — bd-style issue formatting vs task-style formatting. */
export interface PrintTaskDetailsOptions {
  /** When true, format as a bd issue (priority chip, status mapped to bd terms). */
  bd?: boolean
  /** When true, dump JSON instead of human-readable output. */
  json?: boolean
}

/**
 * Map an Issue status to the bd-compatible status string used in
 * `bd show` / `bd list` output.
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

/** Format an epoch-ms timestamp as bd's `YYYY-MM-DD HH:MM` form. */
function formatDate(ts: number): string {
  return new Date(ts).toISOString().replace("T", " ").slice(0, 16)
}

/**
 * Render an Issue in bd-show format — full path, blocked-by section, etc.
 * Extracted so callers that already have an `Issue` (e.g. JSON callers via
 * issueToBdJson) can render without going through nodeToIssue twice.
 */
function renderBd(issue: Issue): void {
  console.log(`${term.bold(issue.shortId)}: ${issue.title}`)
  console.log(`Status: ${bdStatus(issue.status)}`)
  console.log(`Priority: ${issue.priority}`)
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

/**
 * Render an Issue in task format — raw status, no priority chip, no
 * bd-flavored term mapping. Reads from the same Issue shape as bd mode so
 * any extraction improvement to nodeToIssue benefits both views.
 */
function renderTask(node: KNode, issue: Issue): void {
  console.log(`${term.bold("Task:")} ${issue.title}`)
  console.log(`${term.dim("ID:")} ${issue.shortId}`)
  console.log(`${term.dim("Status:")} ${node.item?.task?.status ?? "todo"}`)
  if (node.priority || (issue.priority && issue.priority !== "P2")) {
    // Show the structural priority verbatim — no "P2 default" injection.
    // (nodeToIssue defaults priority to "P2"; we only show it if the
    // node actually carries one, to avoid a misleading "Priority: P2" on
    // tasks that never declared one.)
    if (node.priority) console.log(`${term.dim("Priority:")} ${node.priority}`)
  }
  if (issue.assignee) {
    console.log(`${term.dim("Assigned:")} ${issue.assignee}`)
  }
  if (node.due_at) {
    console.log(`${term.dim("Due:")} ${node.due_at}`)
  }
  if (node.start_at) {
    console.log(`${term.dim("Start:")} ${node.start_at}`)
  }
  if (issue.path) {
    console.log(`${term.dim("Path:")} ${issue.path}`)
  }
  if (issue.parentContext) {
    console.log(`${term.dim("Context:")} ${issue.parentContext}`)
  }
  console.log(`${term.dim("Created:")} ${formatDate(issue.createdAt)}`)
  console.log(`${term.dim("Updated:")} ${formatDate(issue.updatedAt)}`)

  if (issue.blockedBy && issue.blockedBy.length > 0) {
    console.log(`\n${term.dim(`Blocked by (${issue.blockedBy.length}):`)}`)
    for (const dep of issue.blockedBy) {
      console.log(`  ↳ ${dep}`)
    }
  }

  if (issue.description && issue.description !== issue.title) {
    console.log(`\n${term.dim("Description:")}\n${issue.description}`)
  }
}

/**
 * Print task / issue details for a single node.
 *
 * Both `bd show <id>` and `tasks <id>` route through this helper so the
 * field set stays in sync between the two views; formatting branches on
 * `opts.bd`.
 */
export function printTaskDetails(repo: Repo, node: KNode, opts: PrintTaskDetailsOptions = {}): void {
  const issue = nodeToIssue(node, { repo })

  if (opts.json) {
    console.log(JSON.stringify(issue, null, 2))
    return
  }

  if (opts.bd) {
    renderBd(issue)
  } else {
    renderTask(node, issue)
  }
}
