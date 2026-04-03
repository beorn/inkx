import { useMemo } from "react"
import type { Repo } from "@km/storage"
import type { KNode } from "@km/core"
import { ResourceState } from "@km/storage"
import { useStore } from "../state/store-context.tsx"
import { useChildIdsSignal } from "./use-signal.ts"

/**
 * Generic hook to get children of any node.
 * Uses per-parent child ID signals for fine-grained reactivity —
 * only re-renders when this specific parent's children change.
 */
export function useChildren(repo: Repo, parentId: string | null): KNode[] {
  const store = useStore()
  const childIdsState = useChildIdsSignal(store, parentId ?? "")
  const childIds = ResourceState.isLoaded(childIdsState) ? childIdsState.value : []
  return useMemo(() => {
    return repo.getChildren(parentId)
  }, [childIds, parentId])
}
