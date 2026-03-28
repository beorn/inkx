# km-commands Tests

**Layer 4.5 — Command System**: Between board state and TUI rendering. Keys in, actions out.

## What to Test Here

- Registry: command registration, lookup, overwrite, filtering, fuzzy matching
- Keybindings: registration, mode-aware resolution, chord prefix detection, chord suffixes
- Chord state machine: pending state, chord resolution, timeout, Ctrl bypass, reset
- Executor: command execution, context building, action dispatch
- Key adapter: key event normalization, modifier extraction, key-to-command bridging
- Error constructors: boundary, precondition, unimplemented result types
- Verb x location vocabulary: verb constructors, location registries, grid generation

## What NOT to Test Here

- How actions affect board state — that's km-board
- How commands render on screen — that's km-tui
- Raw terminal key parsing — that's Silvery

## Patterns

State machine tests with setup/teardown. Most tests use `clearRegistry()` / `clearKeybindings()` in `beforeEach` to ensure isolation. Helper factories create minimal `TNode`, `CommandContext`, and `KeybindingContext` objects.

```typescript
import { createCommandRegistry, registerCommand, getCommand, clearRegistry } from "../src/registry.ts"

beforeEach(() => clearRegistry())

test("registers and retrieves command", () => {
  registerCommand({ id: "test_cmd", name: "Test", category: "Navigation", execute: () => null })
  expect(getCommand("test_cmd")).toBeDefined()
})
```

## Ad-Hoc Testing

```bash
bun vitest run packages/km-commands/tests/              # All command tests
bun vitest run packages/km-commands/tests/ -t "chord"   # Chord-specific
bun vitest run packages/km-commands/tests/ -t "resolve" # Keybinding resolution
```

## Efficiency

Pure logic tests — no database, no rendering. Fast (~100ms). If a test needs screen output or board state transitions, it belongs in km-tui or km-board respectively.

## See Also

- [Test layering philosophy](../../../.claude/skills/tests/test-layers.md)
