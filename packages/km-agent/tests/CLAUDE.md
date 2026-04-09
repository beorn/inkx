# km-agent Tests

**Agent Tooling**: Agent harness definitions, node CRUD, query functions, and session management.

## What to Test Here

- Harness validation: required fields, wrapped format, rejection of invalid harnesses
- Agent node creation: default/custom options, unique ID generation, status field transitions
- Agent mutations: field updates for start/stop/idle/error lifecycle
- Agent queries: filtering by status, kind detection, node-to-agent conversion
- Session types and status mapping

## What NOT to Test Here

- Actual LLM API calls or tool execution — that's integration/E2E
- Board-level agent rendering — that's km-tui
- File I/O for session events — needs full repo setup (covered by E2E)

## Patterns

Pure unit tests with minimal helpers. Queries use `createFakeRepo` from `@km/storage` for in-memory testing.

```typescript
import { createAgentNode } from "../src/mutations.ts"

test("creates agent with custom model", () => {
  const { node } = createAgentNode("Reviewer", { model: "claude-opus-4" })
  expect(node.data?.model).toBe("claude-opus-4")
})
```

## Ad-Hoc Testing

```bash
bun vitest run packages/km-agent/tests/           # All agent tests (~instant)
bun vitest run packages/km-agent/tests/ -t "harness"  # By test name
```

## Efficiency

Lightweight tests (~50ms). No database or rendering. The sessions test is intentionally minimal — full session integration requires filesystem setup and is covered by TUI E2E tests.

## See Also

- [Tests skill](../../../.claude/skills/tests/SKILL.md) — test layering + test-first protocol
