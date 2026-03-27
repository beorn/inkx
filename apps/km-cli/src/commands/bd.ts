/**
 * Beads Command (bd)
 *
 * Issue tracking integrated with km storage.
 * Thin CLI wrapper around @km/beads package.
 */

import { Command, int } from "@silvery/commander"
import { createTerm } from "@silvery/ag-react"

const term = createTerm(process)
import {
  queryReady,
  queryIssues,
  nodeToIssue,
  createIssueNode,
  updateIssueFields,
  closeIssueFields,
  dropIssueFields,
  addDependency,
  removeDependency,
  getDependencies,
  mergeDepProps,
  type Issue,
  type IssueFilter,
} from "@km/beads"
import { resolvePathArg, loadConfigObject } from "@km/storage"
import { loadRepo } from "../load-repo.ts"
import { join } from "path"
import { existsSync } from "fs"

// Import from extracted modules
import { issueToBdJson, printIssue, printReadyIssue, printIssueDetails } from "./bd-format.ts"
import { resolveIssueArg } from "./bd-query-helpers.ts"
import { configCommand } from "./bd-config.ts"
import { migrateCommand, exportCommand } from "./bd-migrate.ts"
import { buildQueryString, type SharedQueryFlags } from "./shared-query.ts"

/** Format scope/board context for display messages (e.g., " in path" or " on @board") */
function formatScopeMessage(scopePath?: string, boardTag?: string): string {
  return scopePath ? ` in ${scopePath}` : boardTag ? ` on @${boardTag}` : ""
}

// Commander option interfaces
interface ReadyOptions {
  type?: string
  assignee?: string
  priority?: string
  all?: boolean
  json?: boolean
}

interface ListOptions {
  status?: string
  type?: string
  assignee?: string
  priority?: string
  blocked?: boolean
  unblocked?: boolean
  all?: boolean
  json?: boolean
}

export const bdCommand = new Command("bd")
  .description("Issue tracking (beads-compatible)")
  .addHelpSection(
    "Note:",
    "Markdown tasks ARE the issues. Queries filter to @issue by default.\nSee 'km bd config' to customize, 'km bd info' for stats.",
  )
  .allowUnknownOption(false)

// bd ready [scope] - Find available work
bdCommand
  .command("ready [scope]")
  .description("List ready issues (unblocked, todo status)")
  .option("-t, --type <type>", "Filter by issue type (bug, feature, etc.)")
  .option("-a, --assignee <name>", "Filter by assignee")
  .option("-p, --priority <value>", "Filter by priority (e.g. P1, P2, or 0-4)")
  .option("--all", "Show all tasks (ignore board filter)")
  .option("--json", "Output as JSON")
  // oxlint-disable-next-line complexity/complexity -- CLI info display with config/stats sections
  .action(async (scope: string | undefined, opts: ReadyOptions) => {
    const resolved = resolvePathArg(scope)
    const scopePath = resolved.nodeRef ?? undefined
    const configObj = loadConfigObject(resolved.repoRoot)

    using repo = await loadRepo(resolved.repoRoot)

    const filter: Partial<IssueFilter> = {}
    if (opts.type) filter.type = opts.type
    if (opts.assignee) filter.assignee = opts.assignee
    if (opts.priority !== undefined) filter.priority = opts.priority

    // Use board filter from config unless --all or explicit scope given
    const boardTag = (opts.all ?? scope) ? undefined : configObj.beads.board || undefined
    const issues = queryReady(filter, scopePath, boardTag, { repo })

    if (opts.json) {
      console.log(JSON.stringify(issues.map(issueToBdJson), null, 2))
      return
    }

    if (issues.length === 0) {
      console.log(term.yellow(`No ready issues found${formatScopeMessage(scopePath, boardTag)}.`))
      return
    }

    const scopeMsg = formatScopeMessage(scopePath, boardTag)
    console.log(term.bold(`📋 Ready work (${issues.length} issues with no blockers${scopeMsg}):\n`))
    issues.forEach((issue, i) => {
      printReadyIssue(issue, i + 1)
    })
  })

