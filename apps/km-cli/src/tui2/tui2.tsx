/**
 * TUI2 Entry Point
 *
 * OpenTUI-based board renderer.
 * Mirrors the API of tui/tui.ts for easy integration.
 */

import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { getStore, getChildren, resolveNode, ensureState } from "@km/store";
import { getNodeDisplayName } from "@km/shared";
import { App } from "@km/tui-opentui";
import type { ColumnState, CardState, TaskStatus } from "@km/tui-opentui";
import type { Node } from "@km/core";
import type { ViewMode } from "@km/tui-core";

export interface Tui2Options {
  initialViewMode?: ViewMode;
}

/**
 * Convert Node to CardState
 */
function nodeToCardState(node: Node): CardState {
  const children = getChildren(node.id);
  return {
    nodeId: node.id,
    title: getNodeDisplayName(node),
    childCount: children.length,
    isTask: node.task_status !== undefined,
    taskStatus: node.task_status as TaskStatus | undefined,
    color: undefined,
    icon: undefined,
  };
}

/**
 * Convert Node to ColumnState
 */
function nodeToColumnState(node: Node): ColumnState {
  const children = getChildren(node.id);
  return {
    nodeId: node.id,
    title: getNodeDisplayName(node),
    cards: children.map(nodeToCardState),
    wipLimit: undefined,
  };
}

/**
 * Build columns from root node
 */
function buildColumns(rootId: string | null): ColumnState[] {
  if (!rootId) {
    const roots = getChildren(null);
    if (roots.length === 0) {
      return [];
    }
    return roots.map(nodeToColumnState);
  }

  const node = resolveNode(rootId);
  if (!node) {
    return [];
  }

  const children = getChildren(node.id);
  return children.map(nodeToColumnState);
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

  const store = getStore();
  const columns = buildColumns(rootId || null);

  if (columns.length === 0) {
    console.error("No columns found");
    process.exit(1);
  }

  // Create renderer and mount app
  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
  });

  // Exit handler that properly destroys the renderer
  const handleExit = () => {
    renderer.destroy();
  };

  createRoot(renderer).render(
    <App
      initialColumns={columns}
      rootPath={rootPath || store.rootPath}
      initialViewMode={options?.initialViewMode || "cards"}
      onExit={handleExit}
    />,
  );
}
