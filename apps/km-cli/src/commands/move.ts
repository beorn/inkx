/**
 * Move Command
 *
 * Re-parent a node to a different location
 *
 * km move <node> <parent>          # Move by ID, path, or filename
 * km move <node> --project "Name"  # Move by project name
 * km move <node> --root            # Move to root level
 */

import { Command } from "commander";
import chalk from "chalk";
import {
  resolveNode,
  getStore,
  getChildren,
  resolvePathArg,
  ensureState,
  runGenerator,
  findProject,
} from "@km/storage";
import { getRootPath } from "../index.ts";
import { getNodeDisplayName as getNodeDisplayNameBase } from "@km/tree";

// Bound version with store dependency
const getNodeDisplayName = (
  node: Parameters<typeof getNodeDisplayNameBase>[0],
) => getNodeDisplayNameBase(node, getChildren);
import type { KNode } from "@km/core";

export const moveCommand = new Command("move")
  .description("Move a node to a different parent")
  .argument("<node>", "Node to move (ID, path, or filename)")
  .argument("[parent]", "Target parent (ID, path, or filename)")
  .option("-p, --project <name>", "Move to project by name")
  .option("--to-root", "Move to root level (no parent)")
  .option("--json", "Output as JSON")
  .action((nodeArg, parentArg, options) => {
    // Resolve the node argument - may detect vault root from path
    const resolvedNode = resolvePathArg(nodeArg, getRootPath());
    runGenerator(ensureState(resolvedNode.vaultRoot, false));

    if (!resolvedNode.nodeRef) {
      console.error(chalk.red(`Cannot move a directory`));
      process.exit(1);
    }

    // Find the node to move
    const node = resolveNode(resolvedNode.nodeRef);
    if (!node) {
      console.error(chalk.red(`Node not found: ${nodeArg}`));
      process.exit(1);
    }

    // Determine target parent
    let targetParent: KNode | null = null;
    let targetParentId: string | null = null;

    if (options.toRoot) {
      // Move to root - null parent
      targetParentId = null;
    } else if (options.project) {
      // Find project by name
      targetParent = findProject(options.project);
      if (!targetParent) {
        console.error(chalk.red(`Project not found: ${options.project}`));
        process.exit(1);
      }
      targetParentId = targetParent.id;
    } else if (parentArg) {
      // Resolve parent path argument
      const resolvedParent = resolvePathArg(parentArg, resolvedNode.vaultRoot);
      if (!resolvedParent.nodeRef) {
        console.error(chalk.red(`Cannot use a directory as parent`));
        process.exit(1);
      }
      // Find parent by ID/path/filename
      targetParent = resolveNode(resolvedParent.nodeRef);
      if (!targetParent) {
        console.error(chalk.red(`Parent not found: ${parentArg}`));
        process.exit(1);
      }
      targetParentId = targetParent.id;
    } else {
      console.error(chalk.red("Specify a parent, --project, or --root"));
      process.exit(1);
    }

    // Don't move to self
    if (targetParentId === node.id) {
      console.error(chalk.red("Cannot move a node to itself"));
      process.exit(1);
    }

    // Don't move to current parent (no-op)
    if (targetParentId === node.parent_id) {
      if (options.json) {
        console.log(
          JSON.stringify({
            id: node.id,
            parent_id: targetParentId,
            unchanged: true,
          }),
        );
        return;
      }
      console.log(chalk.yellow("Node is already at this location"));
      return;
    }

    // Move via store (handles event emission and persistence)
    const store = getStore();
    store.moveNode(node.id, targetParentId);

    if (options.json) {
      console.log(JSON.stringify({ id: node.id, parent_id: targetParentId }));
      return;
    }

    const nodeName = getNodeDisplayName(node);
    const targetName = targetParent
      ? getNodeDisplayName(targetParent)
      : "(root)";

    console.log(chalk.green("→"), `Moved ${nodeName} to ${targetName}`);
  });