// bd list [query...] - List issues with filters
bdCommand
  .command("list [query...]")
  .description("List issues with optional filters or raw DSL query")
  .option("-s, --status <status>", "Filter by status (todo,wip,blocked,done,dropped)")
  .option("-t, --type <type>", "Filter by issue type")
  .option("-a, --assignee <name>", "Filter by assignee")
  .option("-p, --priority <value>", "Filter by priority (e.g. P1, P2, or 0-4)")
  .option("--blocked", "Show only blocked issues")
  .option("--unblocked", "Show only unblocked issues")
  .option("--all", "Show all tasks (ignore board filter)")
  .option("--json", "Output as JSON")
  .action(async (queryParts: string[], opts: ListOptions) => {
    const positionalQuery = queryParts.length > 0 ? queryParts.join(" ") : undefined

    // Detect if positional arg looks like a path (backward compat with old [scope])
    const isPath =
      positionalQuery &&
      (positionalQuery.startsWith("/") || positionalQuery.startsWith(".") || positionalQuery.startsWith("~"))

    if (isPath) {
      // Legacy path-based scope — use old behavior
      const resolved = resolvePathArg(positionalQuery)
      const scopePath = resolved.nodeRef ?? undefined
      const configObj = loadConfigObject(resolved.repoRoot)

      using repo = await loadRepo(resolved.repoRoot)

      const filter: IssueFilter = {}
      if (opts.status) filter.status = opts.status.split(",")
      if (opts.type) filter.type = opts.type
      if (opts.assignee) filter.assignee = opts.assignee
      if (opts.priority !== undefined) filter.priority = opts.priority
      if (opts.blocked) filter.blocked = true
      if (opts.unblocked) filter.blocked = false

      const boardTag = (opts.all ?? positionalQuery) ? undefined : configObj.beads.board || undefined
      const issues = queryIssues(filter, scopePath, boardTag, { repo })

      if (opts.json) {
        console.log(JSON.stringify(issues.map(issueToBdJson), null, 2))
        return
      }

      if (issues.length === 0) {
        console.log(term.yellow(`No issues found${formatScopeMessage(scopePath, boardTag)}.`))
        return
      }

      const scopeMsg = formatScopeMessage(scopePath, boardTag)
      console.log(term.bold(`Issues (${issues.length}${scopeMsg}):\n`))
      for (const issue of issues) {
        printIssue(issue)
      }
      return
    }

    // New unified query path
    const resolved = resolvePathArg(undefined)
    const configObj = loadConfigObject(resolved.repoRoot)

    using repo = await loadRepo(resolved.repoRoot)

    // Build query from board config + flags
    const boardTag = opts.all ? undefined : configObj.beads.board || undefined
    const flags: SharedQueryFlags = opts
    const queryStr = buildQueryString(positionalQuery, flags, { boardTag })

    const nodes = repo.query(queryStr)
    let issues = nodes.map((n) => nodeToIssue(n, { repo }))

    // Apply blocked/unblocked filter (not part of query DSL)
    if (opts.blocked) {
      issues = issues.filter((i) => i.blockedBy && i.blockedBy.length > 0)
    }
    if (opts.unblocked) {
      issues = issues.filter((i) => !i.blockedBy || i.blockedBy.length === 0)
    }

    if (opts.json) {
      console.log(JSON.stringify(issues.map(issueToBdJson), null, 2))
      return
    }

    if (issues.length === 0) {
      console.log(term.yellow("No issues found."))
      return
    }

    console.log(term.bold(`Issues (${issues.length}):\n`))
    for (const issue of issues) {
      printIssue(issue)
    }
  })

// bd show [id] - Show issue details
const showCmd = bdCommand
  .command("show [id]")
  .description("Show issue details")
  .option("--json", "Output as JSON")
  .action(async (id, opts) => {
    if (!id) {
      showCmd.outputHelp()
      return
    }

    const resolved = resolvePathArg(undefined)
    using repo = await loadRepo(resolved.repoRoot)
    const issue = resolveIssueArg(repo, id)

    if (!issue) {
      console.error(term.red(`Issue not found: ${id}`))
      process.exitCode = 1
      return
    }

    if (opts.json) {
      console.log(JSON.stringify(issueToBdJson(issue), null, 2))
      return
    }

    printIssueDetails(issue)
  })

