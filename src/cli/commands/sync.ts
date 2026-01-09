/**
 * Sync Command
 *
 * One-time sync between filesystem and database
 */

import { Command } from "commander";
import chalk from "chalk";
import { syncOnce, SyncManager } from "../../watch/sync.ts";
import { getKmPath } from "../../node/emit.ts";
import { dirname } from "path";

export const syncCommand = new Command("sync")
  .description("Sync filesystem with database")
  .argument("[path]", "Path to sync (default: vault root)")
  .option("--from-fs", "Sync from filesystem to database")
  .option("--to-fs", "Sync from database to filesystem")
  .option("--dry-run", "Show what would be synced without making changes")
  .action(async (path, options) => {
    const vaultPath = path ?? dirname(getKmPath());

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
  });
