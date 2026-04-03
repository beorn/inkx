import { ResourceState } from "@km/storage"
import type { Repo } from "@km/storage"
import type { KNode } from "@km/core"

export type { ResourceState } from "@km/storage"

/**
 * Wrap repo.getNode in ResourceState — makes null-vs-missing explicit.
 * For signal-based reactivity, use useNodeSignal from use-signal.ts instead.
 */
export function useNodeResource(repo: Pick<Repo, "getNode">, id: string): ResourceState<KNode> {
  const node = repo.getNode(id)
  if (node === null) return ResourceState.unloaded()
  return ResourceState.loaded(node)
}

/**
 * Wrap child ID retrieval in ResourceState.
 * Uses getChildren -> map to ids (getChildIds doesn't exist on Repo yet).
 */
export function useChildIdsResource(
  repo: Pick<Repo, "getChildren">,
  parentId: string | null,
): ResourceState<readonly string[]> {
  const ids = repo.getChildren(parentId).map((n) => n.id)
  return ResourceState.loaded(ids)
}

/** Convenience: extract loaded node value or undefined. */
export function useLoadedNode(repo: Pick<Repo, "getNode">, id: string): KNode | undefined {
  return ResourceState.value(useNodeResource(repo, id))
}
