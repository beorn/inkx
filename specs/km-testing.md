# KM Testing Guide

> Comprehensive guide for testing strategy, patterns, and best practices in the km codebase.

## Quick Reference

| Tool | Purpose | Command |
|------|---------|---------|
| `bun test` | Unit & integration tests | `bun test`, `bun test packages/km-store` |
| `mdtest` | Golden file CLI tests | `bun run test:e2e tests/*.test.md` |
| `km sh` | TUI state testing (headless) | `echo "move_down\nstate" \| km sh @root` |
| Playwright | Visual TUI screenshots | `cd tests/tui && playwright test` |
| Storybook | Component visual dev | `bun run storybook` |

**Quality gates (MUST pass before commit):**
```bash
bun fix   # Lint + format
bun test  # All tests (1135+ tests)
```

---

## Overview

The km codebase uses a **layered testing strategy** aligned with its architectural layers. Each layer has specific testing patterns optimized for that layer's responsibilities.

**Key Principles**:
1. Test at the right level - lower layers get more unit tests; higher layers get integration tests
2. Avoid redundant testing across layers - trust lower layers are tested
3. Prefer behavior testing over implementation testing
4. Use the fastest test type that validates the behavior

## Testing Pyramid

```
                    ┌─────────────────────┐
                    │   Visual/E2E (5%)   │  ← Playwright, manual
                    │  Full system tests  │
                    ├─────────────────────┤
                    │  Integration (30%)  │  ← Real fs/db, CLI
                    │  Multi-layer flows  │
                    ├─────────────────────┤
                    │    Unit (65%)       │  ← Pure functions
                    │  Single layer/fn    │
                    └─────────────────────┘
```

## Layers and Testing Strategy

### Layer 1: Parser (`packages/km-markdown`)

**Responsibility**: Parse markdown → AST → nodes; serialize nodes → markdown

**Testing Approach**: **Heavy unit testing + round-trip validation**

| Test Type | Purpose | Example |
|-----------|---------|---------|
| Unit | Parse individual constructs | `parseWikiLinks("[[foo]]")` returns link |
| Round-trip | Preserve structure through parse→serialize | `nodesToMarkdown(parse(md)) ≈ md` |
| Edge cases | Handle malformed input gracefully | Empty files, missing frontmatter |

**DO test:**
- Each markdown construct (headings, lists, tasks, links, frontmatter)
- Edge cases (empty, malformed, unicode)
- Round-trip preservation (semantic, not byte-exact)

