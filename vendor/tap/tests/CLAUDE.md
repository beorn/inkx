# tap Tests

**Test Infrastructure — TAP Protocol**: Test runner orchestration with TAP output streams.

## What to Test Here

- Orchestrator: unified mode merging multiple suite TAP streams, exit code propagation
- Parallel mode: delegation to injected `renderParallel` function, error on missing renderer
- Suite configuration: name, runner, files

## What NOT to Test Here

- TAP protocol parsing details — tested by the consumers (dotz reporter)
- Actual test execution — orchestrator manages streams, not test logic

## Patterns

```typescript
import { createOrchestrator, type Suite } from "../src/orchestrate"
import { Writable } from "node:stream"

test("unified mode merges suite streams", async () => {
  const output = createMockWritable()
  const orchestrator = createOrchestrator({
    suites: [{ name: "suite1", runner: "bun", files: [] }],
    mode: "unified",
    output,
  })
  const exitCode = await orchestrator.run()
  expect(exitCode).toBe(0)
})
```

## Ad-Hoc Testing

```bash
bun vitest run tests/   # All tap tests (~instant)
```

## Efficiency

Minimal test file (~50ms). Uses mock writable streams. No subprocesses or real test execution in the fast path.

## See Also

- [Test layering philosophy](../../.claude/skills/tests/test-layers.md)
