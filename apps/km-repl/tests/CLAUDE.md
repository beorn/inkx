# km-repl Tests

**App Layer — REPL Shell**: Semicolon-separated command execution with state preservation.

## What to Test Here

- Semicolon command lists: state preserved across `j; j; state` sequences
- Shell command execution: `runShell` dispatches commands and returns output events
- Board state serialization: `createBoardState` / `serializeState` round-trip

## What NOT to Test Here

- Individual command behavior — that's km-commands
- Board state transitions — that's km-board
- TUI rendering — that's km-tui

## Patterns

Tests create a `TNode` tree inline, run commands via `runShell()`, and assert on output events and state.

```typescript
import { runShell, createBoardState } from "../src/index.ts"

test("j moves cursor down", () => {
  const tree = createTestTree()
  const state = createBoardState(tree)
  const events = runShell("j", state)
  // Assert cursor moved
})
```

## Ad-Hoc Testing

```bash
bun vitest run apps/km-repl/tests/   # All REPL tests (~instant)
```

## Efficiency

Lightweight (~50ms). Pure state machine tests with inline tree construction. No database, no rendering.

## See Also

- [Tests skill](../../../.claude/skills/tests/SKILL.md) — test layering + test-first protocol
