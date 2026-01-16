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
  getOutgoingLinks,
} from "@km/store";
import { getNodeDisplayName } from "@km/shared";
import { App } from "@km/tui-opentui";
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import type { TreeNodeState, TaskStatus, ViewMode } from "@km/tui-core";
import type { Node } from "@km/core";

export interface Tui2Options {
  initialViewMode?: ViewMode;
}

/**
 * Convert Node to TreeNodeState (recursive)
 */
function nodeToTreeNodeState(node: Node, depth: number): TreeNodeState {
  const children = getChildren(node.id);
  const backlinks = getBacklinks(node.id);
  const outgoingLinks = getOutgoingLinks(node.id);

  return {
    nodeId: node.id,
    title: getNodeDisplayName(node),
    depth,
    childCount: children.length,
    isTask: node.task_status !== undefined,
    taskStatus: node.task_status as TaskStatus | undefined,
    color: node.rules?.color,
    priority: node.priority,
    dueDate: node.due_date,
    hasBacklinks: backlinks.length > 0 || undefined,
    refsCount: outgoingLinks.length > 0 ? outgoingLinks.length : undefined,
    content: node.content,
    children: children.map((child) => nodeToTreeNodeState(child, depth + 1)),
  };
}

/**
 * Build tree nodes from root node
 */
function buildTreeNodes(rootId: string | null): TreeNodeState[] {
  if (!rootId) {
    const roots = getChildren(null);
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
      // Ignore cleanup errors during crash
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
