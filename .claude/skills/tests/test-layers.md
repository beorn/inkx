---
description: Test layering philosophy — what each layer tests vs trusts, value checks, and templates
---

# Test Layers

Every test should answer: **"Does this test what THIS layer adds?"**

## Priority: Acceptance Tests First

**The most valuable tests are closest to the user.** Journey tests (`.spec.ts`) that press keys and verify what the user sees + what got saved are the highest priority. They catch the most bugs per line of test code because they exercise the full stack.

**Write and optimize acceptance tests before anything else.** Lower-layer tests exist to isolate failures and guard contracts — but if you only have time for one test, make it a journey test.

## The Layers

```
── comprehensive ───────────────────────────────────────────────────────
Layer 6: test:ci (bun run test:ci)    → All checks: typecheck + lint + fast + slow + vendor + fuzz

── km app ──────────────────────────────────────────────────────────────
Layer 5b: Termless (.termless.test.ts) → ANSI output verification: buffer → real terminal emulator
Layer 5a: km-tui (.spec.ts)           → User journeys: keys in, screen + persistence out  ← TOP PRIORITY
Layer 4: km-board (.test.ts)     → Action sequences: actions in, state transitions out
Layer 3: km-storage (.test.ts)   → Pipeline integrity: files in, nodes out, files back
Layer 2: km-markdown (.test.ts)  → Parse fidelity: markdown in, AST/nodes out
Layer 1: km-core (.test.ts)      → Contracts: inputs in, invariants hold

── vendor (TUI stack) ──────────────────────────────────────────────────
Layer 0a: silvery-ui (.test.ts)  → Component behavior: props in, visual + interaction out
Layer 0b: silvery (.test.ts)     → Rendering pipeline: React tree in, terminal buffer out
Layer 0c: flexily (.test.ts)       → Layout computation: flex config in, box coordinates out
Layer 0d: ansi (.test.ts)        → Terminal primitives: color/style in, ANSI sequences out

── vendor (infrastructure) ─────────────────────────────────────────────
Layer 0e: logger (.test.ts)      → Log routing: calls in, formatted output out
Layer 0f: vimonkey (.test.ts)     → Test tooling: generators in, fuzz/chaos sequences out
Layer 0g: mdspec (.test.ts)      → Test runner: markdown in, shell execution + assertion out
Layer 0h: tools (.test.ts)       → Dev CLI: commands in, file/API effects out
Layer 0i: accountly (.test.ts)   → Credentials: provider config in, auth tokens out
Layer 0j: tap (.test.ts)         → TAP orchestration: streams in, merged output out
Layer 0k: watcher-chaos (.test.ts) → Chaos simulation: events in, dropped/reordered events out
```

## What Each Layer Tests vs Trusts

### km app layers

| Layer | Tests (what it ADDS) | Trusts (from below) |
|-------|---------------------|---------------------|
| **Termless** | ANSI output → real terminal emulator state. Style correctness, cursor positioning, wide chars. | Silvery buffer is correct. |
| **km-tui** | Key → visual outcome + data saved. Multi-step journeys. | Board reducer works. Storage persists. Rendering is correct. |
| **km-board** | Action sequences → state transitions. Fold/zoom/cursor composition. | Nodes exist. Markdown parses. |
| **km-storage** | File ↔ DB round-trip integrity. Concurrent edits. Sync safety. | Markdown parser is correct. |
| **km-markdown** | Parse edge cases. Format fidelity. Spec compliance. | Nothing below — this is the leaf parser. |
| **km-core** | Behavioral contracts (Result short-circuits, ToastQueue batches). | Types are correct (enforced by TS). |

### Vendor TUI stack

| Layer | Tests (what it ADDS) | Trusts (from below) |
|-------|---------------------|---------------------|
| **silvery-ui** | Component lifecycle (spinner frames, progress updates, multi-progress orchestration). | silvery renders components correctly. |
| **silvery** | Reconciler, scheduler, incremental diff, keyboard dispatch, buffer encoding. Incremental render = fresh render. | Flexily computes layout. ansi produces correct ANSI. |
| **flexily** | Flex layout: positioning, sizing, wrapping, overflow. Incremental relayout = fresh layout (fuzz oracle). | Nothing — leaf computation engine. |
| **ansi** | Color/style output, terminal capability detection, ANSI sequence generation. | Nothing — leaf terminal abstraction. |

### Vendor infrastructure

