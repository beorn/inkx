/**
 * Sync Command
 *
 * One-time sync between filesystem and database, or continuous watch mode
 */

import { Command } from "commander";
import chalk from "chalk";
import { SyncManager } from "@km/store";
import { getKmDir } from "@km/core";
import { dirname } from "path";

/**
 * Start the continuous filesystem watcher
 */
function startWatch(vaultPath: string, debounceMs: number): void {
  console.log(chalk.dim(`Watching: ${vaultPath}`));
  console.log(chalk.dim(`Debounce: ${debounceMs}ms`));
  console.log(chalk.dim("Press Ctrl+C to stop\n"));

  const manager = new SyncManager({
    vaultPath,
    debounceFs: debounceMs,
    debounceApply: 3000,
    conflictStrategy: "last_write_wins",
  });

  manager.on("ready", () => {
    console.log(chalk.green("✓"), "Watcher ready");
  });

  manager.on("state-change", (state) => {
    console.log(chalk.dim(`State: ${state}`));
  });

  manager.on("write-complete", (data) => {
    console.log(
      chalk.green("✓"),
      `Wrote ${data.count} file(s)`,
      data.errors > 0 ? chalk.red(`(${data.errors} error(s))`) : "",
    );
  });

  manager.on("write-errors", (errors) => {
    for (const { path, error } of errors) {
      console.error(chalk.red("✗"), path, error.message);
    }
  });

  manager.on("error", (error) => {
    console.error(chalk.red("Error:"), error);
  });

  // Start watching
  manager.start();

  // Handle shutdown
  process.on("SIGINT", () => {
    console.log(chalk.dim("\nStopping watcher..."));
    void manager.stop().then(() => process.exit(0));
  });

  process.on("SIGTERM", () => {
    void manager.stop().then(() => process.exit(0));
  });
}

/**
 * Perform a one-time sync operation
 */
async function runSync(
  vaultPath: string,
  options: { toFs?: boolean; dryRun?: boolean },
): Promise<void> {
  console.log(chalk.dim(`Syncing: ${vaultPath}`));

  if (options.dryRun) {
    console.log(chalk.yellow("Dry run mode - no changes will be made"));
    // TODO: Implement dry run
    return;
  }

  const manager = new SyncManager({
    vaultPath,
    debounceFs: 0,
    debounceApply: 0,
    conflictStrategy: "last_write_wins",
  });

  try {
    if (options.toFs) {
      console.log(chalk.dim("Syncing database → filesystem..."));
      const result = await manager.syncToFs();
      console.log(chalk.green("✓"), `Wrote ${result.written} file(s)`);
    } else {
      // Default: from filesystem
      console.log(chalk.dim("Syncing filesystem → database..."));
      const result = await manager.syncFromFs();
      console.log(chalk.green("✓"), `Processed ${result.processed} change(s)`);
    }
  } catch (error) {
    console.error(chalk.red("Sync failed:"), error);
    process.exit(1);
  }
}

export const syncCommand = new Command("sync")
  .description("Sync filesystem with database (use --watch for continuous)")
  .argument("[path]", "Path to sync (default: vault root)")
  .option("--from-fs", "Sync from filesystem to database")
  .option("--to-fs", "Sync from database to filesystem")
  .option("--dry-run", "Show what would be synced without making changes")
  .option("-w, --watch", "Watch for filesystem changes continuously")
  .option(
    "--debounce <ms>",
    "Debounce interval in ms (only with --watch)",
    "5000",
  )
  .action(async (path, options) => {
    const vaultPath = path ?? dirname(getKmDir());

    if (options.watch) {
      const debounceMs = parseInt(options.debounce, 10);
      startWatch(vaultPath, debounceMs);
    } else {
      await runSync(vaultPath, options);
    }
  });
