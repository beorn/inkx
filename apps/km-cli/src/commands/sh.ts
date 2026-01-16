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
import { createReadStream, existsSync, readFileSync, appendFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { getRootPath } from "../index.ts";
import { ensureState, getStore, getChildren, resolveNode } from "@km/store";
import { getNodeDisplayName } from "@km/shared";
import {
  createInitialTreeState,
  runShell,
  executeCommand,
  serializeState,
  getCommandNames,
  type TreeNodeState,
  type TaskStatus,
  type OutputEvent,
  type ShellContext,
} from "@km/tui-core";
import type { Node } from "@km/core";

// OSC 133 Shell Integration Protocol (Kitty, WezTerm, iTerm2, VS Code)
// Emitted automatically when running in a real TTY, or when TERM_SHELL_INTEGRATION=1
const OSC_133_A = "\x1b]133;A\x07"; // Prompt start (ready for input)
const OSC_133_C = "\x1b]133;C\x07"; // Command start (execution beginning)
const osc133D = (exitCode: number) => `\x1b]133;D;${exitCode}\x07`; // Command end

/**
 * Determine if we should emit OSC 133 sequences
 * - Auto-enabled when stdout is a real TTY (interactive terminal)
 * - Force-enabled via TERM_SHELL_INTEGRATION=1 (for mdtest PTY mode)
 * - Force-disabled via TERM_SHELL_INTEGRATION=0
 */
function shouldEmitOsc133(): boolean {
  const envFlag = process.env.TERM_SHELL_INTEGRATION;
  if (envFlag === "1") return true;
  if (envFlag === "0") return false;
  // Auto-detect: emit if running in a real TTY
  return process.stdout.isTTY === true;
}

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

    // Output function
    const output = (event: OutputEvent | string) => {
      if (typeof event === "string") {
        console.log(event);
      } else {
        console.log(JSON.stringify(event));
      }
    };

    // Read input: -c takes priority, then -f, then stdin (REPL mode)
    const cmdStrings: string[] | undefined = options.command;

    if (cmdStrings && cmdStrings.length > 0) {
      // Batch mode: -c flag with commands
      const lines = cmdStrings.flatMap(parseCommandString);
      const finalState = runShell(lines, initialState, {
        jsonMode: options.json ?? false,
        verbose: options.verbose ?? false,
        output,
      });

      if (options.json) {
        console.log(
          JSON.stringify({
            event: "final",
            state: serializeState(finalState),
            ts: Date.now(),
          }),
        );
      }
    } else if (options.file) {
      // Batch mode: -f flag with file
      const lines = await readInputLines(options.file);
      const finalState = runShell(lines, initialState, {
        jsonMode: options.json ?? false,
        verbose: options.verbose ?? false,
        output,
      });

      if (options.json) {
        console.log(
          JSON.stringify({
            event: "final",
            state: serializeState(finalState),
            ts: Date.now(),
          }),
        );
      }
    } else {
      // REPL mode: read from stdin line by line, execute immediately
      const ctx: ShellContext = {
        state: initialState,
        jsonMode: options.json ?? false,
        verbose: options.verbose ?? false,
        output,
        actionLog: [],
      };

      // OSC 133 shell integration - auto-enabled in TTY or via env var
      const useOsc133 = shouldEmitOsc133();

      // History file path
      const historyPath = join(homedir(), ".km_history");

      // Load history from file
      let history: string[] = [];
      try {
        const historyContent = readFileSync(historyPath, "utf-8");
        history = historyContent
          .split("\n")
          .filter((line) => line.trim().length > 0);
      } catch {
        // No history file yet, that's fine
      }

      // Get all command names for completion
      const commandNames = getCommandNames();

      // Tab completion function
      const completer = (line: string): [string[], string] => {
        // Complete command names
        const hits = commandNames.filter((cmd) =>
          cmd.startsWith(line.toLowerCase()),
        );
        // Show all completions if none found
        return [hits.length ? hits : commandNames, line];
      };

      const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
        completer,
        history,
        historySize: 1000,
        crlfDelay: Infinity,
        terminal: process.stdin.isTTY ?? false,
        prompt: "",
      });

      // Signal prompt ready
      if (useOsc133) {
        process.stdout.write(OSC_133_A);
      }

      await new Promise<void>((resolve) => {
        rl.on("line", (line) => {
          // Signal command start
          if (useOsc133) {
            process.stdout.write(OSC_133_C);
          }

          const { state, quit } = executeCommand(line, ctx);
          ctx.state = state;

          // Append to history file (only non-empty lines)
          if (line.trim().length > 0) {
            try {
              appendFileSync(historyPath, line + "\n");
            } catch {
              // Ignore history write errors
            }
          }

          // Signal command end (exit code 0 - shell commands don't have exit codes yet)
          if (useOsc133) {
            process.stdout.write(osc133D(0));
            // Signal next prompt ready (unless quitting)
            if (!quit) {
              process.stdout.write(OSC_133_A);
            }
          }

          if (quit) {
            rl.close();
          }
        });

        rl.on("close", () => {
          resolve();
        });
      });

      if (options.json) {
        console.log(
          JSON.stringify({
            event: "final",
            state: serializeState(ctx.state),
            ts: Date.now(),
          }),
        );
      }
    }
  });
