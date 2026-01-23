/**
 * Beads Command (bd)
 *
 * Issue tracking integrated with km storage.
 * Thin CLI wrapper around @km/beads package.
 */

import { Command } from "commander";
import chalk from "chalk";
import {
  queryReady,
  queryIssues,
  createIssueNode,
  updateIssueFields,
  closeIssueFields,
  dropIssueFields,
  addDependency,
  removeDependency,
  getDependencies,
  type Issue,
  type IssueFilter,
} from "@km/beads";
import {
  getKmDir,
  getDbPath,
  getStore,
  resolvePathArg,
  getBeadsConfig,
  getConfigPath,
} from "@km/storage";

// Import from extracted modules
import {
  issueToBdJson,
  printIssue,
  printReadyIssue,
  printIssueDetails,
} from "./bd-format.ts";
import { resolveIssueArg } from "./bd-query-helpers.ts";
import { configCommand } from "./bd-config.ts";
import { migrateCommand, exportCommand } from "./bd-migrate.ts";

export const bdCommand = new Command("bd")
  .description(
    `Issue tracking (beads-compatible)

Markdown tasks ARE the issues. By default, queries filter to @issue
and new issues are created in issue/. See 'km bd config' to customize,
'km bd info' for stats, or 'km bd agent' for agent integration.`,
  )
  .allowUnknownOption(false);

// bd ready [scope] - Find available work
bdCommand
  .command("ready [scope]")
  .description("List ready issues (unblocked, todo status)")
  .option("-t, --type <type>", "Filter by issue type (bug, feature, etc.)")
  .option("-a, --assignee <name>", "Filter by assignee")
  .option("-p, --priority <n>", "Filter by priority (0-4)", parseInt)
  .option("--all", "Show all tasks (ignore board filter)")
  .option("--json", "Output as JSON")
  .action((scope, opts) => {
    const resolved = resolvePathArg(scope);
    const scopePath = resolved.nodeRef ?? undefined;
    const config = getBeadsConfig(resolved.vaultRoot);

    const filter: Partial<IssueFilter> = {};
    if (opts.type) filter.type = opts.type;
    if (opts.assignee) filter.assignee = opts.assignee;
    if (opts.priority !== undefined) filter.priority = opts.priority;

    // Use board filter from config unless --all or explicit scope given
    const boardTag = opts.all || scope ? undefined : config.board || undefined;
    const issues = queryReady(filter, scopePath, boardTag);

    if (opts.json) {
      console.log(JSON.stringify(issues.map(issueToBdJson), null, 2));
      return;
    }

    if (issues.length === 0) {
      const scopeMsg = scopePath
        ? ` in ${scopePath}`
        : boardTag
          ? ` on @${boardTag}`
          : "";
      console.log(chalk.yellow(`No ready issues found${scopeMsg}.`));
      return;
    }

    const scopeMsg = scopePath
      ? ` in ${scopePath}`
      : boardTag
        ? ` on @${boardTag}`
        : "";
    console.log(
      chalk.bold(
        `📋 Ready work (${issues.length} issues with no blockers${scopeMsg}):\n`,
      ),
    );
    issues.forEach((issue, i) => {
      printReadyIssue(issue, i + 1);
    });
  });

// bd list [scope] - List issues with filters
bdCommand
  .command("list [scope]")
  .description("List issues with optional filters")
  .option(
    "-s, --status <status>",
    "Filter by status (todo,wip,blocked,done,dropped)",
  )
  .option("-t, --type <type>", "Filter by issue type")
  .option("-a, --assignee <name>", "Filter by assignee")
  .option("-p, --priority <n>", "Filter by priority", parseInt)
  .option("--blocked", "Show only blocked issues")
  .option("--unblocked", "Show only unblocked issues")
  .option("--all", "Show all tasks (ignore board filter)")
  .option("--json", "Output as JSON")
  .action((scope, opts) => {
    const resolved = resolvePathArg(scope);
    const scopePath = resolved.nodeRef ?? undefined;
    const config = getBeadsConfig(resolved.vaultRoot);

    const filter: IssueFilter = {};
    if (opts.status) filter.status = opts.status.split(",");
    if (opts.type) filter.type = opts.type;
    if (opts.assignee) filter.assignee = opts.assignee;
    if (opts.priority !== undefined) filter.priority = opts.priority;
    if (opts.blocked) filter.blocked = true;
    if (opts.unblocked) filter.blocked = false;

    // Use board filter from config unless --all or explicit scope given
    const boardTag = opts.all || scope ? undefined : config.board || undefined;
    const issues = queryIssues(filter, scopePath, boardTag);

    if (opts.json) {
      console.log(JSON.stringify(issues.map(issueToBdJson), null, 2));
      return;
    }

    if (issues.length === 0) {
      const scopeMsg = scopePath
        ? ` in ${scopePath}`
        : boardTag
          ? ` on @${boardTag}`
          : "";
      console.log(chalk.yellow(`No issues found${scopeMsg}.`));
      return;
    }

    const scopeMsg = scopePath
      ? ` in ${scopePath}`
      : boardTag
        ? ` on @${boardTag}`
        : "";
    console.log(chalk.bold(`Issues (${issues.length}${scopeMsg}):\n`));
    for (const issue of issues) {
      printIssue(issue);
    }
  });

