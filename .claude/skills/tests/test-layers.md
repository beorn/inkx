---
description: Test layering philosophy — what each layer tests vs trusts, value checks, and templates
---

# Test Layers

Every test should answer: **"Does this test what THIS layer adds?"**

## The Layers

```
Layer 5: km-tui (.spec.ts)     → User journeys: keys in, screen + persistence out
Layer 4: km-board (.test.ts)   → Action sequences: actions in, state transitions out
Layer 3: km-storage (.test.ts) → Pipeline integrity: files in, nodes out, files back
Layer 2: km-markdown (.test.ts)→ Parse fidelity: markdown in, AST/nodes out
Layer 1: km-core (.test.ts)    → Contracts: inputs in, invariants hold
Layer 0: vendor/inkx (.test.ts)→ Rendering correctness: components in, buffer out
```

## What Each Layer Tests vs Trusts

| Layer | Tests (what it ADDS) | Trusts (from below) |
|-------|---------------------|---------------------|
| **km-tui** | Key → visual outcome + data saved. Multi-step journeys. | Board reducer works. Storage persists. Rendering is correct. |
| **km-board** | Action sequences → state transitions. Fold/zoom/cursor composition. | Nodes exist. Markdown parses. |
| **km-storage** | File ↔ DB round-trip integrity. Concurrent edits. Sync safety. | Markdown parser is correct. |
| **km-markdown** | Parse edge cases. Format fidelity. Spec compliance. | Nothing below — this is the leaf. |
| **km-core** | Behavioral contracts (Result short-circuits, ToastQueue batches). | Types are correct (enforced by TS). |
| **vendor/inkx** | Incremental render = fresh render. Layout correctness. | Nothing — it's the platform. |

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

One test exercises navigation + editing + persistence + undo in a single scenario. Each test tells a user story.

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
    updateNode(db, "Beta", { task_status: "done" })

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

## Relationship to Import Cost Layers

The import cost taxonomy in [test-first-protocol.md](test-first-protocol.md#test-layer-taxonomy) describes **performance layers** (how expensive the test is to run). This document describes **semantic layers** (what the test should verify). They're complementary:

- A km-core contract test should be Layer 0 (pure logic) in import cost AND Layer 1 (contracts) semantically
- A km-tui journey test will be Layer 2-3 in import cost AND Layer 5 semantically
- If a test is high import cost but tests a low semantic layer, it's probably in the wrong place

**Keywords**: test layers, test philosophy, value check, layer check, cross-layer testing, journey test, pipeline test, contract test
