/**
 * TUI2 Real Data Test
 *
 * Tests the new architecture with actual km-store data.
 * Run with: bun apps/km-cli/src/tui2/test-real.tsx -r <vault-path> [file]
 */

import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { parseArgs } from "util";
import { ensureState, getStore, getChildren, resolveNode } from "@km/store";
import { getNodeDisplayName } from "@km/shared";
import { App } from "./App.tsx";
import type { ColumnState, CardState, TaskStatus } from "./types.ts";
import type { Node } from "@km/core";

// Parse CLI args
const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    root: { type: "string", short: "r" },
  },
  allowPositionals: true,
});

const vaultPath = values.root;
const targetFile = positionals[0];

if (!vaultPath) {
  console.error("Usage: bun test-real.tsx -r <vault-path> [file]");
  process.exit(1);
}

// Initialize store
console.log(`Loading vault: ${vaultPath}`);
ensureState(vaultPath, false);
const store = getStore();
console.log(`Store loaded in ${store.mode} mode: ${store.rootPath}`);

/**
 * Convert Node to CardState
 */
function nodeToCardState(node: Node): CardState {
  const children = getChildren(node.id);
  return {
    nodeId: node.id,
    title: getNodeDisplayName(node),
    childCount: children.length,
    isTask: !!node.task,
    taskStatus: node.task?.status as TaskStatus | undefined,
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
    wipLimit: undefined, // Could parse from frontmatter
  };
}

/**
 * Build columns from root node
 */
function buildColumns(rootId: string | null): ColumnState[] {
  if (!rootId) {
    // No root specified - show root-level nodes as columns
    // This is the same behavior as initBoardState(undefined)
    const roots = getChildren(null);
    if (roots.length === 0) {
      console.error("No root nodes found in vault");
      return [];
    }
    return roots.map(nodeToColumnState);
  }

  // Find specific node using resolveNode (supports ID, path, or filename)
  const node = resolveNode(rootId);
  if (!node) {
    console.error(`Could not find node: ${rootId}`);
    return [];
  }

  const children = getChildren(node.id);
  return children.map(nodeToColumnState);
}

// Build state
const columns = buildColumns(targetFile || null);
console.log(`Loaded ${columns.length} columns`);

if (columns.length === 0) {
  console.error("No columns found");
  process.exit(1);
}

// Run the app
const renderer = await createCliRenderer({
  exitOnCtrlC: true,
});

createRoot(renderer).render(
  <App
    initialColumns={columns}
    rootPath={store.rootPath}
    initialViewMode="cards"
  />,
);