| Layer | Tests (what it ADDS) | Trusts (from below) |
|-------|---------------------|---------------------|
| **logger** | Namespace filtering, log level propagation, span timing, structured output. | Nothing — standalone. |
| **vimonkey** | Fuzz generators (`gen`/`take`), chaos transformers (drop/reorder/burst). | vitest API is correct. |
| **mdspec** | Markdown code block extraction, shell session execution, output assertion. | Nothing — standalone test runner. |
| **tools** | Refactor CLI (AST transforms), recall (session search), LLM bridge. | Filesystem, external APIs. |
| **accountly** | Multi-provider credential management, keychain abstraction, token refresh. | Nothing — mocks all system APIs. |
| **tap** | TAP stream merging, format conversion. | Nothing — standalone. |
| **watcher-chaos** | Event stream corruption (drop, reorder, duplicate, burst) for chaos testing. | Nothing — standalone. |

## Boundary Testing — When Trust Breaks Down

The "trust the layer below" principle keeps tests focused, but bugs cluster at **boundaries** — where two layers' assumptions meet. Sometimes cross-layer verification is justified.

### When cross-layer tests ARE warranted

1. **Complex or implicit contracts**: If the interface between layers has subtle invariants that neither side fully specifies in its own tests, a test spanning both layers catches contract mismatches. Example: km-board assumes storage handles a certain action sequence, but storage changed its contract.

2. **Consistently-wrong results**: Fuzz oracles catch *inconsistencies* (incremental != fresh) but not *consistently wrong* output. If Flexily computes padding off-by-1 consistently, the differential fuzz oracle passes. A targeted silvery test asserting exact buffer positions catches this.

3. **Feature combinations not covered by either layer**: If markdown content influences UI state (e.g., a special notation that collapses a card), neither km-markdown tests nor km-board tests alone cover it. A journey test exercising the full chain is the only guard.

### Critical boundaries to watch

| Boundary | Risk | Guard |
|----------|------|-------|
| **silvery → flexily** | Layout coordinates wrong but consistent | Targeted position assertions in silvery tests + golden file snapshots |
| **km-tui → km-board** | Board reducer contract mismatch | Journey tests that verify BOTH screen AND state for every major action |
| **km-board → km-storage** | Persistence assumption drift | Journey tests that verify saved data, not just screen |
| **km-storage → km-markdown** | Parser edge case not in markdown tests | Ensure tricky real-world patterns (Obsidian, Asana) are tested at L2 |
| **silvery → ansi** | Low risk — stable, thin API | Unit tests sufficient; any breakage shows in UI color assertions |

### The rule

**Trust but verify at critical boundaries.** Don't re-test lower layers systematically, but DO write targeted integration tests where the interface is complex, implicit, or historically buggy. A few cross-boundary assertions are not the same as wholesale cross-layer re-testing.

## Value Check (before writing any test)

Ask these three questions:

1. **Layer check**: Does this test belong at this layer? A test that verifies markdown parsing edge cases belongs in km-markdown, not km-storage. A test that checks board reducer state shape belongs in km-board, not km-tui.

2. **Addition check**: Does this test verify what THIS layer adds on top of the layers below? If the test would pass even if this layer were a no-op passthrough, it's testing the wrong layer.

3. **Observation check**: Is the assertion at the right abstraction level?
   - km-tui: screen content, visual state, persisted data
   - km-board: state shape after action sequences
   - km-storage: file content after round-trip, DB state after sync
   - km-markdown: AST structure from parsed markdown
   - km-core: return values, side-effect counts, invariant holds

## Non-Obvious Tests Need Rationale

If a test's purpose isn't self-evident from its name and assertions, add a comment explaining:

1. **Why it exists** — what bug or edge case it guards against (bead ID, issue link, or description)
2. **When it's safe to remove** — what condition would make this test obsolete

```typescript
// Guards against cursor drift when folding the last visible card in a column.
// Without this, fold collapses the card but cursor stays at the old index,
// pointing past the end of the visible list. See beads-k8m2x.
// Safe to remove: if fold logic moves to a state machine with cursor-follows-fold built in.
test("fold last card moves cursor up", () => { ... })

// Regression: Obsidian callouts with nested code blocks lost the closing fence.
// The parser was greedily consuming `>` prefixed lines including the fence.
// Safe to remove: if we switch to a streaming parser that handles nesting natively.
test("callout with nested code block preserves fence", () => { ... })
```