// bd create <title> - Create a new issue
bdCommand
  .command("create <title>")
  .description("Create a new issue")
  .option("-t, --type <type>", "Issue type (bug, feature, epic, task, docs)")
  .option("-p, --priority <value>", "Priority (e.g. P0-P4 or 0-4, default: P2)")
  .option("-a, --assignee <name>", "Assign to person")
  .option("-l, --label <labels...>", "Add labels")
  .option("-d, --description <text>", "Issue description")
  .option("-n, --notes <text>", "Additional notes")
  .option("--id <custom>", "Custom short ID")
  .option("--parent <id>", "Parent issue for sub-issues")
  .option("--json", "Output as JSON")
  .action(async (title, opts) => {
    const resolved = resolvePathArg(undefined)
    const configObj = loadConfigObject(resolved.repoRoot)
    using repo = await loadRepo(resolved.repoRoot)

    const { node, shortId, children } = createIssueNode(title, {
      type: opts.type,
      priority: opts.priority,
      assignee: opts.assignee,
      labels: opts.label,
      customId: opts.id,
      parentId: opts.parent,
      description: opts.description,
      notes: opts.notes,
    })

    // Resolve parent: explicit --parent flag, or config default
    const parentRef = opts.parent || configObj.beads.parent
    let parentId: string | null = null
    if (parentRef) {
      const parentNode = repo.resolveNode(parentRef)
      if (parentNode) {
        parentId = parentNode.id
      } else {
        console.error(term.red(`Parent not found: ${parentRef}`))
        process.exitCode = 1
        return
      }
    }

    const nodeId = repo.addNode(parentId, node)

    // Add description/notes as child paragraph nodes
    for (const child of children) {
      child.parent_id = nodeId
      repo.addNode(nodeId, child)
    }

    if (opts.json) {
      console.log(JSON.stringify({ shortId, node }, null, 2))
      return
    }

    console.log(term.green(`Created issue: ${shortId}`))
    console.log(`Title: ${title}`)
    if (opts.type) console.log(`Type: ${opts.type}`)
    console.log(`Priority: ${opts.priority ?? "P2"}`)
    if (opts.description)
      console.log(`Description: ${opts.description.slice(0, 60)}${opts.description.length > 60 ? "..." : ""}`)
  })

// bd update [id] - Update issue fields
const updateCmd = bdCommand
  .command("update [id]")
  .description("Update issue fields")
  .option("-s, --status <status>", "Set status (todo, wip, blocked, done, dropped)")
  .option("-p, --priority <value>", "Set priority (e.g. P0-P4 or 0-4)")
  .option("-a, --assignee <name>", "Set assignee")
  .option("-t, --title <title>", "Set title")
  .option("-d, --description <text>", "Set description (replaces first child paragraph)")
  .option("-n, --notes <text>", "Append notes (adds child paragraph)")
  .option("--type <type>", "Set issue type")
  .option("--claim", "Claim issue (set status=wip + assignee to you)")
  .action(async (id, opts) => {
    if (!id) {
      updateCmd.outputHelp()
      return
    }

    const resolved = resolvePathArg(undefined)
    using repo = await loadRepo(resolved.repoRoot)
    const issue = resolveIssueArg(repo, id)
    if (!issue) {
      console.error(term.red(`Issue not found: ${id}`))
      process.exitCode = 1
      return
    }

    // Handle --claim: set status + assignee atomically
    if (opts.claim) {
      let gitUser = "unknown"
      try {
        const { execSync } = await import("child_process")
        gitUser = execSync("git config user.name", { encoding: "utf-8" }).trim()
      } catch {}
      opts.status = opts.status ?? "wip"
      opts.assignee = opts.assignee ?? gitUser
    }

    const changes: Parameters<typeof updateIssueFields>[1] = {}
    if (opts.status) changes.status = opts.status as Issue["status"]
    if (opts.priority !== undefined) changes.priority = opts.priority
    if (opts.assignee) changes.assignee = opts.assignee
    if (opts.title) changes.title = opts.title
    if (opts.type) changes.type = opts.type

    const updates = updateIssueFields(issue, changes)
    repo.updateNode(issue.id, updates)

    // Handle --description: replace or create first child paragraph
    if (opts.description) {
      const children = repo.getChildren(issue.id)
      const firstParagraph = children.find((c) => c.type === "p" && !c.task_status)
      if (firstParagraph) {
        repo.updateNode(firstParagraph.id, { content: opts.description, updated_at: Date.now() })
      } else {
        repo.addNode(issue.id, {
          type: "p",
          content: opts.description,
          created_at: Date.now(),
          updated_at: Date.now(),
        })
      }
    }

    // Handle --notes: append as new child paragraph
    if (opts.notes) {
      repo.addNode(issue.id, {
        type: "p",
        content: opts.notes,
        created_at: Date.now(),
        updated_at: Date.now(),
      })
    }

    console.log(term.green(`Updated ${issue.shortId}:`))
    if (opts.claim) console.log(`  Claimed by ${opts.assignee}`)
    if (updates.task_status && !opts.claim) console.log(`  Status: ${updates.task_status}`)
    if (updates.priority !== undefined) console.log(`  Priority: ${updates.priority}`)
    if (updates.content) console.log(`  Title: ${updates.content}`)
    if (opts.description) console.log(`  Description updated`)
    if (opts.notes) console.log(`  Notes appended`)
  })

