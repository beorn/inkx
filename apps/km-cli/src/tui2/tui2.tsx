/**
 * TUI2 Entry Point
 *
 * OpenTUI-based board renderer.
 * Mirrors the API of tui/tui.ts for easy integration.
 *
 * NOTE: This file is currently broken because App.tsx in km-tui-opentui
 * hasn't been updated to use the tree-based model yet. See beads:
 * - km-pmub: Update km-tui-opentui App.tsx to use TreeState
 * - km-k6nb: Update km-tui-opentui views to use NodeViewModel/TreeViewModel
 */

import {
  getChildren,
  resolveNode,
  ensureState,
  getBacklinks,
  getOutgoingLinks,
} from "@km/store";
import { getNodeDisplayName } from "@km/shared";
// App is currently broken - importing directly until km-tui-opentui is fixed
// import { App } from "@km/tui-opentui";
import type { TreeNodeState, TaskStatus } from "@km/tui-core";
import type { ViewMode } from "@km/tui-core";
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
 *
 * Currently broken - App.tsx needs to be migrated to tree-based model.
 */
export async function runBoardTui2(
  rootId?: string,
  rootPath?: string,
  _options?: Tui2Options,
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

  // TODO: App needs to be migrated to tree-based model
  // See beads: km-pmub, km-k6nb
  console.error(
    "TUI2 is temporarily broken - App.tsx needs migration to tree model",
  );
  console.error("See beads: km-pmub, km-k6nb");
  process.exit(1);
}
