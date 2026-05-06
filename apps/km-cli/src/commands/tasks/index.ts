/**
 * Task Command Group — `km task` (singular)
 *
 * The canonical task-workflow surface (per @km/cli/task-bd-collapse
 * Wave 3). `km task` is thin: only the verbs that genuinely need
 * task-domain knowledge (board view, ready/blocked, claim/release/close/
 * drop/reopen, dep). Generic node-graph verbs (set, clear, move,
 * children, stale, query) live at the top level (`km set`, `km move`, …)
 * — see program.ts.
 *
 * Naming:
 *   - Command name is `task` (singular). Modern CLIs use singular for
 *     resource-type verbs (`gh issue`, `git branch`, `kubectl get pod`).
 *   - `tasks` is preserved as an UNDOCUMENTED alias for muscle memory —
 *     it does not appear in `--help`.
 *
 * What was removed (Wave 3):
 *   - Top-level mutation flags `--new`, `--done`, `--claim`, `--release`,
 *     `--assign`. They violated POSIX hygiene (top-level flags that
 *     behave like subcommands create parser ambiguity). Replacements:
 *       --new <content> → `task new <content>` (subcommand)
 *       --done [id]     → `task close <id>` (lifecycle workflow transition)
 *       --claim         → `task claim <id>` (subcommand, hardened)
 *       --release       → `task release <id>` (subcommand, hardened)
 *       --assign <user> → `task set <id> assignee:<user>` (raw field write)
 *   - Create-time flags (--type, --id, --aliases, --parent, --owner,
 *     --due, --start) moved to the `task new` subcommand registration.
 *
 * What was added (Wave 3):
 *   - `task close <id> [--reason TEXT]` — workflow transition (sets
 *     closed_at + optional reason; distinct from `set status:done`).
 *   - `task drop <id> [--reason TEXT]` — sibling of close.
 *   - `task reopen <id>` — done/dropped → todo; clears closed_at.
 *   - Hardened `claim` / `release` — validation against
 *     already-claimed-by-other / not-currently-claimed.
 */

import { Command } from "@silvery/commander"
import { createTerm } from "@silvery/ag-react"
import { listTasks } from "./list.ts"
import { createTask } from "./mutations.ts"
import { createStatusCommand } from "./status.ts"
import { createSetCommand, createClearCommand } from "./set-clear.ts"
import { listStaleTasks } from "./stale.ts"
import { createDepCommand } from "./dep.ts"
import { createOrphansCommand } from "./orphans.ts"
import {
  claimTaskLifecycle,
  closeTaskLifecycle,
  dropTaskLifecycle,
  releaseTaskLifecycle,
  reopenTaskLifecycle,
} from "./lifecycle.ts"
import { resolveCwdScope } from "../../utils/cwd-scope.ts"

const term = createTerm(process)

/**
 * Pre-process the bare-task positional args. Returns the `pathOrId` to
 * pass to `listTasks` plus a `forcePath` flag.
 *
 * Special syntax: a leading `.` argument scopes the listing to the
 * cwd-relative subtree of the current vault. Walks up from cwd to find
 * `.km/` and computes the relative path. Edge case: cwd not under any
 * vault → exits with a clear error.
 *
 * Other positional args pass through unchanged (joined into a query
 * string downstream — the existing behavior).
 *
 * `forcePath` is set on cwd-scope paths because the resolved relative
 * path may start with `@` (e.g. `@km/storage`) — a sigil that
 * `looksLikeQuery` would otherwise treat as a mention filter. We know
 * it's a path because the user typed `.`, so we tell the planner to
 * skip the heuristic.
 */