// bd show [id] - Show issue details
const showCmd = bdCommand
  .command("show [id]")
  .description("Show issue details")
  .option("--json", "Output as JSON")
  .action((id, opts) => {
    if (!id) {
      showCmd.outputHelp();
      return;
    }

    const issue = resolveIssueArg(id);

    if (!issue) {
      console.error(chalk.red(`Issue not found: ${id}`));
      process.exitCode = 1;
      return;
    }

    if (opts.json) {
      console.log(JSON.stringify(issueToBdJson(issue), null, 2));
      return;
    }

    printIssueDetails(issue);
  });

// bd create <title> - Create a new issue
bdCommand
  .command("create <title>")
  .description("Create a new issue")
  .option("-t, --type <type>", "Issue type (bug, feature, epic, task, docs)")
  .option("-p, --priority <n>", "Priority (0-4, default: 2)", parseInt)
  .option("-a, --assignee <name>", "Assign to person")
  .option("-l, --label <labels...>", "Add labels")
  .option("--id <custom>", "Custom short ID")
  .option("--parent <id>", "Parent issue for sub-issues")
  .option("--json", "Output as JSON")
  .action((title, opts) => {
    const { node, shortId } = createIssueNode(title, {
      type: opts.type,
      priority: opts.priority,
      assignee: opts.assignee,
      labels: opts.label,
      customId: opts.id,
      parentId: opts.parent,
    });

    if (opts.json) {
      console.log(JSON.stringify({ shortId, node }, null, 2));
      return;
    }

    console.log(chalk.green(`Created issue: ${shortId}`));
    console.log(chalk.dim(`Title: ${title}`));
    if (opts.type) console.log(chalk.dim(`Type: ${opts.type}`));
    console.log(chalk.dim(`Priority: P${opts.priority ?? 2}`));

    // Note: Actual persistence requires km-storage integration
    console.log(
      chalk.yellow("\nNote: Issue created in memory. Persistence pending."),
    );
  });

// bd update [id] - Update issue fields
const updateCmd = bdCommand
  .command("update [id]")
  .description("Update issue status, priority, or assignee")
  .option(
    "-s, --status <status>",
    "Set status (todo, wip, blocked, done, dropped)",
  )
  .option("-p, --priority <n>", "Set priority (0-4)", parseInt)
  .option("-a, --assignee <name>", "Set assignee")
  .option("-t, --title <title>", "Set title")
  .action((id, opts) => {
    if (!id) {
      updateCmd.outputHelp();
      return;
    }

    const issue = resolveIssueArg(id);
    if (!issue) {
      console.error(chalk.red(`Issue not found: ${id}`));
      process.exitCode = 1;
      return;
    }

    const changes: Parameters<typeof updateIssueFields>[1] = {};
    if (opts.status) changes.status = opts.status as Issue["status"];
    if (opts.priority !== undefined) changes.priority = opts.priority;
    if (opts.assignee) changes.assignee = opts.assignee;
    if (opts.title) changes.title = opts.title;

    const updates = updateIssueFields(issue, changes);

    console.log(chalk.green(`Updated ${issue.shortId}:`));
    if (updates.task_status) {
      console.log(chalk.dim(`  Status: ${updates.task_status}`));
    }
    if (updates.priority !== undefined) {
      console.log(chalk.dim(`  Priority: P${updates.priority}`));
    }
    if (updates.content) console.log(chalk.dim(`  Title: ${updates.content}`));

    console.log(
      chalk.yellow("\nNote: Update created in memory. Persistence pending."),
    );
  });