Tests without rationale look like candidates for deletion during reviews. The 5 seconds spent writing a comment saves 5 minutes of archaeology later.

## Anti-Pattern: Cross-Layer Re-Testing

**Bad** — tests that re-verify behavior owned by a lower layer:

| Test location | What it tests | Should be in |
|---------------|---------------|-------------|
| km-storage test verifying markdown heading parse | Parsing edge cases | km-markdown |
| km-tui test asserting board reducer state shape | Reducer transitions | km-board |
| km-core test checking `getMarkerForStatus("done") === "[x]"` | Static lookup (type-enforceable) | Delete — the type system handles this |
| km-board test that re-parses markdown to verify nodes | Parse fidelity | km-markdown |
| km-tui test that only asserts DB state, never screen | Pipeline integrity | km-storage |

**Good** — tests that verify what their layer adds:

| Test location | What it tests | Why it belongs |
|---------------|---------------|---------------|
| km-tui spec pressing keys and checking screen + saved data | User journey | Only this layer has the full key→screen→persist pipeline |
| km-storage test writing a file, syncing, editing DB, syncing back | Round-trip integrity | Only this layer orchestrates file ↔ DB |
| km-markdown test parsing a tricky Obsidian frontmatter doc | Parse fidelity | This IS the parsing layer |
| km-board test dispatching fold+zoom+cursor actions in sequence | State composition | Only this layer composes these actions |
| km-core test verifying Result.andThen short-circuits | Behavioral contract | This is the contract owner |

## Test Templates

### Journey Test (km-tui, .spec.ts)

**One user story per test.** A journey should be 3-5 steps that naturally go together — a coherent user goal. If you're simulating a second distinct story, break it into another test.

- **Too short** (1 step): loses the integration benefit — you're back to unit tests
- **Sweet spot** (3-5 steps): edit → move → undo, or search → replace → verify
- **Too long** (10+ unrelated steps): hard to debug, brittle to UI changes

```typescript
test("edit card, move to another column, undo restores both position and content", () => {
  const { board, repo } = testEnv(() =>
    item("board", item("Todo", item("Buy milk")), item("Done", item("Ship v2")))
  )
  board.press("Enter")           // edit mode
  board.type(" (organic)")       // modify content
  board.press("Escape")          // save
  board.press("opt+l")           // move to Done column

  // Verify BOTH screen and persistence
  expect(repo.getNode("Buy milk")?.content).toBe("Buy milk (organic)")
  board.expect("#Buy milk").toExist()

  board.press("Control+z")       // undo move
  board.press("Control+z")       // undo edit
  expect(repo.getNode("Buy milk")?.content).toBe("Buy milk")
})
```

This single test exercises: inline editing, content persistence, cross-column move, undo stack, cursor following. Compare to 5 separate tests each with their own `testEnv()` setup.

### Pipeline Test (km-storage)

Test what this layer adds — file ↔ DB integrity — not parsing.

```typescript
test("concurrent fs and db edits merge without data loss", async () => {
  await withTestEnv(async ({ repoDir, db }) => {
    writeFileSync(join(repoDir, "tasks.md"), "- [ ] Alpha\n- [ ] Beta\n")
    await sync(db, repoDir)

    // Concurrent: fs adds a task, db marks one done
    appendFileSync(join(repoDir, "tasks.md"), "- [ ] Gamma\n")
    updateNode(db, "Beta", { item: { task: { marker: "[x]", status: "done" } } })

    await sync(db, repoDir)
    const content = readFileSync(join(repoDir, "tasks.md"), "utf-8")
    expect(content).toContain("- [ ] Alpha")
    expect(content).toContain("- [x] Beta")
    expect(content).toContain("- [ ] Gamma")
  })
})
```

### Contract Test (km-core)

Don't test what the type system enforces. Test behavioral contracts.

```typescript
// DELETE: static lookup the type system should enforce
test("maps 'done' to '[x]'", () => {
  expect(getMarkerForStatus("done")).toBe("[x]")
})

// KEEP: behavioral contract (short-circuit behavior)
test("Result.andThen short-circuits on first error", () => {
  let called = false
  const result = andThen(Err("fail"), () => { called = true; return Ok(1) })
  expect(called).toBe(false)
})
```

### Fidelity Test (km-markdown)

Parse tricky real-world documents and verify structure. These are the leaf layer — no lower layer to trust.

