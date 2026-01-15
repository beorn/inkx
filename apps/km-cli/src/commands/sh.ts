/**
 * Shell Command - km sh
 *
 * Non-interactive shell for scripting and debugging TUI.
 * Reads commands from stdin (or file), executes them against TreeState,
 * and outputs trace/state to stdout.
 *
 * Usage:
 *   km sh @inbox.md -c 'move_down; move_down; state'
 *   echo 'move_down\nstate' | km sh @inbox.md
 *   km sh --json @inbox.md < commands.txt
 */

import { Command } from "commander";
import { createInterface } from "readline";
import { createReadStream, existsSync } from "fs";
import { getRootPath } from "../index.ts";
import { ensureState, getStore, getChildren, resolveNode } from "@km/store";
import { getNodeDisplayName } from "@km/shared";
import {
  createInitialTreeState,
  runShell,
  serializeState,
  type TreeNodeState,
  type TaskStatus,
  type OutputEvent,
} from "@km/tui-core";
import type { Node } from "@km/core";

/**
 * Convert Node to TreeNodeState (recursive)
 */
function nodeToTreeNodeState(node: Node, depth: number): TreeNodeState {
  const children = getChildren(node.id);
  return {
    nodeId: node.id,
    title: getNodeDisplayName(node),
    children: children.map((child) => nodeToTreeNodeState(child, depth + 1)),
    childCount: children.length,
    isTask: node.task_status !== undefined,
    taskStatus: node.task_status as TaskStatus | undefined,
    color: undefined,
    icon: undefined,
    depth,
  };
}

/**
 * Build tree nodes from root
 */
function buildNodes(rootId: string | null): TreeNodeState[] {
  if (!rootId) {
    const roots = getChildren(null);
    if (roots.length === 0) {
      return [];
    }
    return roots.map((node) => nodeToTreeNodeState(node, 0));
  }

  const node = resolveNode(rootId);
  if (!node) {
    return [];
  }

  const children = getChildren(node.id);
  return children.map((child) => nodeToTreeNodeState(child, 0));
}

/**
 * Read all lines from stdin or a file
 */
async function readInputLines(inputFile?: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const lines: string[] = [];
    const input =
      inputFile && existsSync(inputFile)
        ? createReadStream(inputFile)
        : process.stdin;

    const rl = createInterface({
      input,
      crlfDelay: Infinity,
    });

    rl.on("line", (line) => {
      lines.push(line);
    });

    rl.on("close", () => {
      resolve(lines);
    });

    rl.on("error", reject);
  });
}

/**
 * Parse commands from -c option
 * Supports semicolon or newline separated commands
 */
function parseCommandString(cmdString: string): string[] {
  return cmdString
    .split(/[;\n]/)
    .map((cmd) => cmd.trim())
    .filter((cmd) => cmd.length > 0);
}

export const shCommand = new Command("sh")
  .description("Non-interactive shell for scripting and debugging TUI")
  .argument("[root]", "Root node ID to start view from")
  .option("--json", "JSON mode: input and output as NDJSON")
  .option(
    "-c, --command <commands...>",
    "Execute commands (repeatable, semicolon/newline separated)",
  )
  .option("-f, --file <path>", "Read commands from file instead of stdin")
  .option("-v, --verbose", "Output JSON action event for each command")
  .action(async (root, options) => {
    // Get the filesystem root path
    const fsPath = getRootPath() || getStore().rootPath;

    // Ensure store is initialized
    if (fsPath) {
      ensureState(fsPath, false);
    }

    const store = getStore();
    const nodes = buildNodes(root || null);

    if (nodes.length === 0) {
      if (options.json) {
        console.log(
          JSON.stringify({
            event: "error",
            error: "No nodes found",
            ts: Date.now(),
          }),
        );
      } else {
        console.error("error: No nodes found");
      }
      process.exit(1);
    }

    // Create initial state
    const initialState = createInitialTreeState(
      nodes,
      root || null,
      store.rootPath,
    );

    // Read input: -c takes priority, then -f, then stdin
    const cmdStrings: string[] | undefined = options.command;
    let lines: string[];
    if (cmdStrings && cmdStrings.length > 0) {
      // Flatten all -c arguments, each can have multiple commands
      lines = cmdStrings.flatMap(parseCommandString);
    } else {
      lines = await readInputLines(options.file);
    }

    // Output function
    const output = (event: OutputEvent | string) => {
      if (typeof event === "string") {
        console.log(event);
      } else {
        console.log(JSON.stringify(event));
      }
    };

    // Run the shell
    const finalState = runShell(lines, initialState, {
      jsonMode: options.json ?? false,
      verbose: options.verbose ?? false,
      output,
    });

    // In JSON mode, output final state
    if (options.json) {
      console.log(
        JSON.stringify({
          event: "final",
          state: serializeState(finalState),
          ts: Date.now(),
        }),
      );
    }
  });