function preprocessTaskPositional(args: string[]): { pathOrId?: string; forcePath: boolean } {
  if (args.length === 0) return { forcePath: false }
  if (args[0] === ".") {
    const scope = resolveCwdScope()
    if (scope.kind === "no-vault") {
      console.error(term.red("Not inside a km vault — `.` is only valid under a vault root"))
      process.exit(1)
    }
    // Vault-root cwd: no subtree filter, list everything (treat as if
    // user typed nothing). Subdir: pass relative path as the positional
    // so `planList` uses it as a subtree-or-filter scope.
    if (scope.relativePath === "" || scope.relativePath === ".") {
      // Only the `.` was passed → list everything. Anything trailing
      // (`.` plus query terms) joins back as a query string after the
      // dot is consumed.
      const rest = args.slice(1)
      return { pathOrId: rest.length > 0 ? rest.join(" ") : undefined, forcePath: false }
    }
    const rest = args.slice(1)
    const pathOrId = rest.length > 0 ? `${scope.relativePath} ${rest.join(" ")}` : scope.relativePath
    return { pathOrId, forcePath: true }
  }
  return { pathOrId: args.join(" "), forcePath: false }
}

/**
 * Task command — `km task` (singular). `tasks` aliased for muscle memory.
 */
export const taskCommand = new Command("task")
  .alias("tasks")
  .description("Task management - list, create, complete, and manage tasks")
  .argument("[query...]", "Query terms: @person, #tag, +project, status:todo, -status:done")
  .allowUnknownOption()
  .option("-a, --all", "Show all tasks including done")
  .option("-S, --status <status>", "Filter by status (todo, wip, done, blocked)")
  .option("-p, --priority <value>", "Filter by priority (e.g. P1, P2, or 0-4)")
  .option("-q, --query <query>", "Filter with query syntax (status:todo @person #tag)")
  .option("--blocked", "Show only blocked tasks (have at least one blocked-by target)")
  .option("--unblocked", "Show only unblocked tasks (no blocked-by target)")
  .option("--assignee <name>", "Filter by assignee (use 'me' for current user)")
  .option("-V, --detail", "Show more details")
  .option("-f, --flat", "Show path on single line")
  .option("-i, --show-ids", "Show task IDs")
  .option("-n, --limit <n>", "Limit number of results")
  .option("--json", "Output as JSON")
  .action((queryArgs: string[], options) => {
    // Bare `task` is the board view (list). All mutations go through
    // explicit subcommands — top-level mutation flags were removed in
    // Wave 3 (see header). Anything that isn't a known subcommand is
    // treated as a query string for the list view.
    //
    // Special case: a leading `.` scopes to the cwd-relative subtree
    // of the current vault (see preprocessTaskPositional).
    const { pathOrId, forcePath } = preprocessTaskPositional(queryArgs)
    void listTasks(pathOrId, { ...options, forcePath })
  })

// Subcommands — generic mutation / query
taskCommand.addCommand(createStatusCommand())
taskCommand.addCommand(createSetCommand())
taskCommand.addCommand(createClearCommand())
taskCommand.addCommand(createDepCommand())
taskCommand.addCommand(createOrphansCommand())

// `task new <content>` — promoted from the legacy `tasks --new <content>`
// flag-form. Bead-frontmatter flags (--type, --id, --aliases, --parent,
// --owner, --due, --start, --priority) live here, not on the parent.
// Argument is variadic so `task new "Fix the thing"` and `task new Fix
// the thing` both work without quoting the trailing words.
taskCommand
  .command("new")
  .description("Create a new task")
  .argument("<content...>", "Task content (multiple words joined with spaces)")
  .option("--type <type>", "Bead-style type tag (bug, feature, epic, …; task is implicit)")
  .option(
    "--id <id>",
    "Explicit canonical id (path-form @km/scope/foo materializes a file; bare scope/foo is inline)",
  )
  .option("--aliases <list>", "Comma-separated alias list (writes to data.aliases)")
  .option("--parent <ref>", "Explicit parent ref (id, path, or filename)")
  .option("--owner <user>", "Initial assignee (writes to node.assigned_to)")
  .option("-a, --assignee <name>", "Assignee (alias of --owner; bd-compat)")
  .option("-p, --priority <value>", "Priority (P0..P4 or 0..4)")
  .option("-d, --description <text>", "Description — first body paragraph (file mode only)")
  .option("-n, --notes <text>", "Notes — appended body paragraph (file mode only)")
  .option("-l, --label <labels...>", "Add labels")
  .option("--due <date>", "Due date (natural language: tmrw, +2w, friday)")
  .option("--start <date>", "Start date (natural language: tmrw, +2w, friday)")
  .option("--json", "Output as JSON")
  .action((contentArgs: string[], options) => {
    const content = contentArgs.join(" ")
    // commander's option types are inferred too narrowly to satisfy
    // CreateTaskOptions's optional structural shape; cast at the call
    // boundary keeps the action handler tidy.
    void createTask(options.parent, content, options as Parameters<typeof createTask>[2])
  })

