# km-cli Tests

**CLI Commands**: Command output testing via mdspec (markdown-driven tests).

## What to Test Here

- Command output: `km import`, `km list`, etc. produce correct stdout
- Argument parsing: flags, options, subcommands
- Error messages: invalid input, missing files

## Patterns

### mdspec (preferred for CLI tests)

Tests are written as markdown files with command blocks. The mdspec plugin executes via `bunShell` (fast, no subprocess overhead).

```markdown
# km list

$ km list --format=json
[{"id": "...", "title": "..."}]
```

**All fast mdspec files must include `memory: true`** in their frontmatter to use in-memory database.

### Unit tests

For logic that doesn't need CLI execution:

```typescript
import { parseArgs } from "@km/cli/commands/list"

test("parseArgs handles --format flag", () => {
  expect(parseArgs(["--format", "json"]).format).toBe("json")
})
```

## Key Files

| File                   | Purpose                              |
| ---------------------- | ------------------------------------ |
| `km-repl.ts`           | REPL harness for interactive testing |
| `mdspec-plugin.ts`     | km command executor (bunShell)       |
| `mdspec-sh-plugin.ts`  | Shell fallback plugin                |
| `import/fake-asana.ts` | Mock Asana API for import tests      |

## Ad-Hoc Testing

```bash
bun vitest run apps/km-cli/tests/              # All CLI tests
bun vitest run apps/km-cli/tests/ -t "import"  # By test name
```

For quick CLI command verification, use the REPL harness or run directly:

```bash
bun km list --format=json          # Test command output directly
bun km import --help               # Check argument parsing
```

## Efficiency

- **All fast mdspec files must have `memory: true`** — uses in-memory DB, no disk I/O.
- mdspec with bunShell is much faster than spawning subprocesses.
- Tests needing real filesystem or real vault must be `.slow.spec.md`.

## See Also

- [Tests skill](../../../.claude/skills/tests/SKILL.md) — test layering + test-first protocol
- [Reference](../../../.claude/skills/tests/reference.md#cli-tests-mdspec) — CLI tests (mdspec) + benchmarks
