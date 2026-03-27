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

/**
 * Task command - unified task management
 */
export const taskCommand = new Command("tasks")
  .description("Task management - list, create, complete, and assign tasks")
  .argument("[query...]", "Query terms: @person, #tag, +project, status:todo, -status:done")
  .allowUnknownOption()
  .option("-a, --all", "Show all tasks including done")
  .option("-S, --status <status>", "Filter by status (todo, wip, done, blocked)")
  .option("-q, --query <query>", "Filter with query syntax (status:todo @person #tag)")
  .option("-V, --detail", "Show more details")
  .option("-f, --flat", "Show path on single line")
  .option("-i, --id", "Show task IDs")
  .option("--json", "Output as JSON")
  .option("--new <content>", "Create a new task")
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
      const taskId = options.done === true ? firstArg : options.done
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
