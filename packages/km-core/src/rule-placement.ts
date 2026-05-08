import { KNode } from "./interfaces/index.ts"
import type { ItemData, NodeRules } from "./types.ts"

export interface RulePlacementNode {
  id: string
  type: string
  fstype?: string | null
  item?: ItemData
  rules?: NodeRules
  data?: Record<string, unknown> | null
}

/**
 * Find the section where generated additions should initially land.
 *
 * `km.default:: true` on the owner means "use the owner itself." Otherwise,
 * `km.default:: true` wins anywhere below the owner. Without it, use the first
 * non-collapsed, non-removed child section in outline order. Callers keep the
 * final fallback to the owner node.
 */
export function findDefaultAddSection<T extends RulePlacementNode>(
  parentId: string,
  getChildren: (parentId: string) => readonly T[],
  getNode?: (id: string) => T | null | undefined,
): T | null {
  const owner = getNode?.(parentId)
  if (owner && placementRules(owner)?.default) return owner
  return findExplicitDefaultSection(parentId, getChildren) ?? findFirstEligibleSection(parentId, getChildren)
}

function findExplicitDefaultSection<T extends RulePlacementNode>(
  parentId: string,
  getChildren: (parentId: string) => readonly T[],
): T | null {
  for (const child of getChildren(parentId)) {
    if (!KNode.isOutline(child)) continue
    if (child.fstype !== "mdsection") continue

    const rules = placementRules(child)
    if (rules?.default) return child

    const nested = findExplicitDefaultSection(child.id, getChildren)
    if (nested) return nested
  }

  return null
}

function findFirstEligibleSection<T extends RulePlacementNode>(
  parentId: string,
  getChildren: (parentId: string) => readonly T[],
): T | null {
  for (const child of getChildren(parentId)) {
    if (!KNode.isOutline(child)) continue
    if (child.fstype !== "mdsection") continue

    const rules = placementRules(child)
    if (rules?.collapse || rules?.removed) continue

    return child
  }

  return null
}

function placementRules(node: RulePlacementNode): NodeRules | undefined {
  return node.rules ?? ((node.data?.rules as NodeRules | undefined) || undefined)
}