// bd close [id] - Close an issue
const closeCmd = bdCommand
  .command("close [id]")
  .description("Close an issue (mark as done)")
  .option("-r, --reason <reason>", "Close reason")
  .action(async (id, opts) => {
    if (!id) {
      closeCmd.outputHelp()
      return
    }

    const resolved = resolvePathArg(undefined)
    using repo = await loadRepo(resolved.repoRoot)
    const issue = resolveIssueArg(repo, id)
    if (!issue) {
      console.error(term.red(`Issue not found: ${id}`))
      process.exitCode = 1
      return
    }

    const updates = closeIssueFields(opts.reason)
    repo.updateNode(issue.id, updates)

    console.log(term.green(`Closed ${issue.shortId}`))
    if (opts.reason) console.log(term.dim(`Reason: ${opts.reason}`))
  })

// bd drop [id] - Drop an issue
const dropCmd = bdCommand
  .command("drop [id]")
  .description("Drop an issue (mark as won't do)")
  .option("-r, --reason <reason>", "Drop reason")
  .action(async (id, opts) => {
    if (!id) {
      dropCmd.outputHelp()
      return
    }

    const resolved = resolvePathArg(undefined)
    using repo = await loadRepo(resolved.repoRoot)
    const issue = resolveIssueArg(repo, id)
    if (!issue) {
      console.error(term.red(`Issue not found: ${id}`))
      process.exitCode = 1
      return
    }

    const updates = dropIssueFields(opts.reason)
    repo.updateNode(issue.id, updates)

    console.log(term.yellow(`Dropped ${issue.shortId}`))
    if (opts.reason) console.log(term.dim(`Reason: ${opts.reason}`))
  })

// bd dep - Manage dependencies
const depCommand = new Command("dep").description("Manage issue dependencies")

const depAddCmd = depCommand
  .command("add [id] [depends-on]")
  .description("Add a dependency (issue is blocked by depends-on)")
  .action(async (id, dependsOn) => {
    if (!id || !dependsOn) {
      depAddCmd.outputHelp()
      return
    }

    const resolved = resolvePathArg(undefined)
    using repo = await loadRepo(resolved.repoRoot)
    const issue = resolveIssueArg(repo, id)
    if (!issue) {
      console.error(term.red(`Issue not found: ${id}`))
      process.exitCode = 1
      return
    }

    const props = addDependency(issue, dependsOn)
    const node = repo.getNode(issue.id)
    repo.updateNode(issue.id, { data: mergeDepProps(node?.data as Record<string, unknown> | undefined, props) })

    console.log(term.green(`Added dependency: ${issue.shortId} blocked-by ${dependsOn}`))
  })

const depRemoveCmd = depCommand
  .command("remove [id] [depends-on]")
  .description("Remove a dependency")
  .action(async (id, dependsOn) => {
    if (!id || !dependsOn) {
      depRemoveCmd.outputHelp()
      return
    }

    const resolved = resolvePathArg(undefined)
    using repo = await loadRepo(resolved.repoRoot)
    const issue = resolveIssueArg(repo, id)
    if (!issue) {
      console.error(term.red(`Issue not found: ${id}`))
      process.exitCode = 1
      return
    }

    const result = removeDependency(issue, dependsOn)
    if (!result) {
      console.error(term.yellow(`${issue.shortId} does not depend on ${dependsOn}`))
      return
    }

    const node = repo.getNode(issue.id)
    repo.updateNode(issue.id, { data: mergeDepProps(node?.data as Record<string, unknown> | undefined, result) })

    console.log(term.green(`Removed dependency: ${issue.shortId} no longer blocked-by ${dependsOn}`))
  })