**DON'T test:**
- Integration with store (that's Layer 2's job)
- How parsed nodes display in TUI (Layer 5's job)

**Files**: `packages/km-markdown/tests/markdown.test.ts`, `roundtrip.test.ts`

---

### Layer 2: Model/Store (`packages/km-store`, `packages/km-core`)

**Responsibility**: CRUD operations, queries, event sourcing, node resolution

**Testing Approach**: **Unit tests for pure functions, integration tests for store lifecycle**

| Test Type | Purpose | Example |
|-----------|---------|---------|
| Unit | Query parsing, path utilities | `parseQuery("status:todo")` |
| Integration | Full store lifecycle with real SQLite | Create→Query→Update→Delete |
| Event replay | Rebuild from event log | `rebuild()` produces same state |

**DO test:**
- Query language parsing and execution
- CRUD operations with real database
- Event sourcing (emit→apply→rebuild)
- Node resolution (by id, path, wikilink)

**DON'T test:**
- Filesystem watching (that's Layer 3)
- How nodes render (Layers 4-5)

**Files**: `packages/km-store/tests/*.test.ts`

---

### Layer 3: Sync/Watch (`packages/km-watch`)

**Responsibility**: Filesystem ↔ database synchronization

**Testing Approach**: **Integration tests with real filesystem**

| Test Type | Purpose | Example |
|-----------|---------|---------|
| Integration | File changes → database updates | Create file, verify node created |
| Conflict | Handle edit conflicts | File and db both modified |
| Ignore | Respect `.kmignore` patterns | `node_modules/` ignored |

**DO test:**
- File create/update/delete → database sync
- Database changes → file writes
- Ignore patterns
- Conflict detection and resolution

**DON'T test:**
- Markdown parsing (tested in Layer 1)
- Database operations (tested in Layer 2)

**Files**: `packages/km-watch/tests/*.test.ts`

---

### Layer 4: State Management (`packages/km-tui-core`)

**Responsibility**: BoardState, reducers, selectors, transformers, shell execution

**Testing Approach**: **Unit tests for pure reducer functions**

| Test Type | Purpose | Example |
|-----------|---------|---------|
| Unit | Reducer state transitions | `boardReducer(state, MOVE_DOWN)` |
| Unit | Selectors/transformers | `toBoardViewModel(state)` |
| Unit | Command parsing | `parseCommand("move_down")` |
| Integration | Shell execution sequences | `runShell(["move_down", "state"], initial)` |

**DO test:**
- Every action type in boardReducer
- Edge cases (move past bounds, empty columns)
- State serialization/deserialization
- Command parsing (line mode, JSON mode, key commands)

**DON'T test:**
- React rendering (Layer 5)
- Store integration (tested via CLI integration tests)

**Files**: `packages/km-tui-core/tests/*.test.ts`

---

### Layer 5: UI Components (`packages/km-tui-opentui`)

**Responsibility**: React components for terminal rendering

**Testing Approach**: **Component tests (props → element), minimal**

| Test Type | Purpose | Example |
|-----------|---------|---------|
| Component | Verify props produce valid elements | `<Card title="X" />` renders |
| Smoke | Components don't crash | All status types render |

**DO test:**
- Component renders with various prop combinations
- Edge cases (long titles, special characters)
- All enum values (task statuses, view modes)

**DON'T test:**
- Visual appearance (use visual tests instead)
- Reducer logic (tested in Layer 4)
- Full app behavior (tested in Layer 6)

**Files**: `packages/km-tui-opentui/src/components/__tests__/*.test.tsx`

---

### Layer 6: CLI/Application (`apps/km-cli`)

**Responsibility**: Command-line interface, TUI orchestration

**Testing Approach**: **Integration and E2E tests**

| Test Type | Purpose | Example |
|-----------|---------|---------|
| Integration | CLI commands with real vault | `km list` returns nodes |
| E2E | Full workflows | Create file → sync → query → display |
| Visual | TUI renders correctly | Playwright screenshots |
| Golden | Expected output matches | mdtest console blocks |

**DO test:**
- Each CLI command with realistic inputs
- Error handling and edge cases
- Full user workflows
- TUI visual appearance (sparingly)

**DON'T test:**
- Individual parser/store/reducer functions (tested in lower layers)

**Files**: `apps/km-cli/tests/*.test.ts`, `apps/km-cli/tests/tui/*.playwright.ts`

---

## Test Types Reference

### Unit Tests

**When to use**: Testing pure functions with no side effects

```typescript
import { describe, test, expect } from "bun:test";

describe("parseQuery", () => {
  test("parses status filter", () => {
    const result = parseQuery("status:todo");
    expect(result.filters).toContainEqual({ field: "status", value: "todo" });
  });
});
```

**Best for**: Parsers, reducers, transformers, utilities

---

### Integration Tests

**When to use**: Testing multiple components working together with real I/O

```typescript
import { describe, test, expect, beforeEach, afterEach } from "bun:test";

const TEST_DIR = join(import.meta.dir, ".test-integration");

describe("Store Integration", () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
    initializeStore(TEST_DIR);
  });

  afterEach(() => {
    closeStore();
    rmSync(TEST_DIR, { recursive: true });
  });

  test("creates and queries node", () => {
    const id = createNode({ type: "note", content: "Test" });
    const node = getNode(id);
    expect(node.content).toBe("Test");
  });
});
```

**Best for**: Store operations, sync workflows, CLI commands

---

### Golden File Tests (mdtest)

**When to use**: Testing CLI output, capturing expected behavior in documentation

```markdown
# km list command

```console
$ km list --limit 2
/[0-9a-z]{26}/ ... (note)
[...]
```

```console
$ km show nonexistent
! error: Node not found: nonexistent
[1]
```
```

**Best for**: CLI output, error messages, help text, user-facing behavior

---

### km-sh + mdtest Integration

**When to use**: Testing TUI state transitions without visual rendering. This is the **recommended approach** for TUI behavior testing because it's fast, deterministic, and documents expected behavior.

**Why km-sh + mdtest?**
- **Fast**: No rendering, no browser, just state transitions
- **Deterministic**: Same input always produces same output
- **Documented**: Tests ARE the behavior spec (executable documentation)
- **CI-friendly**: Runs in any environment, no display needed

#### Basic Example

````markdown
# TUI Navigation Tests

Setup a test vault:

```bash file=vault/inbox.md
# Inbox
- [ ] Task 1
- [ ] Task 2
- [ ] Task 3
```

```bash file=vault/projects/alpha.md
# Alpha Project
- [ ] Alpha task 1
- [x] Alpha task 2
```

Initialize and test navigation:

```console
$ km sync -r $PWD/vault
[...]
```

```console
$ echo -e "state" | km sh -r $PWD/vault @inbox.md
position: col=0 card=0
column: Inbox [...]
```

```console
$ echo -e "move_down\nmove_down\nstate" | km sh -r $PWD/vault @inbox.md
> MOVE_DOWN
> MOVE_DOWN
position: col=0 card=2
[...]
```
````

#### Testing Selection & Multi-select

````markdown
# Selection Tests

```console
$ echo -e "select_card_add card-1\nselect_card_add card-2\nstate" | km sh -r $PWD/vault @inbox.md
[...]
selected: 2
[...]
```

```console
$ echo -e "select_all_column\nstate" | km sh -r $PWD/vault @inbox.md
[...]
selected: 3
[...]
```
````

#### Testing View Mode Changes

````markdown
# View Mode Tests

```console
$ echo -e "set_view_mode list\nview" | km sh -r $PWD/vault @inbox.md
[...]
```

```console
$ echo -e "set_view_mode columns\nview" | km sh -r $PWD/vault @inbox.md
[...]
```
````

#### JSON Mode for Automation

````markdown
# JSON Mode Tests

```console
$ echo '{"type":"MOVE_DOWN"}' | km sh --json -r $PWD/vault @inbox.md 2>&1 | head -1
{"event":"init",[...]}
```

```console
$ echo -e '{"type":"MOVE_DOWN"}\n{"type":"MOVE_DOWN"}' | km sh --json -r $PWD/vault @inbox.md 2>&1 | grep '"event":"final"'
{"event":"final","state":{"cardIndex":2,[...]}}
```
````

#### Testing Key Mappings

````markdown
# Vim-style Key Tests

```console
$ echo -e "key j\nkey j\nkey k\nstate" | km sh -r $PWD/vault @inbox.md
> MOVE_DOWN
> MOVE_DOWN
> MOVE_UP
position: col=0 card=1
[...]
```

```console
$ echo -e "key g\nstate" | km sh -r $PWD/vault @inbox.md
> JUMP_TOP
position: col=0 card=0
[...]
```
````

**Best for**: TUI state machine testing, regression tests, behavior documentation, CI pipelines

---

### Visual Tests (Playwright)

**When to use**: Verifying TUI visual appearance

```typescript
import { test, expect } from "@playwright/test";

test("board view renders correctly", async ({ page }) => {
  // ttyd must be running: ttyd -W -p 7681 bun km view ...
  await page.goto("http://localhost:7681");
  await page.waitForSelector(".xterm-screen");
  await expect(page).toHaveScreenshot("board-view.png");
});
```

**Best for**: Visual regression testing, layout verification

**Use sparingly**: Visual tests are slow and brittle

---

### Component Tests

**When to use**: Testing React components in isolation

```typescript
import { describe, it, expect } from "bun:test";
import React from "react";
import { Card } from "../Card.tsx";

describe("Card", () => {
  it("renders with task status", () => {
    const element = <Card title="Test" taskStatus="todo" isTask={true} />;
    expect(element).toBeDefined();
    expect(element.props.taskStatus).toBe("todo");
  });
});
```

**Best for**: Component prop validation, smoke tests

---

## Testing Patterns

### Test Data Builders

Create reusable test data factories:

```typescript
function createTestNode(overrides: Partial<Node> = {}): Node {
  return {
    id: ulid(),
    type: "note",
    content: "Test content",
    parent_id: null,
    ...overrides,
  };
}

function createTestBoardState(overrides: Partial<BoardState> = {}): BoardState {
  return {
    ...createInitialBoardState([]),
    ...overrides,
  };
}
```

### Table-Driven Tests

Test multiple cases efficiently:

```typescript
const testCases = [
  { input: "status:todo", expected: { field: "status", value: "todo" } },
  { input: "type:task", expected: { field: "type", value: "task" } },
  { input: "#project", expected: { field: "tag", value: "project" } },
];

for (const { input, expected } of testCases) {
  test(`parses "${input}"`, () => {
    const result = parseQuery(input);
    expect(result.filters).toContainEqual(expected);
  });
}
```

### Test Isolation

Each test should be independent:

```typescript
const TEST_DIR = join(import.meta.dir, ".test-isolated");

beforeEach(() => {
  // Fresh directory for each test
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  // Clean up after each test
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
});
```

### Semantic Comparison

For markdown, compare semantically, not byte-for-byte:

```typescript
function normalizeMarkdown(md: string): string {
  return md
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

test("preserves structure", () => {
  const input = "# Title\n\nContent";
  const output = nodesToMarkdown(parseMarkdown(input));
  expect(normalizeMarkdown(output)).toBe(normalizeMarkdown(input));
});
```

---

## When NOT to Test

### Avoid Redundant Testing

❌ **Don't test the same thing at multiple layers:**

```typescript
// BAD: Testing markdown parsing in CLI tests
test("km show parses markdown correctly", () => {
  // This duplicates km-markdown tests
});

// GOOD: Test CLI behavior, trust parser is tested
test("km show displays node content", () => {
  const result = await km(["show", nodeId]);
  expect(result.stdout).toContain("Expected title");
});
```

### Avoid Testing Implementation Details

❌ **Don't test internal state:**

```typescript
// BAD: Testing internal reducer state shape
test("reducer sets _internalFlag", () => {
  expect(state._internalFlag).toBe(true);
});

// GOOD: Test observable behavior
test("reducer enables search mode", () => {
  const newState = reducer(state, { type: "TOGGLE_SEARCH_MODE" });
  expect(newState.searchMode).toBe(true);
});
```

### Avoid Brittle Visual Tests

❌ **Don't screenshot everything:**

```typescript
// BAD: Screenshot for every test
test("card renders", async () => {
  await expect(page).toHaveScreenshot(); // Breaks on font changes
});

// GOOD: Targeted visual tests for critical UI
test("board layout matches design", async () => {
  await expect(page).toHaveScreenshot("board-layout.png");
});
```

### Avoid Testing Third-Party Code

❌ **Don't test framework behavior:**

```typescript
// BAD: Testing that React works
test("useState updates state", () => {
  const [value, setValue] = useState(0);
  setValue(1);
  expect(value).toBe(1); // This tests React, not your code
});

// GOOD: Test your component's behavior
test("counter increments on click", () => {
  const result = render(<Counter />);
  fireEvent.click(result.getByText("+"));
  expect(result.getByText("1")).toBeTruthy();
});
```

### Avoid Over-Mocking

❌ **Don't mock what you're testing:**

```typescript
// BAD: Mocking the function you're testing
jest.mock("./boardReducer");
test("reducer moves down", () => {
  boardReducer.mockReturnValue({ cardIndex: 1 });
  // This doesn't test boardReducer at all!
});

// GOOD: Test the real implementation
test("reducer moves down", () => {
  const state = createInitialState();
  const newState = boardReducer(state, { type: "MOVE_DOWN" });
  expect(newState.cardIndex).toBe(1);
});
```

---

## Test Organization

### File Naming

```
packages/km-store/
├── src/
│   ├── query.ts
│   └── store.ts
└── tests/
    ├── query.test.ts      # Unit tests for query.ts
    ├── store.test.ts      # Integration tests for store
    └── fixtures/          # Test data
        └── sample.md
```

### Test Structure

```typescript
describe("Module or Feature", () => {
  describe("function or method", () => {
    test("handles normal case", () => {});
    test("handles edge case", () => {});
    test("handles error case", () => {});
  });
});
```

---

## Running Tests

### All Tests

```bash
bun test                    # Run all tests
bun test --coverage         # With coverage report
bun test packages/km-store  # Specific package
```

### Filtered Tests

```bash
bun test query              # Files matching "query"
bun test --test-name-pattern="parse"  # Tests matching name
```

### mdtest (Golden Files)

```bash
bun run test:e2e                    # Run all .test.md files
bun run test:e2e tests/cli.test.md  # Specific file
bun run test:e2e:update             # Update expected output
```

### Playwright (Visual)

```bash
cd apps/km-cli/tests/tui
playwright test              # Run visual tests
playwright test --headed     # With browser visible
playwright test --update-snapshots  # Update screenshots
```

---

## Quality Gates

Before committing:

```bash
bun fix   # Lint + format (MUST pass)
bun test  # All tests (MUST pass)
```

CI runs both automatically on every PR.

---

## Evaluating Test Coverage

### Per-Layer Checklist

| Layer | Key Functions | Test Type | Coverage Goal |
|-------|--------------|-----------|---------------|
| Parser | `parseMarkdown`, `nodesToMarkdown` | Unit + Round-trip | 90%+ |
| Store | `createNode`, `queryNodes`, `getChildren` | Unit + Integration | 85%+ |
| Sync | `syncFromFs`, `syncToFs`, conflict handling | Integration | 80%+ |
| State | All `BoardAction` types, selectors | Unit | 95%+ |
| Components | All exported components | Smoke | 70%+ |
| CLI | All commands, error paths | Integration + Golden | 80%+ |

### Coverage Gaps to Watch

1. **Error paths**: Every error should have a test
2. **Edge cases**: Empty inputs, max values, unicode
3. **State transitions**: Every reducer action type
4. **User workflows**: Common multi-step operations

---

## Summary: Test Decision Tree

```
Is it a pure function?
├── Yes → Unit test
└── No
    ├── Does it touch filesystem/database?
    │   ├── Yes → Integration test
    │   └── No → Unit test (mock dependencies)
    └── Is it user-facing CLI output?
        ├── Yes → Golden file test (mdtest)
        └── No
            └── Is it visual TUI appearance?
                ├── Yes → Playwright (sparingly)
                └── No → Integration test
```

---

## Test-Driven Development Workflow

When implementing new features, follow this TDD workflow:

### 1. Write Acceptance Test First

Before writing any code, write a test that describes the expected behavior:

```typescript
// For a new "archive" command
describe("km archive", () => {
  test("moves node to archive folder", async () => {
    // Setup
    const nodeId = createTestNode({ content: "Test task" });

    // Execute
    const result = await km(["archive", nodeId]);

    // Verify
    expect(result.exitCode).toBe(0);
    const node = getNode(nodeId);
    expect(node.parent_path).toContain("Archive");
  });
});
```

### 2. Run Test (Should Fail)

```bash
bun test archive  # Should fail - command doesn't exist yet
```

### 3. Implement Feature

Write the minimal code to make the test pass.

### 4. Run Test (Should Pass)

```bash
bun test archive  # Should pass now
```

### 5. Run Full Suite + Lint

```bash
bun fix   # Format and lint
bun test  # Full test suite
```

### 6. Refactor if Needed

Clean up code while keeping tests green.

---

## Choosing the Right Test Type

### Decision Matrix

| Scenario | Test Type | Speed | Confidence |
|----------|-----------|-------|------------|
| Pure function logic | Unit | ⚡ Fast | High |
| Database operations | Integration | 🚀 Medium | High |
| File sync behavior | Integration | 🚀 Medium | High |
| CLI command output | mdtest golden | 🚀 Medium | High |
| TUI state transitions | km-sh + mdtest | ⚡ Fast | High |
| TUI appearance | Playwright | 🐢 Slow | Medium |
| Component props | Unit/Component | ⚡ Fast | Low |

### Test Type Trade-offs

| Type | Pros | Cons |
|------|------|------|
| **Unit** | Fast, isolated, deterministic | May miss integration issues |
| **Integration** | Tests real interactions | Slower, needs cleanup |
| **mdtest** | Self-documenting, CI-friendly | Pattern matching complexity |
| **km-sh** | Fast TUI testing, no rendering | Only tests state, not visuals |
| **Playwright** | True visual verification | Slow, brittle, env-dependent |

---

## Debugging Test Failures

### Common Issues

**Test isolation failure:**
```bash
# Tests pass individually but fail together
bun test file1.test.ts  # Pass
bun test file2.test.ts  # Pass
bun test file1 file2    # Fail!

# Fix: Ensure proper beforeEach/afterEach cleanup
```

**Flaky async tests:**
```typescript
// BAD: Race condition
test("async operation", async () => {
  triggerAsyncOp();
  expect(result).toBeDefined(); // May not be ready
});

// GOOD: Proper await
test("async operation", async () => {
  const result = await triggerAsyncOp();
  expect(result).toBeDefined();
});
```

**Path-dependent tests:**
```typescript
// BAD: Assumes specific directory
const path = "/Users/me/project/file.md";

// GOOD: Use import.meta.dir
const path = join(import.meta.dir, "fixtures", "file.md");
```

### Debug Commands

```bash
# Run single test with verbose output
bun test --test-name-pattern="specific test name"

# Run with debug output
DEBUG='*' bun test file.test.ts

# For mdtest debugging
DEBUG='mdtest:*' bun run test:e2e test.test.md
```

---

## Test Metrics & Goals

### Current State (as of last audit)

| Package | Test Files | Tests | Lines |
|---------|-----------|-------|-------|
| km-cli | 13 | ~400 | 3,408 |
| km-store | 8 | ~250 | 3,104 |
| km-markdown | 2 | ~150 | 2,680 |
| km-tui-core | 5 | ~100 | 1,500 |
| km-tui-opentui | 4 | ~30 | 400 |
| km-watch | 2 | ~20 | 200 |
| km-shared | 1 | ~10 | 100 |
| km-core | 1 | ~10 | 80 |
| **Total** | **41** | **~1135** | **~16,000** |

### Coverage Goals by Layer

| Layer | Current | Target | Notes |
|-------|---------|--------|-------|
| Parser | ~85% | 90% | Round-trip tests cover most paths |
| Store | ~80% | 85% | Good CRUD coverage, expand queries |
| Sync | ~60% | 80% | Need more conflict scenarios |
| State | ~90% | 95% | All actions covered |
| Components | ~50% | 70% | Expand prop combinations |
| CLI | ~75% | 80% | Add error path coverage |

---

## New Feature Testing Checklist

When adding a new feature, ensure you have tests for:

### Layer-Appropriate Tests

- [ ] **Parser changes?** → Unit tests in `km-markdown/tests/`
- [ ] **Store changes?** → Integration tests in `km-store/tests/`
- [ ] **New BoardAction?** → Unit test in `km-tui-core/tests/boardReducer.test.ts`
- [ ] **New command?** → CLI integration test + mdtest golden file
- [ ] **Visual change?** → Storybook story + optional Playwright test

### Coverage Requirements

- [ ] Happy path tested
- [ ] Error/edge cases tested
- [ ] Invalid input handled
- [ ] Boundary conditions tested (empty, max, unicode)

### Documentation

- [ ] Test describes expected behavior (readable test names)
- [ ] Complex logic has inline comments
- [ ] Public API changes reflected in tests

### Quality Gates

```bash
# Before committing
bun fix                    # MUST pass
bun test                   # MUST pass
bun test <your-changes>    # Focused test run
```

---

## Appendix: km-sh Command Reference

For use in mdtest golden files:

### Navigation Commands
| Command | Action |
|---------|--------|
| `move_up` | Move cursor up one card |
| `move_down` | Move cursor down one card |
| `move_left` | Move to previous column |
| `move_right` | Move to next column |
| `jump_top` | Jump to first card |
| `jump_bottom` | Jump to last card |

### Selection Commands
| Command | Action |
|---------|--------|
| `select_card <col> <card>` | Select specific card |
| `select_card_add <nodeId>` | Add to multi-select |
| `select_card_remove <nodeId>` | Remove from multi-select |
| `select_card_toggle <nodeId>` | Toggle multi-select |
| `select_all` | Select all cards |
| `select_all_column` | Select all in column |
| `clear_selection` | Clear multi-select |

### View Commands
| Command | Action |
|---------|--------|
| `toggle_fold <cardId>` | Toggle card fold |
| `fold_column <index>` | Fold all in column |
| `unfold_column <index>` | Unfold all in column |
| `set_view_mode <mode>` | Set view (cards/list/columns/tabs) |

### Shell Commands
| Command | Action |
|---------|--------|
| `state` | Print current state |
| `view` | Render ASCII view |
| `help [cmd]` | Show help |
| `quit` | Exit shell |

### Key Commands
| Command | Action |
|---------|--------|
| `key j` | Same as `move_down` |
| `key k` | Same as `move_up` |
| `key h` | Same as `move_left` |
| `key l` | Same as `move_right` |
| `key g` | Same as `jump_top` |
| `key G` | Same as `jump_bottom` |
| `key <Enter>` | Special key |

---

## Related Documents

- [specs/README.md](README.md) - Architecture overview
- [specs/km-design-system.md](km-design-system.md) - TUI visual design
- [CLAUDE.md](../CLAUDE.md) - Agent instructions including test requirements
- [packages/km-tui-core/src/commandParser.ts](../packages/km-tui-core/src/commandParser.ts) - Full command reference
