/**
 * Board Adapter
 *
 * Builds TNode trees from Vault for legacy code paths.
 *
 * NOTE: This module is being phased out. New code should:
 * - Use vault.getChildren() directly instead of TNode trees
 * - Use deriveColumnsFromVault() from hooks/use-columns.ts
 * - Use useCursorPosition() from hooks/use-cursor-position.ts
 */

import type { TNode } from "@km/core";
import type { KNode } from "@km/core";
import type { ColumnIndices } from "@km/board";
import { pathToColumnIndices, columnIndicesToPath } from "@km/board";
import type { Vault } from "./vault-context.tsx";

/**
 * Convert a KNode to a shallow TNode (children not loaded).
 * Use for fast initial load and refresh.
 */
function kNodeToTNodeShallow(vault: Vault, node: KNode, depth: number): TNode {
  return {
    id: node.id,
    type: node.type,
    parent_id: node.parent_id,
    parent_idx: node.parent_idx,
    link_to: node.link_to ?? null,
    name: node.name ?? node.title ?? "",
    title: node.title ?? "",
    children: [],
    childCount: vault.getChildren(node.id).length,
    childrenLoaded: false,
    isTask: node.type === "task",
    depth,
    data: node.data ?? {},
    created_at: node.created_at,
    updated_at: node.updated_at,
    version: node.version ?? "",
    task_status: node.task_status,
    task_mark: node.task_mark,
    content: node.content,
  };
}

/**
 * Convert a KNode to a TNode with children loaded (one level deep).
 * Children are loaded as shallow nodes.
 */
function kNodeToTNodeWithChildren(
  vault: Vault,
  node: KNode,
  depth: number,
): TNode {
  const children = vault.getChildren(node.id);
  return {
    id: node.id,
    type: node.type,
    parent_id: node.parent_id,
    parent_idx: node.parent_idx,
    link_to: node.link_to ?? null,
    name: node.name ?? node.title ?? "",
    title: node.title ?? "",
    children: children.map((child) =>
      kNodeToTNodeShallow(vault, child, depth + 1),
    ),
    childCount: children.length,
    childrenLoaded: true,
    isTask: node.type === "task",
    depth,
    data: node.data ?? {},
    created_at: node.created_at,
    updated_at: node.updated_at,
    version: node.version ?? "",
    task_status: node.task_status,
    task_mark: node.task_mark,
    content: node.content,
  };
}

// ===== Direct Tree Building =====

/**
 * Non-column types that should be filtered out when building board columns.
 * These are content blocks, not navigable column headers.
 * Must stay in sync with buildBoardState in state.ts.
 */
const NON_COLUMN_TYPES = new Set(["paragraph", "code", "quote"]);

/**
 * Build TNode[] directly from storage.
 *
 * Filters out non-column types (paragraph, code, quote) to prevent content blocks
 * from appearing as columns in the board view. (Fix for km-1tho)
 *
 * @param vault - Vault instance for storage operations
 * @param rootId - Root node ID to load children from (null for root level)
 * @param loadChildren - If true, load children one level deep. If false, shallow load only.
 * @returns TNode[] for immediate children of root (excluding non-column types)
 */
export function buildTreeNodes(
  vault: Vault,
  rootId: string | null,
  loadChildren: boolean = true,
): TNode[] {
  const allChildren = vault.getChildren(rootId);
  // Filter out non-column types (paragraph, code, quote) to match buildBoardState behavior
  const columnNodes = allChildren.filter((n) => !NON_COLUMN_TYPES.has(n.type));
  return columnNodes.map((node) =>
    loadChildren
      ? kNodeToTNodeWithChildren(vault, node, 0)
      : kNodeToTNodeShallow(vault, node, 0),
  );
}

// ===== Re-exports for convenience =====

export { pathToColumnIndices, columnIndicesToPath };
export type { ColumnIndices };