// bd close [id] - Close an issue
const closeCmd = bdCommand
  .command("close [id]")
  .description("Close an issue (mark as done)")
  .option("-r, --reason <reason>", "Close reason")
  .action((id, opts) => {
    if (!id) {
      closeCmd.outputHelp();
      return;
    }

    const issue = resolveIssueArg(id);
    if (!issue) {
      console.error(chalk.red(`Issue not found: ${id}`));
      process.exitCode = 1;
      return;
    }

    const updates = closeIssueFields(opts.reason);
    void updates; // Use updates for persistence later

    console.log(chalk.green(`Closed ${issue.shortId}`));
    if (opts.reason) console.log(chalk.dim(`Reason: ${opts.reason}`));
    console.log(
      chalk.yellow("\nNote: Update created in memory. Persistence pending."),
    );
  });

// bd drop [id] - Drop an issue
const dropCmd = bdCommand
  .command("drop [id]")
  .description("Drop an issue (mark as won't do)")
  .option("-r, --reason <reason>", "Drop reason")
  .action((id, opts) => {
    if (!id) {
      dropCmd.outputHelp();
      return;
    }

    const issue = resolveIssueArg(id);
    if (!issue) {
      console.error(chalk.red(`Issue not found: ${id}`));
      process.exitCode = 1;
      return;
    }

    const updates = dropIssueFields(opts.reason);
    void updates;

    console.log(chalk.yellow(`Dropped ${issue.shortId}`));
    if (opts.reason) console.log(chalk.dim(`Reason: ${opts.reason}`));
    console.log(
      chalk.yellow("\nNote: Update created in memory. Persistence pending."),
    );
  });

// bd dep - Manage dependencies
const depCommand = new Command("dep").description("Manage issue dependencies");

const depAddCmd = depCommand
  .command("add [id] [depends-on]")
  .description("Add a dependency (issue is blocked by depends-on)")
  .action((id, dependsOn) => {
    if (!id || !dependsOn) {
      depAddCmd.outputHelp();
      return;
    }

    const issue = resolveIssueArg(id);
    if (!issue) {
      console.error(chalk.red(`Issue not found: ${id}`));
      process.exitCode = 1;
      return;
    }

    const props = addDependency(issue, dependsOn);
    void props;

    console.log(
      chalk.green(`Added dependency: ${issue.shortId} blocked-by ${dependsOn}`),
    );
    console.log(
      chalk.yellow("\nNote: Update created in memory. Persistence pending."),
    );
  });

const depRemoveCmd = depCommand
  .command("remove [id] [depends-on]")
  .description("Remove a dependency")
  .action((id, dependsOn) => {
    if (!id || !dependsOn) {
      depRemoveCmd.outputHelp();
      return;
    }

    const issue = resolveIssueArg(id);
    if (!issue) {
      console.error(chalk.red(`Issue not found: ${id}`));
      process.exitCode = 1;
      return;
    }

    const result = removeDependency(issue, dependsOn);
    if (!result) {
      console.error(
        chalk.yellow(`${issue.shortId} does not depend on ${dependsOn}`),
      );
      return;
    }

    console.log(
      chalk.green(
        `Removed dependency: ${issue.shortId} no longer blocked-by ${dependsOn}`,
      ),
    );
    console.log(
      chalk.yellow("\nNote: Update created in memory. Persistence pending."),
    );
  });

const depListCmd = depCommand
  .command("list [id]")
  .description("List dependencies for an issue")
  .action((id) => {
    if (!id) {
      depListCmd.outputHelp();
      return;
    }

    const issue = resolveIssueArg(id);
    if (!issue) {
      console.error(chalk.red(`Issue not found: ${id}`));
      process.exitCode = 1;
      return;
    }

    const deps = getDependencies(issue);
    if (deps.length === 0) {
      console.log(chalk.dim(`${issue.shortId} has no dependencies`));
      return;
    }

    console.log(chalk.bold(`Dependencies for ${issue.shortId}:`));
    for (const dep of deps) {
      console.log(chalk.dim(`  - ${dep}`));
    }
  });

bdCommand.addCommand(depCommand);

// bd agent - Agent work queue integration
import { bdAgentCommand } from "./bd-agent.ts";
bdCommand.addCommand(bdAgentCommand);

