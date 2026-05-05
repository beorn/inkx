/**
 * Beads List + Ready — `bd list [query...]`, `bd ready [scopeOrBoard]`
 *
 * Two display commands that share the configured-roots scope contract
 * (default beads roots; `--all` to opt out). See km-beads.bd-list-bead-scoping
 * for the canonical scoping discussion.
 *
 * `bd ready`:
 *   - Convenience for "what should I work on?" (todo + unblocked).
 *   - Calls Bead.queryReady (filter applied at the bead layer).
 *
 * `bd list`:
 *   - DSL query path with backward-compat fallback for path-shaped positionals.
 *   - The legacy path-shape detection (`startsWith("/")`/`"."`/`"~"`) routes
 *     through Bead.query with explicit scope; everything else flows through
 *     `repo.query` for full DSL support.
 *
 * Extracted from `bd.ts` as part of the per-family split (Wave 6 of
 * task-bd-collapse). See `@km/cli/bd-split-per-command`.
 */

import { Command } from "@silvery/commander"
import { createTerm } from "@silvery/ag-react"
import { resolvePathArg } from "@km/fs-mount"
import { Bead, buildDependentCountMap, type Bead as BeadType, type BeadFilter } from "@km/beads"
import { loadRepo } from "../load-repo.ts"
import { issueToBdJson, printIssue, printReadyIssue } from "./bd-format.ts"
import { writeJsonOut } from "./bd-shared-io.ts"
import { resolveBoardRoots, formatScopeMessage, printEmptyDefaultBoardHint } from "./bd-scope.ts"
import { buildQueryString, normalizeStatus, type SharedQueryFlags } from "./shared-query.ts"
import { parseLimitFlag, applyLimit } from "../utils/limit.ts"
import type { BdRegistrar } from "./bd-register.ts"

const term = createTerm(process)

export function registerBdReady(parent: BdRegistrar): void {
  const readyCmd = new Command("ready")
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
    .actionMerged(async (opts) => {
      const resolved = resolvePathArg(opts.scopeOrBoard)
      // A non-path positional ("@km", "imports/km-2026-04-28") overrides
      // the config[0] beads root. An explicit filesystem path (./, ../,
      // /abs) still scopes results to a subtree, preserving the legacy
      // path-scope use case for arbitrary directories.
      const cliRootOverride = resolved.wasExplicitPath ? undefined : (resolved.nodeRef ?? undefined)
      const scopePath = resolved.wasExplicitPath ? (resolved.nodeRef ?? undefined) : undefined

      using repo = await loadRepo(resolved.repoRoot)

      const filter: Partial<BeadFilter> = {}
      if (opts.type) filter.type = opts.type
      if (opts.assignee) filter.assignee = opts.assignee
      if (opts.priority !== undefined) filter.priority = opts.priority

      // Board-membership predicate: by default, scope to the configured
      // beads roots so vault-wide checkbox noise (markdown fixtures,
      // archived notes) doesn't drown out actual work. `--all` opts out
      // for the rare case of debugging unindexed beads.
      const boardRoots = resolveBoardRoots(repo, opts, cliRootOverride)
      const issues = Bead.queryReady(repo, filter, scopePath, undefined, { boardRoots })

      if (opts.json) {
        await writeJsonOut(issues.map(issueToBdJson))
        return
      }

      if (issues.length === 0) {
        console.log(term.yellow(`No ready issues found${formatScopeMessage(scopePath)}.`))
        // Bare `bd ready` (no positional, no --all): hint about the
        // default board so the user isn't left guessing why a vault with
        // beads returns nothing. Suppressed when an explicit scope/board
        // arg was supplied — the user already targeted a specific place
        // and a generic config-tweak hint would just be noise.
        if (!opts.all && !opts.scopeOrBoard) {
          printEmptyDefaultBoardHint("ready", boardRoots)
        }
        return
      }

      const scopeMsg = formatScopeMessage(scopePath)
      console.log(term.bold(`📋 Ready work (${issues.length} issues with no blockers${scopeMsg}):\n`))
      issues.forEach((issue, i) => {
        printReadyIssue(issue, i + 1)
      })
    })
  parent.addCommand(readyCmd)
}

export function registerBdList(parent: BdRegistrar): void {
  const listCmd = new Command("list")
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

        const filter: BeadFilter = {}
        if (opts.status) filter.status = opts.status.split(",").map(normalizeStatus)
        if (opts.type) filter.type = opts.type
        if (opts.assignee) filter.assignee = opts.assignee
        if (opts.priority !== undefined) filter.priority = opts.priority
        if (opts.blocked) filter.blocked = true
        if (opts.unblocked) filter.blocked = false

        // Apply board-membership predicate so vault-wide checkbox noise
        // (markdown fixtures, archived notes) doesn't drown out actual
        // beads. `--all` opts out for debugging unindexed nodes. Same
        // contract as `bd ready` (km-beads.bd-list-bead-scoping).
        const boardRoots = resolveBoardRoots(repo, opts)
        const allIssues = Bead.query(repo, filter, scopePath, undefined, { boardRoots })
        const limit = parseLimitFlag(opts.limit)
        const { items: issues, totalMsg } = applyLimit(allIssues, limit)

        if (opts.json) {
          await writeJsonOut(issues.map(issueToBdJson))
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

      const allNodes = repo.query(queryStr)
      // Apply board-membership predicate (km-beads.bd-list-bead-scoping).
      const boardRoots = resolveBoardRoots(repo, opts)
      const nodes = boardRoots ? allNodes.filter((n) => Bead.isBead(n, boardRoots, repo)) : allNodes
      // Build dependent-count map ONCE, not per-issue (eliminates N+1 scan).
      const dependentCountMap = buildDependentCountMap(repo)
      // Bead.from returns null for non-beads (no data.id, no data.short_id);
      // those used to surface as Bead with shortId === undefined and now
      // drop out at the namespace boundary.
      let issues: BeadType[] = nodes
        .map((n) => Bead.from(n, { repo, dependentCountMap }))
        .filter((b): b is BeadType => b !== null)

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
        await writeJsonOut(issues.map(issueToBdJson))
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
  parent.addCommand(listCmd)
}