```typescript
test("Obsidian callout with nested code block preserves structure", () => {
  const ast = parse(dedent`
    > [!warning] Edge case
    > \`\`\`ts
    > const x = 1
    > \`\`\`
    > After code
  `)
  expect(ast.children[0].type).toBe("callout")
  expect(ast.children[0].children).toHaveLength(2) // code block + paragraph
})
```

### Reducer Test (km-board)

Test state machines in isolation — no rendering overhead. Each test costs ~50ms vs ~1.8s for testEnv(). The unit test tells you WHERE the bug is; the journey test tells you THAT something is broken.

```typescript
import { createBoardState, boardReducer } from "@km/board"

test("fold + cursor + unfold round-trips cursor position", () => {
  const state = createBoardState({ nodes, rootId: "board" })
  const atCard = boardReducer(state, { type: "MOVE_CURSOR", to: "card-3" })
  const folded = boardReducer(atCard, { type: "FOLD_NODE", nodeId: "col1" })

  expect(folded.foldedNodes.has("col1")).toBe(true)
  expect(folded.cursorId).not.toBe("card-3") // cursor moved away from folded content

  const unfolded = boardReducer(folded, { type: "UNFOLD_NODE", nodeId: "col1" })
  expect(unfolded.cursorId).toBe("card-3") // cursor restored
})
```

Prioritize: fold/unfold edge cases, cursor movement rules, multi-action sequences (move+undo+redo), empty column handling, selection invariants.

### Property-Based Test (km-markdown)

For parser fidelity, property-based tests catch edge cases that hand-written examples miss. The key property: `roundtrip(md) === md` — parsing then serializing should preserve the original.

```typescript
import { gen, take } from "vimonkey"
import { roundtrip } from "./helpers/test-utils"

// Generate random markdown documents
const mdGen = gen.oneOf(
  gen.map(gen.string(), s => `# ${s}\n`),           // headings
  gen.map(gen.string(), s => `- [ ] ${s}\n`),        // tasks
  gen.map(gen.string(), s => `> ${s}\n`),             // blockquotes
  gen.map(gen.array(gen.string()), lines =>           // paragraphs
    lines.join("\n") + "\n\n"
  ),
)