const depListCmd = depCommand
  .command("list [id]")
  .description("List dependencies for an issue")
  .action(async (id) => {
    if (!id) {
      depListCmd.outputHelp()
      return
    }

    const resolved = resolvePathArg(undefined)
    using repo = await loadRepo(resolved.repoRoot)
    const issue = resolveIssueArg(repo, id)
    if (!issue) {
      console.error(term.red(`Issue not found: ${id}`))
      process.exitCode = 1
      return
    }

    const deps = getDependencies(issue)
    if (deps.length === 0) {
      console.log(term.dim(`${issue.shortId} has no dependencies`))
      return
    }

    console.log(term.bold(`Dependencies for ${issue.shortId}:`))
    for (const dep of deps) {
      console.log(term.dim(`  - ${dep}`))
    }
  })

bdCommand.addCommand(depCommand)

// bd stale [--days N] - Show stale issues
bdCommand
  .command("stale")
  .description("List issues not updated in N days")
  .option("-d, --days <n>", "Days threshold", int, 14)
  .option("--json", "Output as JSON")
  .action(async (opts) => {
    const resolved = resolvePathArg(undefined)
    const configObj = loadConfigObject(resolved.repoRoot)
    using repo = await loadRepo(resolved.repoRoot)

    const boardTag = configObj.beads.board || undefined
    const issues = queryIssues({}, undefined, boardTag, { repo })
    const threshold = Date.now() - opts.days * 86400000
    const stale = issues.filter((i) => i.updatedAt < threshold && i.status !== "done" && i.status !== "dropped")

    if (opts.json) {
      console.log(JSON.stringify(stale.map(issueToBdJson), null, 2))
      return
    }

    if (stale.length === 0) {
      console.log(term.green(`No stale issues (threshold: ${opts.days} days).`))
      return
    }

    console.log(term.bold(`Stale issues (not updated in ${opts.days}+ days):\n`))
    for (const issue of stale) {
      printIssue(issue)
    }
  })

// bd claim <id> - Claim an issue (set status=wip + assignee)
bdCommand
  .command("claim <id>")
  .description("Claim an issue (set status to wip and assign to you)")
  .action(async (id) => {
    const resolved = resolvePathArg(undefined)
    using repo = await loadRepo(resolved.repoRoot)
    const issue = resolveIssueArg(repo, id)
    if (!issue) {
      console.error(term.red(`Issue not found: ${id}`))
      process.exitCode = 1
      return
    }

    let gitUser = "unknown"
    try {
      const { execSync } = await import("child_process")
      gitUser = execSync("git config user.name", { encoding: "utf-8" }).trim()
    } catch {
      // Fall back to "unknown" if git config not set
    }

    const updates = updateIssueFields(issue, { status: "wip", assignee: gitUser })
    repo.updateNode(issue.id, updates)

    console.log(term.green(`Claimed ${issue.shortId}`))
    console.log(term.dim(`  Status: wip`))
    console.log(term.dim(`  Assignee: ${gitUser}`))
  })

// bd children <id> - List children of an epic
bdCommand
  .command("children <id>")
  .description("List children of an issue (e.g., sub-tasks of an epic)")
  .option("--json", "Output as JSON")
  .action(async (id, opts) => {
    const resolved = resolvePathArg(undefined)
    using repo = await loadRepo(resolved.repoRoot)
    const issue = resolveIssueArg(repo, id)
    if (!issue) {
      console.error(term.red(`Issue not found: ${id}`))
      process.exitCode = 1
      return
    }

    const children = repo.getChildren(issue.id)
    const childIssues = children.filter((c) => c.task_status != null).map((c) => nodeToIssue(c, { repo }))

    if (opts.json) {
      console.log(JSON.stringify(childIssues.map(issueToBdJson), null, 2))
      return
    }

    if (childIssues.length === 0) {
      console.log(term.dim(`${issue.shortId} has no child tasks.`))
      return
    }

    console.log(term.bold(`Children of ${issue.shortId} (${childIssues.length}):\n`))
    for (const child of childIssues) {
      printIssue(child)
    }
  })

