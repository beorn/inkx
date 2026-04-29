/* eslint-disable @typescript-eslint/no-non-null-assertion -- codebase idiom: arr[i]! / map.get(k)! / stack.pop()! after surrounding length/has/bounds check; TS noUncheckedIndexedAccess requires the assertion even when invariant is obvious */
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
  buildDependentCountMap,
  createIssueNode,
  updateIssueFields,
  closeIssueFields,
  dropIssueFields,
  addDependency,
  removeDependency,
  getDependencies,
  mergeDepProps,
  resolveBeadsRoots,
  type Issue,
  type IssueFilter,
} from "@km/beads"
import { resolvePathArg } from "@km/fs-mount"
import { loadKmBdConfig } from "./bd-load-config.ts"
import { loadRepo } from "../load-repo.ts"
import { join } from "path"
import { existsSync } from "fs"

// Import from extracted modules
import { issueToBdJson, printIssue, printReadyIssue } from "./bd-format.ts"
import { resolveIssueArg } from "./bd-query-helpers.ts"
import { printTaskDetails } from "./shared-show.ts"
import { resolveTaskNode } from "../utils/resolve-task.ts"
import { resolveAssignee } from "../utils/assignee.ts"
import { configCommand } from "./bd-config.ts"
import { migrateCommand, exportCommand } from "./bd-migrate.ts"
import { attachMemoryCommands } from "./bd-memory.ts"
import { attachCommentCommands } from "./bd-comment.ts"
import { attachDoctorCommands } from "./bd-doctor.ts"
import { buildQueryString, normalizeStatus, type SharedQueryFlags } from "./shared-query.ts"
import { parseLimitFlag, applyLimit } from "../utils/limit.ts"

/** Format scope context for display messages (e.g., " in path") */
function formatScopeMessage(scopePath?: string): string {
  return scopePath ? ` in ${scopePath}` : ""
}

export const bdCommand = new Command("bd")
  .description("Issue tracking (beads-compatible)")
  .addHelpSection(
    "Note:",
    "Markdown tasks ARE the issues. Each scope (`km-<scope>.<slug>`) is its own board\n(file `<scope>/<slug>.md`, heading sigil `@<prefix>/<scope>`, e.g. `@km/beads`).\nSee 'km bd config' for the prefix knob, 'km bd info' for stats.",
  )
  .allowUnknownOption(false)

// bd ready [scope-or-board] - Find available work
bdCommand
  .command("ready")
  .argument(
    "[scopeOrBoard]",
    "Filesystem path scopes results; a non-path argument (e.g. `@km`) overrides the configured beads root[0].",
  )
  .description("List ready issues (unblocked, todo status)")
  .option("-t, --type <type>", "Filter by issue type (bug, feature, etc.)")
  .option("-a, --assignee <name>", "Filter by assignee")
  .option("-p, --priority <value>", "Filter by priority (e.g. P1, P2, or 0-4)")
  .option("--all", "Show all tasks (no board-membership filter)")
  .option("--json", "Output as JSON")
  // oxlint-disable-next-line complexity/complexity -- CLI info display with config/stats sections
  .actionMerged(async (opts) => {
    const resolved = resolvePathArg(opts.scopeOrBoard)
    // A non-path positional ("@km", "imports/km-2026-04-28") overrides
    // the config[0] beads root. An explicit filesystem path (./, ../,
    // /abs) still scopes results to a subtree, preserving the legacy
    // path-scope use case for arbitrary directories.
    const cliRootOverride = resolved.wasExplicitPath ? undefined : (resolved.nodeRef ?? undefined)
    const scopePath = resolved.wasExplicitPath ? (resolved.nodeRef ?? undefined) : undefined

    using repo = await loadRepo(resolved.repoRoot)

    const filter: Partial<IssueFilter> = {}
    if (opts.type) filter.type = opts.type
    if (opts.assignee) filter.assignee = opts.assignee
    if (opts.priority !== undefined) filter.priority = opts.priority

    // Board-membership predicate: by default, scope to the configured
    // beads roots so vault-wide checkbox noise (markdown fixtures,
    // archived notes) doesn't drown out actual work. `--all` opts out
    // for the rare case of debugging unindexed beads.
    const boardRoots = opts.all ? undefined : resolveBeadsRoots(repo.config.beads, cliRootOverride)
    const issues = queryReady(filter, scopePath, undefined, { repo, boardRoots })

    if (opts.json) {
      console.log(JSON.stringify(issues.map(issueToBdJson), null, 2))
      return
    }

    if (issues.length === 0) {
      console.log(term.yellow(`No ready issues found${formatScopeMessage(scopePath)}.`))
      return
    }

    const scopeMsg = formatScopeMessage(scopePath)
    console.log(term.bold(`📋 Ready work (${issues.length} issues with no blockers${scopeMsg}):\n`))
    issues.forEach((issue, i) => {
      printReadyIssue(issue, i + 1)
    })
  })