test.fuzz("markdown roundtrip preserves structure", () => {
  const docs = take(mdGen, 100)
  for (const md of docs) {
    expect(roundtrip(md)).toBe(md)
  }
})
```

Also use for: frontmatter preservation, list nesting depth, inline formatting combinations.

### Layout Verification Test (silvery)

For the silvery→Flexily boundary, assert exact buffer positions — not just content existence. The fuzz oracle catches inconsistencies, but these catch consistently-wrong layout.

```typescript
test("side-by-side boxes render at correct positions", () => {
  const { buffer } = createRenderer(
    <Box flexDirection="row" width={20}>
      <Box width={10}><Text>LEFT</Text></Box>
      <Box width={10}><Text>RIGHT</Text></Box>
    </Box>
  )
  // LEFT starts at column 0, RIGHT starts at column 10
  expect(buffer.cell(0, 0).char).toBe("L")
  expect(buffer.cell(10, 0).char).toBe("R")
})
```

Use sparingly — a handful of position-asserting tests at the silvery level catch Flexily layout bugs that the fuzz oracle misses (consistently-wrong results).

### Parametric Variants (any layer)

When testing N variants of the same behavior, use `test.each` — not N identical tests.

```typescript
// Before: 4 identical tests (50 lines each)
// After: 1 parametric test (15 lines)
test.each(["info", "success", "warning", "error"] as const)(
  "%s toast renders with correct icon", (level) => {
    const { board, toastQueue } = testEnv(fixture, { incremental: false })
    toastQueue[level]("message")
    board.press("l"); board.press("h")
    expect(board.q("#toast").getAttribute("data-level")).toBe(level)
  }
)
```

## When Suffix Should Be .spec.ts vs .test.ts

| Suffix | Layer | What | Example |
|--------|-------|------|---------|
| `.spec.ts` | km-tui (Layer 5) | Multi-step user journeys — keys in, observations out | `board-edit.slow.spec.ts` |
| `.test.ts` | All layers | Unit/component/pipeline tests — internal API | `fold.slow.test.ts` |

**Rule of thumb**: If your test presses keys and asserts what the user sees, it's a `.spec.ts`. If it calls internal functions or checks internal state, it's a `.test.ts`. The `.spec.ts` suffix signals "this tests at the user level."

## Per-Package Best Practices

Each test directory has a `CLAUDE.md` with package-specific helpers, fixtures, and patterns. These are auto-loaded by Claude Code when working in that directory.

### km app packages

| Package | Tests | Layer | Key Helpers | CLAUDE.md |
|---------|-------|-------|-------------|-----------|
| **km-tui** | 112 | User journeys (L5) | `item()`, `testEnv()`, `board.app()`, invariants | [tests/CLAUDE.md](../../../apps/km-tui/tests/CLAUDE.md) |
| **km-board** | 2 | Action sequences (L4) | None (inline state) | [tests/CLAUDE.md](../../../packages/km-board/tests/CLAUDE.md) |
| **km-storage** | 44 | Pipeline integrity (L3) | `createTestDatabase()`, `createTestSync()`, chaos fuzz | [tests/CLAUDE.md](../../../packages/km-storage/tests/CLAUDE.md) |
| **km-markdown** | 15 | Parse fidelity (L2) | `parse()`, `roundtrip()`, `makeTestNode()` | [tests/CLAUDE.md](../../../packages/km-markdown/tests/CLAUDE.md) |
| **km-core** | 11 | Contracts (L1) | None (pure functions) | [tests/CLAUDE.md](../../../packages/km-core/tests/CLAUDE.md) |
| **km-cli** | 7 | Command output | mdspec plugin, `km-repl.ts` | [tests/CLAUDE.md](../../../apps/km-cli/tests/CLAUDE.md) |

### Vendor TUI stack

| Package | Tests | Layer | What it tests | Trusts | Key patterns |
|---------|-------|-------|---------------|--------|-------------|
| **silvery-ui** | 11 | Components (L0a) | Spinner frames, progress updates, multi-progress orchestration | silvery rendering | Component unit tests, dual API (CLI + React) |
| **silvery** | 199 | Rendering (L0b) | Reconciler, scheduler, incremental diff, keyboard dispatch, buffer encoding | flexily layout, ansi ANSI | `createRenderer()`, `expectFrame()`, buffer assertions |
| **flexily** | 9+7 bench | Layout (L0c) | Flex positioning, sizing, wrapping, overflow. Incremental relayout = fresh layout | Nothing (leaf) | Differential fuzz oracle, yoga compat, benchmarks |
| **ansi** | 5 | Terminal (L0d) | Color/style output, capability detection, ANSI sequences | Nothing (leaf) | Env var mocking, detection tests |

### Vendor infrastructure

| Package | Tests | Layer | What it tests | Key patterns |
|---------|-------|-------|---------------|-------------|
| **logger** | 2 | Logging (L0e) | Namespace filtering, level propagation, span timing | Mock console |
| **vimonkey** | 5+1 fuzz | Test tooling (L0f) | Fuzz generators, chaos transformers | Self-testing (tests its own tools) |
| **mdspec** | 9 | Test runner (L0g) | Markdown code block extraction, shell execution, output assertion | Shell session capture |
| **tools** | 10 | Dev CLI (L0h) | Refactor (AST transforms), recall (session search), LLM bridge | Temp filesystem, mock fetch |
| **accountly** | 11 | Credentials (L0i) | Multi-provider management, keychain abstraction, token refresh | Mock keychain, mock fetch |
| **tap** | 1 | TAP (L0j) | Stream merging, format conversion | Minimal (tiny package) |
| **watcher-chaos** | 1 | Chaos (L0k) | Event stream corruption (drop, reorder, duplicate, burst) | Standalone event transformers |

## Layering Observations

### km app

- **km-board needs more pure reducer tests** (currently 2 test files). Most board behavior is tested through km-tui's `testEnv()` (~1.8s overhead per file). Pure reducer tests cost ~50ms, give precise failure localization, and align with Bubble Tea/Elm best practices of testing the model layer in isolation. Priority areas: fold/unfold edge cases, cursor movement rules, multi-action sequences (move+undo+redo), empty column handling, selection invariants. See `km-all.board-test-migration` (blocked on TEA machines). The goal is not to replace journey tests but to complement them — the unit test pinpoints WHERE, the journey test confirms THAT everything works together.
- **km-storage cross-tests parsing**. Some storage tests re-verify markdown edge cases. These belong in km-markdown — storage tests should trust the parser and focus on file ↔ DB integrity.
- **km-tui tests sometimes skip screen assertions**. TUI tests that only check state/DB without verifying what the user sees may belong in km-board or km-storage. The value of km-tui tests is exercising the full pipeline: keys → screen → persistence.

### Vendor TUI stack

- **silvery → Flexily dependency is the critical boundary**. silvery trusts Flexily for layout. The Flexily differential fuzz oracle catches *inconsistencies* (incremental != fresh), but NOT *consistently wrong* results (e.g., padding off-by-1 that's consistent). To guard against the latter, add a few targeted silvery tests that assert exact buffer positions for known layouts (see [Layout Verification Test template](#layout-verification-test-silvery)). Also consider golden file snapshots for complex silvery layouts to catch position drift. No cross-package regression suite exists yet — these targeted tests are the recommended first step.
- **silvery → ansi dependency is stable**. ansi's ANSI output is a thin, stable API. Unit tests are sufficient here.
- **silvery-ui → silvery is consumer-level**. silvery-ui tests should verify component behavior (spinner animation, progress updates) without re-testing silvery rendering internals. Currently all `.test.ts`, no consumer-level specs.
- **silvery has 199 test files but few consumer-facing tests**. Most tests are internal (buffer encoding, diff algorithm, scheduler). The consumer perspective ("render this component tree, press keys, verify buffer") is well-tested indirectly through km-tui's `testEnv()`, but silvery itself could benefit from more API-level tests that don't depend on km.

### Vendor infrastructure

- **These are standalone packages** — they don't form a dependency chain (logger doesn't depend on vimonkey, etc.). Each is tested in isolation, which is correct.
- **vimonkey is self-testing** — it uses its own fuzz/chaos tools to test itself. This is the right pattern for test infrastructure.
- **No vendor packages have test CLAUDE.md yet.** Only km app packages (km-tui, km-board, km-storage, km-markdown, km-core, km-cli) have per-directory test docs. Add vendor test CLAUDE.md on demand as packages grow or test patterns become complex enough to document.

## Relationship to Import Cost Layers

The import cost taxonomy in [test-first-protocol.md](test-first-protocol.md#test-layer-taxonomy) describes **performance layers** (how expensive the test is to run). This document describes **semantic layers** (what the test should verify). They're complementary:

- A km-core contract test should be Layer 0 (pure logic) in import cost AND Layer 1 (contracts) semantically
- A km-tui journey test will be Layer 2-3 in import cost AND Layer 5 semantically
- If a test is high import cost but tests a low semantic layer, it's probably in the wrong place

## File Consolidation Targets

112 TUI test files is high — the domain mapping lists ~25-30 distinct domains. Target: **~50-60 files** for km-tui through domain-based consolidation.

| Action | Savings | Example |
|--------|---------|---------|
| Merge files sharing a domain prefix | ~1.8s per eliminated file | `cursor-colors.test.ts` + `cursor-stability.slow.spec.ts` → `cursor.slow.test.ts` |
| Combine identical fixtures into journey tests | Reduced testEnv() calls | 5 separate fold tests → 1 fold journey test |
| Absorb tiny files (<50 lines) into domain files | ~1.8s per absorbed file | Single-test regression file → existing domain file |

**Don't merge**: Layer 0 (pure logic) into Layer 2+ files — makes light tests pay 1.8s overhead. Don't merge fast tests into `.slow.` files — removes them from the fast suite.

**Estimated savings**: `(files_eliminated × 1.8s) / vitest_workers ≈ wall_clock_savings`. Example: 20 files × 1.8s / 9 workers ≈ 4s.

## Benchmarks to Consider

Beyond existing Flexily layout and Silvery rendering benchmarks:

| Area | What to Measure | Why |
|------|----------------|-----|
| **Bulk rendering** | Board with 1000+ items: initial render + incremental update time | Catches nonlinear scaling in rendering pipeline |
| **Input latency** | Time from keypress to rendered update (1000 sequential presses) | User-perceptible lag in interactive TUI |
| **Sync at scale** | 1000+ file operations: scan, index, concurrent edit merge | Storage pipeline scaling |
| **Large note rendering** | 10k+ line markdown file rendering | Text wrapping and scroll performance |
| **CLI startup** | Time from `bun km` to first rendered frame | User-perceptible startup delay |
| **Reducer throughput** | 1000 board actions (move+undo+redo churn) | State machine performance under load |

Use `.bench.ts` suffix. Track regressions with `bench:compare`.

**Keywords**: test layers, test philosophy, value check, layer check, cross-layer testing, journey test, pipeline test, contract test, boundary testing, property-based testing
