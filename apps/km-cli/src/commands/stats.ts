/**
 * Stats Command - Example of Domain Object Pattern
 *
 * This command demonstrates the recommended way to use the storage layer
 * with domain objects (createVault) instead of singletons.
 *
 * Key patterns:
 * 1. Use `createVault()` generator for loading with progress
 * 2. Use `using vault = ...` for automatic cleanup
 * 3. Access data through vault methods, not global functions
 */

import { Command } from "commander";
import { runGenerator, createVault } from "@km/storage";

export const statsCommand = new Command("stats")
  .description("Show vault statistics (domain object example)")
  .argument("[path]", "Path to vault (default: cwd)")
  .action(async (path) => {
    // Use 'using' for automatic cleanup when scope exits
    // runGenerator consumes the generator without progress display
    using vault = runGenerator(createVault(path));

    // All data access through the vault object
    const tasks = vault.getAllTasks();
    const tasksByStatus = {
      todo: vault.getTasksByStatus("todo").length,
      wip: vault.getTasksByStatus("wip").length,
      blocked: vault.getTasksByStatus("blocked").length,
      done: vault.getTasksByStatus("done").length,
      dropped: vault.getTasksByStatus("dropped").length,
    };

    console.log(`Vault: ${vault.path}`);
    console.log(`Mode: ${vault.mode}`);
    console.log(`\nStats:`);
    console.log(`  Nodes: ${vault.stats.nodeCount}`);
    console.log(`  Links: ${vault.stats.linkCount}`);
    console.log(`  Load time: ${vault.stats.duration}ms`);
    console.log(`\nTasks: ${tasks.length} total`);
    console.log(`  Todo: ${tasksByStatus.todo}`);
    console.log(`  WIP: ${tasksByStatus.wip}`);
    console.log(`  Blocked: ${tasksByStatus.blocked}`);
    console.log(`  Done: ${tasksByStatus.done}`);
    console.log(`  Dropped: ${tasksByStatus.dropped}`);

    if (vault.loadErrors.length > 0) {
      console.log(`\nWarnings: ${vault.loadErrors.length}`);
      for (const err of vault.loadErrors.slice(0, 5)) {
        console.log(`  [${err.phase}] ${err.message}`);
      }
      if (vault.loadErrors.length > 5) {
        console.log(`  ... and ${vault.loadErrors.length - 5} more`);
      }
    }

    // vault.close() called automatically via Symbol.dispose
  });
