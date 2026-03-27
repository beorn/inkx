/**
 * Stats Command - Example of Domain Object Pattern
 *
 * This command demonstrates the recommended way to use the storage layer
 * with domain objects (createRepo) instead of singletons.
 *
 * Key patterns:
 * 1. Use `createRepo()` generator for loading with progress
 * 2. Use `using repo = ...` for automatic cleanup
 * 3. Access data through repo methods, not global functions
 */

import { Command } from "@silvery/commander"
import { loadRepo } from "../load-repo.ts"

export const statsCommand = new Command("stats")
  .description("Show repo statistics (domain object example)")
  .argument("[path]", "Path to repo (default: cwd)")
  .action(async (path) => {
    // Use 'using' for automatic cleanup when scope exits
    using repo = await loadRepo(path ?? process.cwd())

    // All data access through the repo object
    const tasks = repo.getAllTasks()
    const tasksByStatus = {
      todo: repo.getTasksByStatus("todo").length,
      wip: repo.getTasksByStatus("wip").length,
      blocked: repo.getTasksByStatus("blocked").length,
      done: repo.getTasksByStatus("done").length,
      dropped: repo.getTasksByStatus("dropped").length,
    }

    console.log(`Repo: ${repo.path}`)
    console.log(`Mode: ${repo.mode}`)
    console.log(`\nStats:`)
    console.log(`  Nodes: ${repo.stats.nodeCount}`)
    console.log(`  Links: ${repo.stats.linkCount}`)
    console.log(`  Load time: ${repo.stats.duration}ms`)
    console.log(`\nTasks: ${tasks.length} total`)
    console.log(`  Todo: ${tasksByStatus.todo}`)
    console.log(`  WIP: ${tasksByStatus.wip}`)
    console.log(`  Blocked: ${tasksByStatus.blocked}`)
    console.log(`  Done: ${tasksByStatus.done}`)
    console.log(`  Dropped: ${tasksByStatus.dropped}`)

    if (repo.loadErrors.length > 0) {
      console.log(`\nWarnings: ${repo.loadErrors.length}`)
      for (const err of repo.loadErrors.slice(0, 5)) {
        console.log(`  [${err.phase}] ${err.message}`)
      }
      if (repo.loadErrors.length > 5) {
        console.log(`  ... and ${repo.loadErrors.length - 5} more`)
      }
    }

    // repo.close() called automatically via Symbol.dispose
  })