// bd list [query...] - List issues with filters
bdCommand
  .command("list")
  .argument("[query...]", "DSL query or path scope")
  .description("List issues with optional filters or raw DSL query")
  .option("-s, --status <status>", "Filter by status (todo,wip,blocked,done,dropped)")
  .option("-t, --type <type>", "Filter by issue type")
  .option("-a, --assignee <name>", "Filter by assignee")
  .option("-p, --priority <value>", "Filter by priority (e.g. P1, P2, or 0-4)")
  .option("--blocked", "Show only blocked issues")
  .option("--unblocked", "Show only unblocked issues")
  .option("--all", "Show all tasks (no scope narrowing)")
  .option("-n, --limit <n>", "Limit number of results")
  .option("--json", "Output as JSON")
  .actionMerged(async (opts) => {
    const queryParts: string[] = opts.query ?? []
    const positionalQuery = queryParts.length > 0 ? queryParts.join(" ") : undefined

    // Detect if positional arg looks like a path (backward compat with old [scope])
    const isPath =
      positionalQuery &&
      (positionalQuery.startsWith("/") || positionalQuery.startsWith(".") || positionalQuery.startsWith("~"))

    if (isPath) {
      // Legacy path-based scope — use old behavior
      const resolved = resolvePathArg(positionalQuery)
      const scopePath = resolved.nodeRef ?? undefined

      using repo = await loadRepo(resolved.repoRoot)

      const filter: IssueFilter = {}
      if (opts.status) filter.status = opts.status.split(",").map(normalizeStatus)
      if (opts.type) filter.type = opts.type
      if (opts.assignee) filter.assignee = opts.assignee
      if (opts.priority !== undefined) filter.priority = opts.priority
      if (opts.blocked) filter.blocked = true
      if (opts.unblocked) filter.blocked = false

      // Scope IS the board — no global board filter (queryIssues narrows
      // by scope path or query string instead).
      const allIssues = queryIssues(filter, scopePath, undefined, { repo })
      const limit = parseLimitFlag(opts.limit)
      const { items: issues, totalMsg } = applyLimit(allIssues, limit)

      if (opts.json) {
        console.log(JSON.stringify(issues.map(issueToBdJson), null, 2))
        return
      }

      if (issues.length === 0) {
        console.log(term.yellow(`No issues found${formatScopeMessage(scopePath)}.`))
        return
      }

      const scopeMsg = formatScopeMessage(scopePath)
      console.log(term.bold(`Issues (${totalMsg}${scopeMsg}):\n`))
      for (const issue of issues) {
        printIssue(issue)
      }
      return
    }

    // New unified query path
    const resolved = resolvePathArg(undefined)

    using repo = await loadRepo(resolved.repoRoot)

    // Build query from flags. No global board filter — scope is encoded
    // per-issue via path-form id; queries that need scope use the scope
    // CLI flag or path argument.
    const flags: SharedQueryFlags = opts
    const queryStr = buildQueryString(positionalQuery, flags, {})

    const nodes = repo.query(queryStr)
    // Build dependent-count map ONCE, not per-issue (eliminates N+1 scan).
    const dependentCountMap = buildDependentCountMap(repo)
    let issues = nodes.map((n) => nodeToIssue(n, { repo, dependentCountMap }))

    // Apply blocked/unblocked filter (not part of query DSL)
    if (opts.blocked) {
      issues = issues.filter((i) => i.blockedBy && i.blockedBy.length > 0)
    }
    if (opts.unblocked) {
      issues = issues.filter((i) => !i.blockedBy || i.blockedBy.length === 0)
    }

    const limit = parseLimitFlag(opts.limit)
    const limited = applyLimit(issues, limit)
    issues = limited.items

    if (opts.json) {
      console.log(JSON.stringify(issues.map(issueToBdJson), null, 2))
      return
    }

    if (issues.length === 0) {
      console.log(term.yellow("No issues found."))
      return
    }

    console.log(term.bold(`Issues (${limited.totalMsg}):\n`))
    for (const issue of issues) {
      printIssue(issue)
    }
  })