// bd blocked - List all blocked issues
bdCommand
  .command("blocked")
  .description("List all blocked issues")
  .option("--json", "Output as JSON")
  .action(async (opts) => {
    const resolved = resolvePathArg(undefined)
    const configObj = loadConfigObject(resolved.repoRoot)
    using repo = await loadRepo(resolved.repoRoot)

    const boardTag = configObj.beads.board || undefined
    const issues = queryIssues({}, undefined, boardTag, { repo })
    const blocked = issues.filter(
      (i) => i.blockedBy && i.blockedBy.length > 0 && i.status !== "done" && i.status !== "dropped",
    )

    if (opts.json) {
      console.log(JSON.stringify(blocked.map(issueToBdJson), null, 2))
      return
    }

    if (blocked.length === 0) {
      console.log(term.green("No blocked issues."))
      return
    }

    console.log(term.bold(`Blocked issues (${blocked.length}):\n`))
    for (const issue of blocked) {
      const blockers = issue.blockedBy?.join(", ") ?? ""
      printIssue(issue)
      console.log(term.dim(`    blocked-by: ${blockers}`))
    }
  })

// bd agent - Agent work queue integration
import { bdAgentCommand } from "./bd-agent.ts"
bdCommand.addCommand(bdAgentCommand)

// bd info [scope] - Show database information
bdCommand
  .command("info [scope]")
  .description("Show beads configuration and statistics")
  // oxlint-disable-next-line complexity/complexity -- CLI action with sequential reporting steps
  .action(async (scope) => {
    const resolved = resolvePathArg(scope)
    const kmDir = join(resolved.repoRoot, ".km")

    // Load repo for database access and mode
    using repo = await loadRepo(resolved.repoRoot)
    const scopePath = resolved.nodeRef ?? undefined
    const configObj = loadConfigObject(resolved.repoRoot)
    const config = configObj.beads
    const dbPath = join(kmDir, "state.db")
    const repoMode = repo.mode

    // Query with board filter if configured
    const boardTag = config.board || undefined
    const issues = queryIssues({}, scopePath, boardTag, { repo })

    console.log(term.bold("Beads Configuration"))
    console.log("===================")
    console.log(`Board:  ${config.board || term.dim("(none - showing all tasks)")}`)
    console.log(`Parent: ${config.parent || term.dim("(none - create manually)")}`)
    console.log(`Prefix: ${config.prefix}`)
    if (configObj.path) {
      console.log(term.dim(`Config: ${configObj.path}`))
    }

    console.log()
    console.log(term.bold("How tasks are tracked:"))
    if (config.board) {
      console.log(`  Tasks tagged @${config.board} are shown by 'km bd' commands.`)
      console.log(`  View the board with 'km view @${config.board}'.`)
    } else {
      console.log(`  All tasks in the repo are shown (no board filter configured).`)
      console.log(`  Set beads.board in .km/config.yaml to filter to a specific board.`)
    }
    if (config.parent) {
      console.log(`  New issues will be created in ${config.parent}.`)
    }

    console.log()
    console.log(term.bold("Storage"))
    console.log(`  Database: ${dbPath}`)
    console.log(`  Mode: ${repoMode}`)
    console.log(`  Repo: ${resolved.repoRoot}`)
    if (kmDir) {
      console.log(`  KM Dir: ${kmDir}`)
    }
    if (scopePath) {
      console.log(`  Scope: ${scopePath}`)
    }

    console.log()
    const scopeMsg = formatScopeMessage(scopePath, boardTag)
    console.log(term.bold(`Statistics${scopeMsg}`))
    console.log(`  Total: ${issues.length} issues`)

    // Show breakdown by status
    const byStatus = {
      open: issues.filter((i) => i.status === "todo").length,
      in_progress: issues.filter((i) => i.status === "wip").length,
      blocked: issues.filter((i) => i.status === "blocked").length,
      closed: issues.filter((i) => i.status === "done").length,
      dropped: issues.filter((i) => i.status === "dropped").length,
    }
    if (issues.length > 0) {
      console.log(`  Open: ${byStatus.open}, In Progress: ${byStatus.in_progress}, Blocked: ${byStatus.blocked}`)
      console.log(`  Closed: ${byStatus.closed}, Dropped: ${byStatus.dropped}`)

      // Show files with tasks
      const pathsWithTasks = new Set<string>()
      for (const issue of issues) {
        if (issue.path) {
          pathsWithTasks.add(issue.path)
        }
      }
      if (pathsWithTasks.size > 0) {
        console.log()
        console.log(term.bold("Files with tasks:"))
        const paths = Array.from(pathsWithTasks).slice(0, 5)
        for (const path of paths) {
          const count = issues.filter((i) => i.path === path).length
          console.log(term.dim(`  ${path} (${count})`))
        }
        if (pathsWithTasks.size > 5) {
          console.log(term.dim(`  ... and ${pathsWithTasks.size - 5} more files`))
        }
      }
    }
  })

