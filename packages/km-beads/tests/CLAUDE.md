# km-beads Tests

**Infrastructure — Issue Tracking**: Bead schema validation, CRUD mutations, dependency graph, and ID generation.

## What to Test Here

- Schema: Zod validation of bead/issue fields, JSONL line parsing, bulk JSONL parsing, rejection of invalid data
- Mutations: issue node creation (with types, priorities, assignees, custom IDs, sub-issues), field updates, close/drop lifecycle
- Dependencies: add/remove deps, duplicate prevention, bidirectional link properties, merge logic
- Short IDs: `km-xxxx` format generation, custom ID prefixes, sub-ID `parent.N` format, uniqueness

## What NOT to Test Here

- Bead CLI commands (`bd create`, `bd update`) — that's the CLI layer
- Bead rendering in TUI — that's km-tui
- Filesystem persistence of `.beads/` — that's the beads CLI

## Patterns

Pure unit tests. Mutations return node/field objects for assertion. Dependencies operate on `Issue` objects with `blocked-by`/`blocks` properties.

```typescript
import { createIssueNode } from "../src/mutations.ts"

test("creates issue with priority tag", () => {
  const { node } = createIssueNode("Critical fix", { priority: 0 })
  expect(node.content).toContain("#P0")
  expect(node.priority).toBe(0)
})
```

## Ad-Hoc Testing

```bash
bun vitest run packages/km-beads/tests/             # All beads tests (~instant)
bun vitest run packages/km-beads/tests/ -t "schema" # Schema validation
bun vitest run packages/km-beads/tests/ -t "dep"    # Dependency tests
```

## Efficiency

Lightest tests in the project (~20ms). Pure functions, no database, no I/O. If a test needs the beads CLI or filesystem, it belongs in integration tests.

## See Also

- [Tests skill](../../../.claude/skills/tests/SKILL.md) — test layering + test-first protocol