// Lifecycle subcommands (Wave 3) — workflow transitions distinct from
// raw `set status:X` writes. See lifecycle.ts header for the
// distinction; lifecycle-plan.ts holds the validation logic.
taskCommand
  .command("claim")
  .description("Claim task (assign to yourself; validates not-already-claimed-by-other)")
  .argument("<id>", "Task ID or prefix")
  .option("--json", "Output as JSON")
  .action((id, options) => {
    void claimTaskLifecycle(id, options)
  })

taskCommand
  .command("release")
  .description("Release a claimed task (clear assignee; validates currently-claimed)")
  .argument("<id>", "Task ID or prefix")
  .option("--json", "Output as JSON")
  .action((id, options) => {
    void releaseTaskLifecycle(id, options)
  })

taskCommand
  .command("close")
  .description("Close a task (mark done, set closed_at, optional reason)")
  .argument("<id>", "Task ID or prefix")
  .option("-r, --reason <reason>", "Close reason (recorded on data.closeReason)")
  .option("--json", "Output as JSON")
  .action((id, options) => {
    void closeTaskLifecycle(id, options)
  })

taskCommand
  .command("drop")
  .description("Drop a task (mark won't-do, set closed_at, optional reason)")
  .argument("<id>", "Task ID or prefix")
  .option("-r, --reason <reason>", "Drop reason (recorded on data.dropReason)")
  .option("--json", "Output as JSON")
  .action((id, options) => {
    void dropTaskLifecycle(id, options)
  })

taskCommand
  .command("reopen")
  .description("Reopen a closed/dropped task (back to todo, clear closed_at)")
  .argument("<id>", "Task ID or prefix")
  .option("--json", "Output as JSON")
  .action((id, options) => {
    void reopenTaskLifecycle(id, options)
  })

// Add stale subcommand — list open tasks not updated in N days.
// Use optsWithGlobals() so flags shared with the parent `task` command
// (notably `--json`) aren't swallowed by the parent before reaching this
// action.
taskCommand
  .command("stale")
  .description("List open tasks not updated in N days (default 14)")
  .option("-d, --days <n>", "Days threshold (default 14)", (v) => parseInt(v, 10), 14)
  .option("-V, --detail", "Show more details")
  .option("-f, --flat", "Show path on single line")
  .option("-i, --show-ids", "Show task IDs")
  .option("--json", "Output as JSON")
  .action((_options, cmd) => {
    void listStaleTasks(cmd.optsWithGlobals())
  })

// Add ready subcommand — preset for `--status todo --unblocked`.
// Mirrors the surface of `bd ready` so a contributor never has to remember
// the long-form filter combo for "what's available to work on right now".
// Display flags mirror the parent `task` command (--detail, --flat,
// --show-ids, --json, --limit) so output stays consistent across the suite.
taskCommand
  .command("ready")
  .description("List ready tasks (todo + unblocked)")
  .argument("[query...]", "Optional query terms (forwarded to tasks list)")
  .option("-V, --detail", "Show more details")
  .option("-f, --flat", "Show path on single line")
  .option("-i, --show-ids", "Show task IDs")
  .option("-n, --limit <n>", "Limit number of results")
  .option("-p, --priority <value>", "Filter by priority (e.g. P1, P2, or 0-4)")
  .option("--assignee <name>", "Filter by assignee (use 'me' for current user)")
  .option("--json", "Output as JSON")
  .action((queryArgs: string[], options) => {
    const queryStr = queryArgs.length > 0 ? queryArgs.join(" ") : undefined
    void listTasks(queryStr, { ...options, status: "todo", unblocked: true })
  })
