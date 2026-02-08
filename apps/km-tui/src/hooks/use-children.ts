import { useMemo, useSyncExternalStore } from "react"
import type { Repo } from "@km/storage"
import type { KNode } from "@km/core"

/**
 * Generic hook to get children of any node.
 * Replaces the column-specific useColumns pattern.
 * Benefits from per-node children cache in repo.
 */
export function useChildren(repo: Repo, parentId: string | null): KNode[] {
  const repoVersion = useSyncExternalStore(repo.subscribe, repo.getSnapshot)
  return useMemo(() => {
    return repo.getChildren(parentId)
  }, [repoVersion, parentId])
}
