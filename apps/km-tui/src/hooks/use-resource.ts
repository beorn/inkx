import type { Repo } from "@km/storage"
import type { KNode } from "@km/core"

// TODO: Import from @km/storage once commit-types.ts ships ResourceState<T>.
// Until then, define locally — must stay in sync with the canonical definition.
export type ResourceState<T> =
  | { readonly status: "loaded"; readonly value: T }
  | { readonly status: "unloaded" }

/**
 * Wrap repo.getNode in ResourceState — makes null-vs-missing explicit.
 * When withReactive ships, this will use signals instead of getNode.
 */
export function useNodeResource(
  repo: Pick<Repo, "getNode">,
  id: string,
): ResourceState<KNode> {
  const node = repo.getNode(id)
  if (node === null) return { status: "unloaded" }
  return { status: "loaded", value: node }
}

/**
 * Wrap child ID retrieval in ResourceState.
 * Uses getChildren → map to ids (getChildIds doesn't exist on Repo yet).
 */
export function useChildIdsResource(
  repo: Pick<Repo, "getChildren">,
  parentId: string | null,
): ResourceState<readonly string[]> {
  const ids = repo.getChildren(parentId).map((n) => n.id)
  return { status: "loaded", value: ids }
}

/** Convenience: extract loaded node value or undefined. */
export function useLoadedNode(
  repo: Pick<Repo, "getNode">,
  id: string,
): KNode | undefined {
  const state = useNodeResource(repo, id)
  return state.status === "loaded" ? state.value : undefined
}
