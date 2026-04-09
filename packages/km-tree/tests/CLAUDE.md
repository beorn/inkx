# km-tree Tests

**Layer 2.5 — Tree Operations**: Between storage and board. Tree traversal, node manipulation, display logic.

## What to Test Here

- Block operations: split node, merge with previous/next, text get/set, prefix conversion, backspace degradation
- Body extraction: separating body content (paragraphs, code, quotes) from structural children (sections)
- Display utilities: display name computation, untitled detection, type indicators, ancestor collapsing, name similarity
- Tree queries: path navigation, sibling count, child paths, node collection, visible node counting

## What NOT to Test Here

- How tree nodes render visually — that's km-tui
- Database persistence of tree changes — that's km-storage
- Board-level state transitions (fold, cursor) — that's km-board

## Helpers

Block ops tests use `createTestRepo()` from `@km/storage` for an in-memory repo that satisfies `TreeMutator`. Display and query tests create minimal `TNode`/`KNode` objects with inline helper factories.

## Patterns

```typescript
import { createTestRepo } from "@km/storage"
import { split, mergeBackward } from "../src/ops/block-ops.ts"

test("split creates sibling after cursor position", () => {
  const repo = createTestRepo()
  const parentId = repo.addNode(null, { type: "h", item: {}, name: "Parent" })
  const childId = repo.addNode(parentId, { type: "p", content: "Hello World" })
  const result = split(repo, childId, 5)
  expect(result.newNodeId).toBeDefined()
})
```

## Ad-Hoc Testing

```bash
bun vitest run packages/km-tree/tests/              # All tree tests (~instant)
bun vitest run packages/km-tree/tests/ -t "split"   # Block split tests
bun vitest run packages/km-tree/tests/ -t "display" # Display name tests
```

## Efficiency

Fast tests (~100ms). Block ops tests have slightly higher cost due to in-memory repo setup. Display and query tests are pure functions with no external dependencies.

## See Also

- [Tests skill](../../../.claude/skills/tests/SKILL.md) — test layering + test-first protocol
