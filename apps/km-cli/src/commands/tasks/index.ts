/**
 * Task Command Group
 *
 * All task-related commands grouped under 'km task'
 */

import { Command } from "@silvery/commander"
import { listTasks } from "./list.ts"
import { createTask, markDone, claimTask, releaseTask, assignTask } from "./mutations.ts"
import { createStatusCommand } from "./status.ts"
import { createSetCommand, createClearCommand } from "./set-clear.ts"
import { listStaleTasks } from "./stale.ts"

/**
 * Task command - unified task management
 */
export const taskCommand = new Command("tasks")
  .description("Task management - list, create, complete, and assign tasks")
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
  .option("-i, --id", "Show task IDs")
  .option("-n, --limit <n>", "Limit number of results")
  .option("--json", "Output as JSON")
  .option("--new <content>", "Create a new task")
  .option("--type <type>", "Bead-style type tag for --new (bug, feature, epic, …; task is implicit)")
  .option("--task-id <id>", "Explicit canonical id for --new (path-form @km/scope/foo or bare scope/foo)")
  .option("--aliases <list>", "Comma-separated alias list for --new (writes to data.aliases)")
  .option("--parent <ref>", "Explicit parent ref for --new (id, path, or filename)")
  .option("--owner <user>", "Initial assignee for --new (writes to node.assigned_to)")
  .option("--done [id]", "Mark task as done (use with path-or-id or provide task id)")
  .option("--assign <user>", "Assign task to user (use with path-or-id)")
  .option("--claim", "Claim task for yourself (use with path-or-id)")
  .option("--release", "Release claimed task (use with path-or-id)")
  .action((queryArgs: string[], options) => {
    // Join query args into a single query string (or use first arg for ID-based operations)
    const queryStr = queryArgs.length > 0 ? queryArgs.join(" ") : undefined
    const firstArg = queryArgs[0]

    // Handle mutation operations first
    if (options.new) {
      void createTask(firstArg, options.new, options)
      return
    }

    if (options.done !== undefined) {
      // --done can be used with path-or-id or standalone with value
      const taskId = options.done === true ? firstArg : options.done || undefined
      void markDone(taskId, options)
      return
    }

    if (options.claim) {
      void claimTask(firstArg, options)
      return
    }

    if (options.release) {
      void releaseTask(firstArg, options)
      return
    }

    if (options.assign) {
      void assignTask(firstArg, options.assign, options)
      return
    }

    // Default: list tasks
    void listTasks(queryStr, options)
  })

// Add subcommands
taskCommand.addCommand(createStatusCommand())
taskCommand.addCommand(createSetCommand())
taskCommand.addCommand(createClearCommand())

// Add claim subcommand
taskCommand
  .command("claim")
  .description("Claim task (assign to yourself)")
  .argument("<id>", "Task ID or prefix")
  .option("--json", "Output as JSON")
  .action((id, options) => {
    void claimTask(id, options)
  })

// Add release subcommand
taskCommand
  .command("release")
  .description("Release task (unassign)")
  .argument("<id>", "Task ID or prefix")
  .option("--json", "Output as JSON")
  .action((id, options) => {
    void releaseTask(id, options)
  })

// Add stale subcommand — list open tasks not updated in N days.
// Use optsWithGlobals() so flags shared with the parent `tasks` command (notably
// `--json`) aren't swallowed by the parent before reaching this action.
taskCommand
  .command("stale")
  .description("List open tasks not updated in N days (default 14)")
  .option("-d, --days <n>", "Days threshold (default 14)", (v) => parseInt(v, 10), 14)
  .option("-V, --detail", "Show more details")
  .option("-f, --flat", "Show path on single line")
  .option("-i, --id", "Show task IDs")
  .option("--json", "Output as JSON")
  .action((_options, cmd) => {
    void listStaleTasks(cmd.optsWithGlobals())
  })

// Add ready subcommand — preset for `--status todo --unblocked`.
// Mirrors the surface of `bd ready` so a contributor never has to remember
// the long-form filter combo for "what's available to work on right now".
// Display flags mirror the parent `tasks` command (--detail, --flat, --id,
// --json, --limit) so output stays consistent across the suite.
taskCommand
  .command("ready")
  .description("List ready tasks (todo + unblocked)")
  .argument("[query...]", "Optional query terms (forwarded to tasks list)")
  .option("-V, --detail", "Show more details")
  .option("-f, --flat", "Show path on single line")
  .option("-i, --id", "Show task IDs")
  .option("-n, --limit <n>", "Limit number of results")
  .option("-p, --priority <value>", "Filter by priority (e.g. P1, P2, or 0-4)")
  .option("--assignee <name>", "Filter by assignee (use 'me' for current user)")
  .option("--json", "Output as JSON")
  .action((queryArgs: string[], options) => {
    const queryStr = queryArgs.length > 0 ? queryArgs.join(" ") : undefined
    void listTasks(queryStr, { ...options, status: "todo", unblocked: true })
  })
