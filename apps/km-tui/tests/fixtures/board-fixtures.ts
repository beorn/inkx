/**
 * Board Test Fixtures
 *
 * Pure data factories for creating test nodes and column views without
 * database access. These are used by the legacy board-test `board()` DSL
 * and by other tests that need to build column-shaped mock data.
 */

import { ulid } from "ulid"
import type { KNode } from "@km/core"
import type { DerivedColumn } from "../../src/hooks/use-columns.ts"

/**
 * Create a test KNode with defaults
 */
function createTestKNode(overrides: Partial<KNode> & { id?: string } = {}): KNode {
  const id = overrides.id ?? ulid()
  const type = overrides.type ?? "p"
  const isItemNode = overrides.item ?? (type === "p" || type === "h")
  return {
    id,
    type,
    ...(isItemNode ? { item: {} } : {}),
    ...(type === "p" && isItemNode ? { list_marker: "-" } : {}),
    parent_id: overrides.parent_id ?? null,
    parent_idx: overrides.parent_idx ?? 0,
    content: overrides.content ?? `Test Node ${id.slice(0, 4)}`,
    data: overrides.data ?? {},
    symlink_to: overrides.symlink_to ?? null,
    created_at: overrides.created_at ?? Date.now(),
    updated_at: overrides.updated_at ?? Date.now(),
    version: overrides.version ?? "v1",
    ...overrides,
  }
}

/**
 * Create a card KNode for testing (callers wrap with CardView fields as needed)
 */
export function createCardNode(nodeOverrides: Partial<KNode> = {}, _children: KNode[] = []): KNode {
  return createTestKNode(nodeOverrides)
}

/**
 * Create a DerivedColumn with card nodes
 */
export function createDerivedColumn(nodeOverrides: Partial<KNode> = {}, cardNodes: KNode[] = []): DerivedColumn {
  const node = createTestKNode({
    type: "h",
    item: {},
    fstype: "folder",
    ...nodeOverrides,
  })
  return {
    node,
    cardNodes: cardNodes.map((c) => ({
      ...c,
      __cardView: true as const,
      isBody: false,
      isBrokenSymlink: false,
      hasBodyChildren: false,
    })),
  }
}