// bd show [id] - Show issue details
const showCmd = bdCommand
  .command("show")
  .argument("[id]", "Issue ID")
  .description("Show issue details")
  .option("--json", "Output as JSON")
  .actionMerged(async (opts) => {
    if (!opts.id) {
      showCmd.outputHelp()
      return
    }

    const resolved = resolvePathArg(undefined)
    using repo = await loadRepo(resolved.repoRoot)
    const node = resolveTaskNode(repo, opts.id)

    if (!node) {
      console.error(term.red(`Issue not found: ${opts.id}`))
      process.exitCode = 1
      return
    }

    if (opts.json) {
      // Preserve bd-compatible JSON shape (snake_case fields like
      // issue_type, dependency_count) by routing through issueToBdJson
      // — printTaskDetails' JSON path emits the camelCase Issue shape.
      console.log(JSON.stringify(issueToBdJson(nodeToIssue(node, { repo })), null, 2))
      return
    }

    printTaskDetails(repo, node, { bd: true })
  })

// bd create <title> - Create a new issue
bdCommand
  .command("create")
  .argument("<title>", "Issue title")
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
  .actionMerged(async (opts) => {
    const resolved = resolvePathArg(undefined)
    const configObj = await loadKmBdConfig(resolved.repoRoot)
    using repo = await loadRepo(resolved.repoRoot)

    const { node, shortId, children } = createIssueNode(opts.title, {
      type: opts.type,
      priority: opts.priority,
      assignee: opts.assignee,
      labels: opts.label as string[] | undefined,
      customId: opts.id,
      parentId: opts.parent,
      description: opts.description,
      notes: opts.notes,
      prefix: configObj.beads.prefix,
    })

    // Resolve parent: explicit --parent flag wins; otherwise derive from
    // the customId's scope (km-beads.foo → "beads/", @km/silvercode/acp/rename
    // → "silvercode/"). The bd id encodes the board by construction — no
    // global beads.parent config knob.
    const customIdScope = (() => {
      if (typeof opts.id !== "string") return null
      const id = opts.id.trim()
      const prefix = configObj.beads.prefix
      // `@<prefix>/<scope>/…` — sigil-prefixed canonical path-form.
      if (id.startsWith(`@${prefix}/`)) {
        return id.slice(prefix.length + 2).split("/")[0] ?? null
      }
      // `<scope>/…` — bare path-form.
      if (id.includes("/")) {
        return id.split("/")[0] ?? null
      }
      // `<prefix>-<scope>.<…>` (or `<scope>.<…>`) — bd-form with dot separator.
      if (id.includes(".")) {
        const head = id.split(".")[0] ?? ""
        return head.startsWith(`${prefix}-`) ? head.slice(prefix.length + 1) : head || null
      }
      return null
    })()
    const explicitParent = opts.parent as string | undefined
    const autoScopeParent = customIdScope ? `${customIdScope}/` : null
    let parentId: string | null = null

    // Try the explicit --parent first; fall back to auto-derived scope.
    // Explicit --parent must resolve — accept path-form (`@km/silvercode`),
    // bare path-form (`silvercode/`), bd-form (`km-silvercode`), or short id
    // (`km-q5hji`). Auto-scope is best-effort — silently fall through to
    // root if the scope epic doesn't exist yet (newly-bootstrapped scopes).
    if (explicitParent) {
      // Try bd-form / sigil-id first (resolveIssueArg), then path-form.
      const parentIssue = resolveIssueArg(repo, explicitParent)
      if (parentIssue) {
        parentId = parentIssue.id
      } else {
        const tries = [explicitParent]
        const prefix = configObj.beads.prefix
        if (explicitParent.startsWith(`${prefix}-`) && !explicitParent.includes(".")) {
          tries.push(`${explicitParent.slice(prefix.length + 1)}/`)
        }
        let resolved = null
        for (const ref of tries) {
          resolved = repo.resolveNode(ref)
          if (resolved) break
        }
        if (resolved) {
          parentId = resolved.id
        } else {
          console.error(term.red(`Parent not found: ${explicitParent}`))
          process.exitCode = 1
          return
        }
      }
    } else if (autoScopeParent) {
      const parentNode = repo.resolveNode(autoScopeParent)
      if (parentNode) parentId = parentNode.id
      // else: silently fall through to root — scope epic doesn't exist yet
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
    console.log(`Title: ${opts.title}`)
    if (opts.type) console.log(`Type: ${opts.type}`)
    console.log(`Priority: ${opts.priority ?? "P2"}`)
    if (opts.description) {
      console.log(`Description: ${opts.description.slice(0, 60)}${opts.description.length > 60 ? "..." : ""}`)
    }
  })

// bd update [id] - Update issue fields
const updateCmd = bdCommand
  .command("update")
  .argument("[id]", "Issue ID")
  .description("Update issue fields")
  .option("-s, --status <status>", "Set status (todo, wip, blocked, done, dropped)")
  .option("-p, --priority <value>", "Set priority (e.g. P0-P4 or 0-4)")
  .option("-a, --assignee <name>", "Set assignee")
  .option("-t, --title <title>", "Set title")
  .option("-d, --description <text>", "Set description (replaces first child paragraph)")
  .option("-n, --notes <text>", "Append notes (adds child paragraph)")
  .option("--type <type>", "Set issue type")
  .option("--parent <id>", "Move issue under a new parent (path-form, bd-form, or short id)")
  .option("--claim", "Claim issue (set status=wip + assignee to you)")
  .actionMerged(async (opts) => {
    if (!opts.id) {
      updateCmd.outputHelp()
      return
    }

    const resolved = resolvePathArg(undefined)
    using repo = await loadRepo(resolved.repoRoot)
    const issue = resolveIssueArg(repo, opts.id)
    if (!issue) {
      console.error(term.red(`Issue not found: ${opts.id}`))
      process.exitCode = 1
      return
    }

    // Resolve --parent up front so we fail fast before any mutation.
    // Try bd-form short id first (resolveIssueArg understands km-foo, @km/foo,
    // etc.), then fall back to path-form lookup (foo/, @km/foo/).
    let newParentId: string | null = null
    if (opts.parent) {
      const parentRef = opts.parent as string
      const parentIssue = resolveIssueArg(repo, parentRef)
      if (parentIssue) {
        newParentId = parentIssue.id
      } else {
        const cfg = await loadKmBdConfig(resolved.repoRoot)
        const prefix = cfg.beads.prefix
        const tries = [parentRef]
        if (parentRef.startsWith(`${prefix}-`) && !parentRef.includes(".")) {
          tries.push(`${parentRef.slice(prefix.length + 1)}/`)
        }
        let parentNode = null
        for (const ref of tries) {
          parentNode = repo.resolveNode(ref)
          if (parentNode) break
        }
        if (!parentNode) {
          console.error(term.red(`Parent not found: ${opts.parent}`))
          process.exitCode = 1
          return
        }
        newParentId = parentNode.id
      }
    }

    // Handle --claim: set status + assignee atomically
    if (opts.claim) {
      opts.status = opts.status ?? "wip"
      opts.assignee = opts.assignee ?? resolveAssignee()
    }

    const changes: Parameters<typeof updateIssueFields>[1] = {}
    if (opts.status) changes.status = opts.status as Issue["status"]
    if (opts.priority !== undefined) changes.priority = opts.priority
    if (opts.assignee) changes.assignee = opts.assignee
    if (opts.title) changes.title = opts.title
    if (opts.type) changes.type = opts.type

    // Pass current data blob so partial-replace semantics in storage's
    // updateNode don't wipe sibling keys (id, aliases, short_id, etc).
    if (opts.priority !== undefined || opts.type) {
      const node = repo.getNode(issue.id)
      changes.currentData = node?.data as Record<string, unknown> | undefined
    }

    const updates = updateIssueFields(issue, changes)
    repo.updateNode(issue.id, updates)

    // Handle --parent: move under the resolved new parent at end-of-list.
    if (newParentId) {
      const siblings = repo.getChildren(newParentId)
      repo.moveNode(issue.id, newParentId, siblings.length)
    }

    // Handle --description: replace or create first child paragraph
    if (opts.description) {
      const children = repo.getChildren(issue.id)
      const firstParagraph = children.find((c) => c.type === "p" && !c.item?.task?.status)
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
    if (newParentId) console.log(`  Moved under: ${opts.parent}`)
    if (opts.claim) console.log(`  Claimed by ${opts.assignee}`)
    if (updates.item?.task?.status && !opts.claim) console.log(`  Status: ${updates.item?.task?.status}`)
    if (updates.priority !== undefined) console.log(`  Priority: ${updates.priority}`)
    if (updates.content) console.log(`  Title: ${updates.content}`)
    if (opts.description) console.log(`  Description updated`)
    if (opts.notes) console.log(`  Notes appended`)
  })

// bd close [id] - Close an issue
const closeCmd = bdCommand
  .command("close")
  .argument("[id]", "Issue ID")
  .description("Close an issue (mark as done)")
  .option("-r, --reason <reason>", "Close reason")
  .actionMerged(async (opts) => {
    if (!opts.id) {
      closeCmd.outputHelp()
      return
    }

    const resolved = resolvePathArg(undefined)
    using repo = await loadRepo(resolved.repoRoot)
    const issue = resolveIssueArg(repo, opts.id)
    if (!issue) {
      console.error(term.red(`Issue not found: ${opts.id}`))
      process.exitCode = 1
      return
    }

    const node = repo.getNode(issue.id)
    const currentData = node?.data as Record<string, unknown> | undefined
    const updates = closeIssueFields(opts.reason, currentData)
    repo.updateNode(issue.id, updates)

    console.log(term.green(`Closed ${issue.shortId}`))
    if (opts.reason) console.log(term.dim(`Reason: ${opts.reason}`))
  })

// bd drop [id] - Drop an issue
const dropCmd = bdCommand
  .command("drop")
  .argument("[id]", "Issue ID")
  .description("Drop an issue (mark as won't do)")
  .option("-r, --reason <reason>", "Drop reason")
  .actionMerged(async (opts) => {
    if (!opts.id) {
      dropCmd.outputHelp()
      return
    }

    const resolved = resolvePathArg(undefined)
    using repo = await loadRepo(resolved.repoRoot)
    const issue = resolveIssueArg(repo, opts.id)
    if (!issue) {
      console.error(term.red(`Issue not found: ${opts.id}`))
      process.exitCode = 1
      return
    }

    const node = repo.getNode(issue.id)
    const currentData = node?.data as Record<string, unknown> | undefined
    const updates = dropIssueFields(opts.reason, currentData)
    repo.updateNode(issue.id, updates)

    console.log(term.yellow(`Dropped ${issue.shortId}`))
    if (opts.reason) console.log(term.dim(`Reason: ${opts.reason}`))
  })

// bd dep - Manage dependencies
const depCommand = new Command("dep").description("Manage issue dependencies")

const depAddCmd = depCommand
  .command("add")
  .argument("[id]", "Issue ID")
  .argument("[depends-on]", "Blocking issue ID")
  .description("Add a dependency (issue is blocked by depends-on)")
  .actionMerged(async (opts) => {
    if (!opts.id || !opts.dependsOn) {
      depAddCmd.outputHelp()
      return
    }

    const resolved = resolvePathArg(undefined)
    using repo = await loadRepo(resolved.repoRoot)
    const issue = resolveIssueArg(repo, opts.id)
    if (!issue) {
      console.error(term.red(`Issue not found: ${opts.id}`))
      process.exitCode = 1
      return
    }

    const props = addDependency(issue, opts.dependsOn)
    const node = repo.getNode(issue.id)
    repo.updateNode(issue.id, { data: mergeDepProps(node?.data as Record<string, unknown> | undefined, props) })

    console.log(term.green(`Added dependency: ${issue.shortId} blocked-by ${opts.dependsOn}`))
  })

const depRemoveCmd = depCommand
  .command("remove")
  .argument("[id]", "Issue ID")
  .argument("[depends-on]", "Blocking issue ID")
  .description("Remove a dependency")
  .actionMerged(async (opts) => {
    if (!opts.id || !opts.dependsOn) {
      depRemoveCmd.outputHelp()
      return
    }

    const resolved = resolvePathArg(undefined)
    using repo = await loadRepo(resolved.repoRoot)
    const issue = resolveIssueArg(repo, opts.id)
    if (!issue) {
      console.error(term.red(`Issue not found: ${opts.id}`))
      process.exitCode = 1
      return
    }

    const result = removeDependency(issue, opts.dependsOn)
    if (!result) {
      console.error(term.yellow(`${issue.shortId} does not depend on ${opts.dependsOn}`))
      return
    }

    const node = repo.getNode(issue.id)
    repo.updateNode(issue.id, { data: mergeDepProps(node?.data as Record<string, unknown> | undefined, result) })

    console.log(term.green(`Removed dependency: ${issue.shortId} no longer blocked-by ${opts.dependsOn}`))
  })

const depListCmd = depCommand
  .command("list")
  .argument("[id]", "Issue ID")
  .description("List dependencies for an issue")
  .actionMerged(async (opts) => {
    if (!opts.id) {
      depListCmd.outputHelp()
      return
    }

    const resolved = resolvePathArg(undefined)
    using repo = await loadRepo(resolved.repoRoot)
    const issue = resolveIssueArg(repo, opts.id)
    if (!issue) {
      console.error(term.red(`Issue not found: ${opts.id}`))
      process.exitCode = 1
      return
    }

    const deps = getDependencies(issue, repo)
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
  .actionMerged(async (opts) => {
    const resolved = resolvePathArg(undefined)
    await loadKmBdConfig(resolved.repoRoot)
    using repo = await loadRepo(resolved.repoRoot)

    const issues = queryIssues({}, undefined, undefined, { repo })
    const threshold = Date.now() - opts.days! * 86400000
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

// bd orphans - Find open/in-progress beads referenced in recent commit messages
//   (i.e. work that's been implemented but not formally closed).
bdCommand
  .command("orphans")
  .description("Find open beads referenced in recent commit messages (likely closed-by-commit)")
  .option("--days <n>", "Look back this many days in git log", int, 90)
  .option("--json", "Output as JSON")
  .option("--details", "Include the matching commits per bead")
  .actionMerged(async (opts) => {
    const resolved = resolvePathArg(undefined)
    await loadKmBdConfig(resolved.repoRoot)
    using repo = await loadRepo(resolved.repoRoot)

    // Collect open / in-progress / blocked beads — done/dropped are not orphans by definition.
    const issues = queryIssues({}, undefined, undefined, { repo }).filter(
      (i) => i.status === "todo" || i.status === "wip" || i.status === "blocked",
    )
    if (issues.length === 0) {
      console.log(term.green("No open issues — nothing to orphan-check."))
      return
    }

    // Pull the last `--days` of commit messages once; scan locally per id.
    // We capture full message bodies (not just subjects) because close-by-commit
    // ids typically appear in the body, not the title.
    const { execSync } = await import("child_process")
    let log: string
    try {
      log = execSync(`git log --since=${opts.days!}.days --format=%H%x00%B%x1e`, {
        cwd: resolved.repoRoot,
        encoding: "utf-8",
        maxBuffer: 64 * 1024 * 1024,
      })
    } catch (err) {
      console.error(term.red(`git log failed: ${(err as Error).message}`))
      process.exitCode = 1
      return
    }
    const commits = log
      .split("\x1e")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const [sha, ...rest] = entry.split("\x00")
        return { sha: (sha ?? "").trim(), body: rest.join("\x00").trim() }
      })

    type Orphan = { issue: (typeof issues)[number]; commits: string[] }
    const orphans: Orphan[] = []
    for (const issue of issues) {
      // Match the canonical bd id as a whole word — `\b` doesn't treat `.`
      // as a word char, so `km-foo.bar` ends after `bar`. Escape regex
      // metacharacters in the id (the `.` segment separator most importantly).
      const pattern = new RegExp(`(?<![\\w-])${issue.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`)
      const matched = commits.filter((c) => pattern.test(c.body))
      if (matched.length > 0) {
        orphans.push({ issue, commits: matched.map((c) => c.sha) })
      }
    }

    if (opts.json) {
      console.log(
        JSON.stringify(
          orphans.map((o) => ({ ...issueToBdJson(o.issue), commits: o.commits })),
          null,
          2,
        ),
      )
      return
    }

    if (orphans.length === 0) {
      console.log(term.green(`No orphaned issues (looked back ${opts.days} days).`))
      return
    }

    console.log(term.bold(`⚠ Found ${orphans.length} orphaned issue(s):\n`))
    orphans.forEach(({ issue, commits: shas }, i) => {
      console.log(`${i + 1}. ${issue.id}: ${issue.title}`)
      console.log(term.dim(`   Status: ${issue.status}`))
      if (opts.details) {
        for (const sha of shas.slice(0, 5)) {
          console.log(term.dim(`   - ${sha.slice(0, 9)}`))
        }
        if (shas.length > 5) {
          console.log(term.dim(`   - … (+${shas.length - 5} more)`))
        }
      }
    })
  })

// bd claim <id> - Claim an issue (set status=wip + assignee)
bdCommand
  .command("claim")
  .argument("<id>", "Issue ID")
  .description("Claim an issue (set status to wip and assign to you)")
  .actionMerged(async (opts) => {
    const resolved = resolvePathArg(undefined)
    using repo = await loadRepo(resolved.repoRoot)
    const issue = resolveIssueArg(repo, opts.id)
    if (!issue) {
      console.error(term.red(`Issue not found: ${opts.id}`))
      process.exitCode = 1
      return
    }

    const assignee = resolveAssignee()
    const updates = updateIssueFields(issue, { status: "wip", assignee })
    repo.updateNode(issue.id, updates)

    console.log(term.green(`Claimed ${issue.shortId}`))
    console.log(term.dim(`  Status: wip`))
    console.log(term.dim(`  Assignee: ${assignee}`))
  })

// bd children <id> - List children of an epic
bdCommand
  .command("children")
  .argument("<id>", "Issue ID")
  .description("List children of an issue (e.g., sub-tasks of an epic)")
  .option("--json", "Output as JSON")
  .actionMerged(async (opts) => {
    const resolved = resolvePathArg(undefined)
    using repo = await loadRepo(resolved.repoRoot)
    const issue = resolveIssueArg(repo, opts.id)
    if (!issue) {
      console.error(term.red(`Issue not found: ${opts.id}`))
      process.exitCode = 1
      return
    }

    // In the path-form hierarchy, sub-issues of `foo.md` live in the
    // sibling folder `foo/`. Walk both the in-file paragraph children
    // and the path-folder file children so the tree the user sees on
    // disk matches what `bd children` reports.
    //
    // The folder lookup must use the node's fs_path (which always ends
    // in `.md` for file-class nodes) rather than `issue.id` — node ids
    // can be either path-strings (`issue/silvercode/acp.md`) or ULIDs
    // (`01KQ…`) depending on how the repo was loaded.
    const issueNode = repo.getNode(issue.id)
    const inFileChildren = repo.getChildren(issue.id)
    // Folder nodes carry path-string ids matching their fs_path
    // (e.g. `issue/silvercode/acp`), so the folder for `foo.md` is
    // simply `<fs_path>` with the `.md` suffix dropped.
    const folderId = issueNode?.fs_path?.endsWith(".md") ? issueNode.fs_path.slice(0, -3) : null
    const pathChildren = folderId ? repo.getChildren(folderId) : []
    const allChildren = [...inFileChildren, ...pathChildren]
    const dependentCountMap = buildDependentCountMap(repo)
    const childIssues = allChildren
      .filter((c) => c.item?.task?.status != null || c.fs_path?.endsWith(".md"))
      .map((c) => nodeToIssue(c, { repo, dependentCountMap }))

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
  .actionMerged(async (opts) => {
    const resolved = resolvePathArg(undefined)
    await loadKmBdConfig(resolved.repoRoot)
    using repo = await loadRepo(resolved.repoRoot)

    const issues = queryIssues({}, undefined, undefined, { repo })
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
  .command("info")
  .argument("[scope]", "Path scope")
  .description("Show beads configuration and statistics")
  // oxlint-disable-next-line complexity/complexity -- CLI action with sequential reporting steps
  .actionMerged(async (opts) => {
    const resolved = resolvePathArg(opts.scope)
    const kmDir = join(resolved.repoRoot, ".km")

    // Load repo for database access and mode
    using repo = await loadRepo(resolved.repoRoot)
    const scopePath = resolved.nodeRef ?? undefined
    const configObj = await loadKmBdConfig(resolved.repoRoot)
    const config = configObj.beads
    const dbPath = join(kmDir, "state.db")
    const repoMode = repo.mode

    // No global board filter — scope is encoded per-issue via path-form id.
    const issues = queryIssues({}, scopePath, undefined, { repo })

    console.log(term.bold("Beads Configuration"))
    console.log("===================")
    console.log(`Prefix: ${config.prefix}`)
    if (configObj.path) {
      console.log(term.dim(`Config: ${configObj.path}`))
    }

    console.log()
    console.log(term.bold("How tasks are tracked:"))
    console.log(`  bd id 'km-<scope>.<slug>' → file '<scope>/<slug>.md' with @${config.prefix}/<scope> tag.`)
    console.log(`  Cross-vault references use '@${config.prefix}/<scope>/<slug>'.`)
    console.log(`  No board/parent config — the bd id encodes the board by construction.`)

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
    const scopeMsg = formatScopeMessage(scopePath)
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
  .command("where")
  .argument("[scope]", "Path scope")
  .description("Show beads paths and configuration")
  .actionMerged(async (opts) => {
    const resolved = resolvePathArg(opts.scope)
    const kmDir = join(resolved.repoRoot, ".km")

    // Load repo (unused but kept for consistency - may use in future)
    using _repo = await loadRepo(resolved.repoRoot)
    const dbPath = join(kmDir, "state.db")
    const configObj = await loadKmBdConfig(resolved.repoRoot)

    if (existsSync(kmDir)) {
      console.log(kmDir)
      console.log(`  prefix: ${configObj.beads.prefix}`)
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
  .command("query")
  .argument("<expression...>", "DSL query expression")
  .description("Query issues with raw DSL expression (no default board filter)")
  .option("--json", "Output as JSON")
  .actionMerged(async (opts) => {
    const expression = opts.expression.join(" ")

    const resolved = resolvePathArg(undefined)
    using repo = await loadRepo(resolved.repoRoot)

    const nodes = repo.query(expression)
    const dependentCountMap = buildDependentCountMap(repo)
    const issues = nodes.map((n) => nodeToIssue(n, { repo, dependentCountMap }))

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
bdCommand
  .command("rename")
  .argument("<old-id>", "Current issue ID")
  .argument("<new-id>", "New issue ID")
  .description("Rename an issue ID (rewrites all incoming references by default)")
  .option("--no-rewrite", "Skip rewriting incoming references (legacy behaviour: only short_id + blocked-by)")
  .option("--include-prose", "Also rewrite bare-id mentions in body text (slower; off by default)")
  .actionMerged(async (opts) => {
    const resolved = resolvePathArg(undefined)
    using repo = await loadRepo(resolved.repoRoot)
    const issue = resolveIssueArg(repo, opts.oldId)
    if (!issue) {
      console.error(term.red(`Issue not found: ${opts.oldId}`))
      process.exitCode = 1
      return
    }

    // Use the canonical move-with-refs primitive. Default behaviour:
    //   - rewrites wikilinks, transclusions, dep-edges, frontmatter aliases,
    //     frontmatter parent_id, blocked-by props
    //   - bare-id prose mentions opt-in via --include-prose
    //   - --no-rewrite skips the walk entirely (legacy behaviour preserved
    //     for callers that need it)
    const result = repo.moveNodeWithRefs(
      issue.id,
      { newShortId: opts.newId },
      {
        noRewrite: opts.rewrite === false,
        includeProse: opts.includeProse === true,
      },
    )

    console.log(term.green(`Renamed ${opts.oldId} → ${opts.newId}`))
    if (result.rewroteRefs > 0) {
      console.log(
        `Updated ${result.rewroteRefs} reference${result.rewroteRefs > 1 ? "s" : ""} in ${result.rewroteHosts} file${result.rewroteHosts > 1 ? "s" : ""}`,
      )
    }
    if (result.failedHosts.length > 0) {
      console.warn(
        term.yellow(
          `Warning: ${result.failedHosts.length} host${result.failedHosts.length > 1 ? "s" : ""} failed to rewrite (see logs)`,
        ),
      )
    }
  })

// Add extracted subcommands
bdCommand.addCommand(configCommand)
bdCommand.addCommand(migrateCommand)
bdCommand.addCommand(exportCommand)
attachMemoryCommands(bdCommand)
attachCommentCommands(bdCommand)
attachDoctorCommands(bdCommand)
