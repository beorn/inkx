/**
 * Board State Utilities
 *
 * Display-name helpers and badge utilities for board state.
 * The legacy column-based board state (buildBoardState, initBoardState,
 * BoardStateResult, createEmptyState) has been removed — live code uses
 * the tree-lens pipeline (deriveColumnsFromLens, TreeLens, PaneSignals).
 */

import type { Repo } from "./repo-context.tsx"
import {
  getNodeDisplayName as getNodeDisplayNameBase,
  isNodeUntitled as isNodeUntitledBase,
  getCollapsedTypeSuffix as getCollapsedTypeSuffixBase,
  getParentContext as getParentContextBase,
  getParentContextEx as getParentContextExBase,
} from "@km/tree"

// Note: Card position tracking is now handled via LayoutContext in board-actions.ts

/** Compute a short badge label: "filename.md (fstype)" or "shortId (type)" */
export function nodeBadgeLabel(node: { fs_path?: string; fstype?: string; type?: string; id: string }): string {
  const basename = node.fs_path?.split("/").pop()
  const fstype = node.fstype ?? node.type
  return basename ? `${basename} (${fstype})` : `${node.id.slice(-8)} (${fstype})`
}

// Bound versions that inject repo dependencies
// These are the primary exports for TUI components
export const getNodeDisplayName = (repo: Repo, node: Parameters<typeof getNodeDisplayNameBase>[0]) =>
  getNodeDisplayNameBase(node, (id) => repo.getChildren(id))
export const isNodeUntitled = (repo: Repo, node: Parameters<typeof isNodeUntitledBase>[0]) =>
  isNodeUntitledBase(node, (id) => repo.getChildren(id))
export const getCollapsedTypeSuffix = (repo: Repo, node: Parameters<typeof getCollapsedTypeSuffixBase>[0]) =>
  getCollapsedTypeSuffixBase(node, (id) => repo.getChildren(id))
export const getParentContext = (
  repo: Repo,
  node: Parameters<typeof getParentContextBase>[0],
  skipParentId?: string | null,
) => getParentContextBase(node, skipParentId, (id) => repo.getNode(id))
export const getParentContextEx = (
  repo: Repo,
  node: Parameters<typeof getParentContextExBase>[0],
  skipParentId?: string | null,
) => getParentContextExBase(node, skipParentId, (id) => repo.getNode(id))
