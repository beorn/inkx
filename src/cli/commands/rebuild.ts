/**
 * Rebuild Command
 *
 * Rebuild state.db from events.jsonl
 */

import { Command } from "commander";
import chalk from "chalk";
import { rebuildState, fullReset, syncState, freshStart } from "../../node/rebuild.ts";
import { getDbPath, getLastEventId } from "../../node/db.ts";
import { getEventsPath } from "../../node/emit.ts";
import { existsSync, statSync } from "fs";

export const rebuildCommand = new Command("rebuild")
  .description("Rebuild state from events")
  .option("--full", "Full rebuild (delete and recreate state.db)")
  .option("--fresh", "Fresh start (delete all .km data including events)")
  .option("--status", "Show rebuild status only")
  .action((options) => {
    if (options.status) {
      showStatus();
      return;
    }

    if (options.fresh) {
      console.log(chalk.yellow("Fresh start - deleting all .km data..."));
      freshStart();
      console.log(chalk.green("✓"), "Fresh start complete - .km directory cleared");
      return;
    }

    console.log(chalk.dim("Rebuilding state..."));

    try {
      const startTime = Date.now();

      let result: { eventCount: number; nodeCount: number };

      if (options.full) {
        console.log(chalk.yellow("Performing full reset..."));
        result = fullReset();
      } else {
        result = rebuildState();
      }

      const elapsed = Date.now() - startTime;

      console.log(chalk.green("✓"), "Rebuild complete");
      console.log(chalk.dim(`  Events: ${result.eventCount}`));
      console.log(chalk.dim(`  Nodes: ${result.nodeCount}`));
      console.log(chalk.dim(`  Time: ${elapsed}ms`));
    } catch (error) {
      console.error(chalk.red("Rebuild failed:"), error);
      process.exit(1);
    }
  });

/**
 * Show rebuild status
 */
function showStatus(): void {
  const dbPath = getDbPath();
  const eventsPath = getEventsPath();

  console.log(chalk.bold("State Status"));
  console.log();

  // Database
  if (existsSync(dbPath)) {
    const stat = statSync(dbPath);
    console.log(chalk.dim("Database:"), dbPath);
    console.log(chalk.dim("  Size:"), formatSize(stat.size));
    console.log(
      chalk.dim("  Modified:"),
      new Date(stat.mtimeMs).toISOString()
    );

    const lastEvent = getLastEventId();
    console.log(chalk.dim("  Last event:"), lastEvent?.slice(0, 13) ?? "(none)");
  } else {
    console.log(chalk.yellow("Database:"), "Not found");
  }

  console.log();

  // Events
  if (existsSync(eventsPath)) {
    const stat = statSync(eventsPath);
    console.log(chalk.dim("Events:"), eventsPath);
    console.log(chalk.dim("  Size:"), formatSize(stat.size));
    console.log(
      chalk.dim("  Modified:"),
      new Date(stat.mtimeMs).toISOString()
    );
  } else {
    console.log(chalk.yellow("Events:"), "Not found");
  }
}

/**
 * Format file size
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
