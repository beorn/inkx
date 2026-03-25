/**
 * Worktree Command
 *
 * Thin wrapper around tools/tools/worktree.ts for km-cli integration.
 * The actual implementation lives in the shared library.
 *
 * km worktree create <name> [branch]  # Create worktree at ../km-<name>
 * km worktree remove <name>           # Remove worktree
 * km worktree list                    # List all worktrees with status
 */

import { Command } from "@commander-js/extra-typings"
import { createWorktree, removeWorktree, listWorktrees, showDefaultInfo } from "bearly/tools/worktree"

// ============================================
// Subcommands
// ============================================

const createCommand = new Command("create")
  .description("Create a new worktree with km setup")
  .argument("<name>", "Name for the worktree (creates ../km-<name>)")
  .argument("[branch]", "Branch name (defaults to feat/<name>)")
  .option("--no-install", "Skip bun install")
  .option("--no-direnv", "Skip direnv allow")
  .option("--no-hooks", "Skip hook installation")
  .option("--allow-dirty", "Create even with uncommitted changes (not recommended)")
  .action(async (name, branch, options) => {
    await createWorktree(name, branch, {
      install: options.install,
      direnv: options.direnv,
      hooks: options.hooks,
      allowDirty: options.allowDirty,
    })
  })

const removeCommand = new Command("remove")
  .description("Remove a worktree")
  .argument("<name>", "Name of the worktree to remove")
  .option("--delete-branch", "Also delete the branch")
  .option("-f, --force", "Force removal even with uncommitted changes")
  .action(async (name, options) => {
    await removeWorktree(name, {
      deleteBranch: options.deleteBranch,
      force: options.force,
    })
  })

const listCommand = new Command("list")
  .description("List all worktrees with status")
  .alias("ls")
  .action(async () => {
    await listWorktrees(true)
  })

// ============================================
// Main Export
// ============================================

export const worktreeCommand = new Command("worktree")
  .description("Manage git worktrees with km-specific setup")
  .addCommand(createCommand)
  .addCommand(removeCommand)
  .addCommand(listCommand)
  .action(showDefaultInfo)
