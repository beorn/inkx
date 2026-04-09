# km-markdown Tests

**Layer 2 — Parse Fidelity**: Markdown in, AST/nodes out. This is the leaf parser — trust nothing below.

## What to Test Here

- Parse edge cases: nested structures, unusual frontmatter, Obsidian-specific syntax
- Format fidelity: roundtrip (parse then serialize) preserves structure
- Spec compliance: CommonMark/GFM behaviors
- Extension rules: custom markdown extensions

## What NOT to Test Here

- How parsed nodes behave in storage (that's km-storage)
- How parsed nodes render in the TUI (that's km-tui)

## Helpers

Located in `helpers/test-utils.ts`:

| Helper                    | Purpose                                          |
| ------------------------- | ------------------------------------------------ |
| `parse(md)`               | Parse markdown string to KNode array             |
| `roundtrip(md)`           | Parse then serialize — output should match input |
| `makeTestNode(overrides)` | Create a KNode with sensible defaults            |
| `normalizeMarkdown(md)`   | Whitespace normalization for assertions          |

## Patterns

```typescript
import { parse, roundtrip } from "./helpers/test-utils"

// Fidelity test: roundtrip preserves structure
test("heading with inline code roundtrips", () => {
  const md = "## Config `tsconfig.json`\n"
  expect(roundtrip(md)).toBe(md)
})

// Edge case: parse complex real-world documents
test("Obsidian callout with nested code block", () => {
  const nodes = parse(dedent`
    > [!warning] Edge case
    > \`\`\`ts
    > const x = 1
    > \`\`\`
  `)
  expect(nodes[0].type).toBe("callout")
})
```

## Fixtures

- `fixtures/` — Sample markdown files for complex parsing tests
- `extensions/` — Extension rule test data

## Ad-Hoc Testing

```bash
bun vitest run packages/km-markdown/tests/        # All markdown tests (~instant)
bun vitest run packages/km-markdown/tests/ -t "roundtrip"  # By test name
bun run test:changed                               # Only changed files
```

For quick parse verification without a test file:

```typescript
import { parse, roundtrip } from "./helpers/test-utils"

test("quick check: my edge case", () => {
  const md = "your markdown here\n"
  const nodes = parse(md)
  console.dir(nodes, { depth: 5 }) // Remove before committing
  expect(roundtrip(md)).toBe(md)
})
```

## Property-Based Testing

For parser fidelity beyond hand-written examples, use property-based tests. The key property: **roundtrip preservation** — `roundtrip(md) === md`.

```typescript
import { gen, take } from "@beorn/vimonkey"
import { roundtrip } from "./helpers/test-utils"

const mdGen = gen.oneOf(
  gen.map(gen.string(), (s) => `# ${s}\n`),
  gen.map(gen.string(), (s) => `- [ ] ${s}\n`),
  gen.map(gen.string(), (s) => `> ${s}\n`),
)

test.fuzz("markdown roundtrip preserves structure", () => {
  for (const md of take(mdGen, 100)) {
    expect(roundtrip(md)).toBe(md)
  }
})
```

Good candidates for property-based tests:

- Frontmatter preservation across parse/serialize
- List nesting depth (arbitrary depth should roundtrip)
- Inline formatting combinations (bold + italic + code)
- Real-world document patterns (Obsidian, Asana exports)

## Efficiency

Pure parsing — no database, no framework. These tests are fast (~20-50ms import). Keep them dependency-free. If a test needs a database or TUI, it belongs in a higher layer.

## See Also

- [Tests skill](../../../.claude/skills/tests/SKILL.md) — test layering + test-first protocol