// bd where [scope] - Show paths
bdCommand
  .command("where [scope]")
  .description("Show beads paths and configuration")
  .action(async (scope) => {
    const resolved = resolvePathArg(scope)
    const kmDir = join(resolved.repoRoot, ".km")

    // Load repo (unused but kept for consistency - may use in future)
    using _repo = await loadRepo(resolved.repoRoot)
    const dbPath = join(kmDir, "state.db")
    const configObj = loadConfigObject(resolved.repoRoot)

    if (existsSync(kmDir)) {
      console.log(kmDir)
      console.log(`  prefix: ${configObj.beads.prefix}`)
      console.log(`  board: ${configObj.beads.board || "(none)"}`)
      console.log(`  parent: ${configObj.beads.parent || "(none)"}`)
      console.log(`  database: ${dbPath}`)
      console.log(`  repo: ${resolved.repoRoot}`)
      if (resolved.nodeRef) {
        console.log(`  scope: ${resolved.nodeRef}`)
      }
    } else {
      console.log(term.yellow("No km directory found."))
      console.log(`  repo: ${resolved.repoRoot}`)
    }
  })

// bd query <expression...> - Raw DSL query (no default board filter)
bdCommand
  .command("query <expression...>")
  .description("Query issues with raw DSL expression (no default board filter)")
  .option("--json", "Output as JSON")
  .action(async (expressionParts: string[], opts: { json?: boolean }) => {
    const expression = expressionParts.join(" ")

    const resolved = resolvePathArg(undefined)
    using repo = await loadRepo(resolved.repoRoot)

    const nodes = repo.query(expression)
    const issues = nodes.map((n) => nodeToIssue(n, { repo }))

    if (opts.json) {
      console.log(JSON.stringify(issues.map(issueToBdJson), null, 2))
      return
    }

    if (issues.length === 0) {
      console.log(term.yellow("No issues found."))
      return
    }

    console.log(term.bold(`Issues (${issues.length}):\n`))
    for (const issue of issues) {
      printIssue(issue)
    }
  })

// bd rename <old-id> <new-id> - Rename an issue
const renameCmd = bdCommand
  .command("rename <old-id> <new-id>")
  .description("Rename an issue ID (updates all references)")
  .action(async (oldId: string, newId: string) => {
    const resolved = resolvePathArg(undefined)
    using repo = await loadRepo(resolved.repoRoot)
    const issue = resolveIssueArg(repo, oldId)
    if (!issue) {
      console.error(term.red(`Issue not found: ${oldId}`))
      process.exitCode = 1
      return
    }

    // Update the short_id on the node
    const node = repo.getNode(issue.id)
    const data = (node?.data as Record<string, unknown>) ?? {}
    repo.updateNode(issue.id, {
      data: { ...data, short_id: newId },
      updated_at: Date.now(),
    })

    // Update blocked-by references across all issues
    const allIssues = queryIssues({}, undefined, undefined, { repo })
    let refCount = 0
    for (const other of allIssues) {
      if (other.blockedBy?.includes(oldId)) {
        const otherNode = repo.getNode(other.id)
        const otherData = (otherNode?.data as Record<string, unknown>) ?? {}
        const props = otherData.props as Record<string, any> | undefined
        if (props?.["blocked-by"]) {
          const bp = props["blocked-by"]
          if (bp.type === "link" && bp.target === oldId) {
            bp.target = newId
          } else if (bp.type === "list" && bp.values) {
            for (const v of bp.values) {
              if (v.target === oldId) v.target = newId
            }
          }
          repo.updateNode(other.id, { data: { ...otherData, props }, updated_at: Date.now() })
          refCount++
        }
      }
    }

    console.log(term.green(`Renamed ${oldId} → ${newId}`))
    if (refCount > 0) console.log(`Updated ${refCount} dependency reference${refCount > 1 ? "s" : ""}`)
  })

// Add extracted subcommands
bdCommand.addCommand(configCommand)
bdCommand.addCommand(migrateCommand)
bdCommand.addCommand(exportCommand)
