---
id: "@km/beads/queries-decompose-node-to-bead"
aliases:
  - km-beads.queries-decompose-node-to-bead
  - km-beads-queries-decompose-node-to-bead
created_by: claude:f9eb64dc
created_at: 2026-05-05T22:42:00Z
type: task
priority: P2
status: todo
parent: km-beads
---

# [ ] Decompose nodeToBead (140+ lines) into named pure resolvers @km/beads #task #P2

`packages/km-beads/src/queries.ts` `nodeToBead` is 140+ lines mixing five concerns inline: priority resolution, status derivation, type extraction, blocker counting, shortId fallback. Each concern is its own algorithm and deserves a name.

## Current shape (queries.ts:240-380)

```typescript
export function nodeToBead(node: KNode, options?: BeadsQueryOptions): Bead {
  // ~20 lines: blockedBy extraction from props
  // ~15 lines: status from item.task.status with blockedBy fallback
  // ~5 lines: priority via getNodePriority
  // ~15 lines: type from typeKeywords scan over node tags
  // ~25 lines: shortId fallback (data.id, data.short_id, fs_path-derived)
  // ~10 lines: dependent count
  // ~10 lines: assemble Bead object
}
```

## Target shape

Co-located pure resolvers, each independently testable:

```typescript
function resolveBlockedBy(node: KNode): string[] | undefined { ... }
function resolveStatus(node: KNode, blockedBy: string[] | undefined): Bead["status"] { ... }
function resolveType(node: KNode, repo?: Repo): string | undefined { ... }
function resolveShortId(node: KNode): string | undefined { ... }

export function nodeToBead(node: KNode, options?: BeadsQueryOptions): Bead {
  const blockedBy = resolveBlockedBy(node)
  return {
    id: node.id,
    shortId: resolveShortId(node),
    status: resolveStatus(node, blockedBy),
    priority: getNodePriority(node) ?? "P2",
    type: resolveType(node, options?.repo),
    // ... etc
  }
}
```

## Acceptance

- [ ] Each resolver is a pure function (no I/O, no closures over module state)
- [ ] Each resolver has at least 3 unit tests covering its decision branches
- [ ] `nodeToBead` body is ≤30 LOC, just orchestration
- [ ] `bead-invariants.property.test.ts` continues to pass with no changes
- [ ] No new `any` types introduced

## Pairs with

- `@km/beads/bead-type-keywords-shared-constant` — extracting `resolveType` is the natural place to consume the shared `BEAD_TYPE_KEYWORDS` constant once that lands.

## Surfaced by

Code-quality agent in session f9eb64dc. P1 flagged due to complexity + tight coupling to property tests.
