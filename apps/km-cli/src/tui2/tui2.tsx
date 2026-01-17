/**
 * TUI2 Entry Point
 *
 * OpenTUI-based board renderer.
 * Mirrors the API of tui/tui.ts for easy integration.
 */

import {
  getChildren,
  resolveNode,
  ensureState,
  getBacklinks,
} from "@km/storage";
import { getNodeDisplayName as getNodeDisplayNameBase } from "@km/tree";

// Bound version with store dependency
const getNodeDisplayName = (
  node: Parameters<typeof getNodeDisplayNameBase>[0],
) => getNodeDisplayNameBase(node, getChildren);

import { App } from "@km/opentui";
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import type { TNode, TaskStatus, ViewMode } from "@km/board";
import type { DBNode } from "@km/core";

/**
 * Emergency terminal restore - writes ANSI escape sequences directly
 * to restore terminal to a usable state even if OpenTUI cleanup fails.
 *
 * This handles the case where Bun crashes with SIGTRAP during exit,
 * leaving the terminal in raw mode with hidden cursor, etc.
 */
function emergencyTerminalRestore(): void {
  try {
    const stdout = process.stdout;
    // Show cursor
    stdout.write("\x1b[?25h");
    // Leave alternate screen buffer
    stdout.write("\x1b[?1049l");
    // Reset all attributes
    stdout.write("\x1b[0m");
    // Clear from cursor to end of screen
    stdout.write("\x1b[J");
    // Disable raw mode if possible
    if (process.stdin.isTTY && process.stdin.setRawMode) {
      process.stdin.setRawMode(false);
    }
  } catch {
    // Ignore errors during emergency restore
  }
}

export interface Tui2Options {
  initialViewMode?: ViewMode;
}

/**
 * Convert DBNode to TNode (recursive)
 */
function nodeToTNode(node: DBNode, depth: number): TNode {
  const children = getChildren(node.id);
  const backlinks = getBacklinks(node.id);
  // Note: outgoing links are not displayed - only backlinks are useful to show

  return {
    nodeId: node.id,
    name: node.name || node.title || node.id,
    title: getNodeDisplayName(node),
    depth,
    childCount: children.length,
    parentId: node.parent_id ?? null,
    parentIndex: node.parent_idx ?? 0,
    isTask: node.task_status !== undefined,
    taskStatus: node.task_status as TaskStatus | undefined,
    color: node.rules?.color,
    icon: undefined,
    priority: node.priority,
    dueDate: node.due_date,
    scheduledDate: node.scheduled_date,
    hasBacklinks: backlinks.length > 0 || undefined,
    // Don't display outgoing links count - only backlinks are useful to show
    // refsCount: outgoingLinks.length > 0 ? outgoingLinks.length : undefined,
    body: node.content,
    fsPath: node.fs_path,
    mdLine: node.md_line,
    nodeType: node.type as TNode["nodeType"],
    children: children.map((child, idx) => {
      const childTNode = nodeToTNode(child, depth + 1);
      childTNode.parentId = node.id;
      childTNode.parentIndex = child.parent_idx ?? idx;
      return childTNode;
    }),
  };
}

/**
 * Build tree nodes from root node
 */
function buildTreeNodes(rootId: string | null): TNode[] {
  if (!rootId) {
    const roots = getChildren(null);
    return roots.map((node) => nodeToTNode(node, 0));
  }

  const node = resolveNode(rootId);
  if (!node) {
    return [];
  }

  const children = getChildren(node.id);
  return children.map((child) => nodeToTNode(child, 0));
}

/**
 * Run the TUI2 board view
 */
export async function runBoardTui2(
  rootId?: string,
  rootPath?: string,
  options?: Tui2Options,
): Promise<void> {
  const stdin = process.stdin;
  const stdout = process.stdout;

  // Check if we're in a TTY
  if (!stdin.isTTY || !stdout.isTTY) {
    console.error("TUI2 requires a TTY");
    process.exit(1);
  }

  // Ensure store is initialized
  if (rootPath) {
    ensureState(rootPath, false);
  }

  const nodes = buildTreeNodes(rootId || null);

  if (nodes.length === 0) {
    console.error("No nodes found");
    process.exit(1);
  }

  // Track if we've already started cleanup to prevent double-exit
  let isExiting = false;

  // Clean exit handler - ensures terminal state is restored
  const cleanExit = (code: number = 0) => {
    if (isExiting) return;
    isExiting = true;
    renderer.destroy();
    process.exit(code);
  };

  // Create renderer with:
  // - exitOnCtrlC: OpenTUI handles Ctrl+C -> destroy() -> exit
  // - onDestroy: Called after destroy() completes, we exit the process
  // - exitSignals: OpenTUI handles SIGINT, SIGTERM, SIGQUIT, SIGABRT by default
  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
    onDestroy: () => {
      // This is called after renderer.destroy() completes
      // Exit cleanly (OpenTUI has already restored terminal state)
      if (!isExiting) {
        isExiting = true;
        process.exit(0);
      }
    },
  });

  // Handle uncaught exceptions - try to clean up terminal before crashing
  const handleUncaughtError = (error: Error) => {
    // Attempt cleanup before crash
    try {
      renderer.destroy();
    } catch {
      // Fallback to emergency restore if OpenTUI cleanup fails
      emergencyTerminalRestore();
    }
    console.error("Uncaught error:", error);
    process.exit(1);
  };

  process.on("uncaughtException", handleUncaughtError);
  process.on("unhandledRejection", (reason) => {
    handleUncaughtError(
      reason instanceof Error ? reason : new Error(String(reason)),
    );
  });

  // Handle SIGTRAP - Bun 1.3.5 on Apple Silicon has a bug where it crashes
  // with SIGTRAP during process exit. Try to restore terminal state first.
  // Note: SIGTRAP may not be catchable in all cases, but this helps when it is.
  process.on("SIGTRAP", () => {
    emergencyTerminalRestore();
    process.exit(128 + 5); // 133 = 128 + SIGTRAP(5)
  });

  // Also handle beforeExit to ensure terminal is restored
  process.on("beforeExit", () => {
    emergencyTerminalRestore();
  });

  createRoot(renderer).render(
    <App
      initialNodes={nodes}
      rootId={rootId ?? null}
      rootPath={rootPath ?? null}
      initialViewMode={options?.initialViewMode}
      onExit={() => cleanExit(0)}
    />,
  );
}
