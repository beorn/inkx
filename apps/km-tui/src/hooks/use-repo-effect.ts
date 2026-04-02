/**
 * useRepoEffect — React hook for repo mutations with normalization.
 *
 * View components use this instead of repo.updateNode() directly.
 * Routes mutations through the normalization pipeline (withTitle, withName)
 * and validation (validateEffects), matching the handler path.
 *
 * Only REPO_UPDATE_NODE is normalized — other repo operations (addNode,
 * deleteNode, moveNode) pass through directly since they don't set content.
 */
import { useCallback } from "react"
import type { Repo } from "../repo-context.tsx"
import type { KNode } from "@km/core"
import { defaultNormalize, validateEffects } from "../board/normalize-plugins.ts"
import type { BoardEffect } from "../board/board-reducer.ts"

export function useRepoEffect(repo: Repo) {
  return useCallback(
    (id: string, changes: Partial<KNode>) => {
      const getNode = (nodeId: string) => repo.getNode(nodeId)
      const effects: BoardEffect[] = [{ type: "REPO_UPDATE_NODE", nodeId: id, updates: changes }]
      const normalized = defaultNormalize(effects, getNode)
      validateEffects(normalized, getNode)
      // Apply the normalized updates
      const norm = normalized[0] as Extract<BoardEffect, { type: "REPO_UPDATE_NODE" }>
      repo.updateNode(id, norm.updates)
    },
    [repo],
  )
}