// bd info [scope] - Show database information
bdCommand
  .command("info [scope]")
  .description("Show beads configuration and statistics")
  .action((scope) => {
    const resolved = resolvePathArg(scope);
    const scopePath = resolved.nodeRef ?? undefined;
    const config = getBeadsConfig(resolved.vaultRoot);
    const configPath = getConfigPath();

    const kmDir = getKmDir();
    const dbPath = getDbPath();
    const store = getStore();

    // Query with board filter if configured
    const boardTag = config.board || undefined;
    const issues = queryIssues({}, scopePath, boardTag);

    console.log(chalk.bold("Beads Configuration"));
    console.log("===================");
    console.log(
      `Board:  ${config.board || chalk.dim("(none - showing all tasks)")}`,
    );
    console.log(
      `Parent: ${config.parent || chalk.dim("(none - create manually)")}`,
    );
    console.log(`Prefix: ${config.prefix}`);
    if (configPath) {
      console.log(chalk.dim(`Config: ${configPath}`));
    }

    console.log();
    console.log(chalk.bold("How tasks are tracked:"));
    if (config.board) {
      console.log(
        `  Tasks tagged @${config.board} are shown by 'km bd' commands.`,
      );
      console.log(`  View the board with 'km view @${config.board}'.`);
    } else {
      console.log(
        `  All tasks in the vault are shown (no board filter configured).`,
      );
      console.log(
        `  Set beads.board in .km/config.yaml to filter to a specific board.`,
      );
    }
    if (config.parent) {
      console.log(`  New issues will be created in ${config.parent}.`);
    }

    console.log();
    console.log(chalk.bold("Storage"));
    console.log(`  Database: ${dbPath}`);
    console.log(`  Mode: ${store ? "disk" : "memory"}`);
    console.log(`  Vault: ${resolved.vaultRoot}`);
    if (kmDir) {
      console.log(`  KM Dir: ${kmDir}`);
    }
    if (scopePath) {
      console.log(`  Scope: ${scopePath}`);
    }

    console.log();
    const scopeMsg = scopePath
      ? ` in ${scopePath}`
      : boardTag
        ? ` on @${boardTag}`
        : "";
    console.log(chalk.bold(`Statistics${scopeMsg}`));
    console.log(`  Total: ${issues.length} issues`);

    // Show breakdown by status
    const byStatus = {
      open: issues.filter((i) => i.status === "todo").length,
      in_progress: issues.filter((i) => i.status === "wip").length,
      blocked: issues.filter((i) => i.status === "blocked").length,
      closed: issues.filter((i) => i.status === "done").length,
      dropped: issues.filter((i) => i.status === "dropped").length,
    };
    if (issues.length > 0) {
      console.log(
        `  Open: ${byStatus.open}, In Progress: ${byStatus.in_progress}, Blocked: ${byStatus.blocked}`,
      );
      console.log(`  Closed: ${byStatus.closed}, Dropped: ${byStatus.dropped}`);
    }

    // Show files with tasks
    const pathsWithTasks = new Set<string>();
    for (const issue of issues) {
      if (issue.path) {
        pathsWithTasks.add(issue.path);
      }
    }
    if (pathsWithTasks.size > 0) {
      console.log();
      console.log(chalk.bold("Files with tasks:"));
      const paths = Array.from(pathsWithTasks).slice(0, 5);
      for (const path of paths) {
        const count = issues.filter((i) => i.path === path).length;
        console.log(chalk.dim(`  ${path} (${count})`));
      }
      if (pathsWithTasks.size > 5) {
        console.log(
          chalk.dim(`  ... and ${pathsWithTasks.size - 5} more files`),
        );
      }
    }
  });

// bd where [scope] - Show paths
bdCommand
  .command("where [scope]")
  .description("Show beads paths and configuration")
  .action((scope) => {
    const resolved = resolvePathArg(scope);
    const kmDir = getKmDir();
    const dbPath = getDbPath();
    const config = getBeadsConfig(resolved.vaultRoot);

    if (kmDir) {
      console.log(kmDir);
      console.log(`  prefix: ${config.prefix}`);
      console.log(`  board: ${config.board || "(none)"}`);
      console.log(`  parent: ${config.parent || "(none)"}`);
      console.log(`  database: ${dbPath}`);
      console.log(`  vault: ${resolved.vaultRoot}`);
      if (resolved.nodeRef) {
        console.log(`  scope: ${resolved.nodeRef}`);
      }
    } else {
      console.log(chalk.yellow("No km directory found."));
      console.log(`  vault: ${resolved.vaultRoot}`);
    }
  });

// Add extracted subcommands
bdCommand.addCommand(configCommand);
bdCommand.addCommand(migrateCommand);
bdCommand.addCommand(exportCommand);
