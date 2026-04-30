---
description: Get external LLM code review with km principles
argument-hint: <file-or-code>
allowed-tools: Read, Bash
---

## Usage

```bash
/code review-llm src/repo.ts           # Review a file
/code review-llm src/repo.ts:100-200   # Review specific lines
```

---

# External Code Review

Get a second opinion from another LLM, with project context and principles.

## Execution

### Step 1: Gather Context

1. **Read docs/principles.md** - Find the "Quick Reference" section (Do/Don't lists)
2. **Read the target code** - The file or lines to review
3. **Note the file's location** - Which layer? (apps/, packages/km-storage/, etc.)

### Step 2: Build Prompt

Include three sections: **Project Context**, **Principles**, **Code to Review**

```
## Project Context

km is a task management TUI (terminal UI) built with:
- **TypeScript + Bun** - Runtime and package manager
- **Ink/React** - Terminal UI framework (React components render to terminal)
- **SQLite** - Local database for fast queries
- **Markdown files** - Source of truth, bidirectional sync with SQLite

Architecture (each layer only calls the layer below):
```
Apps (TUI, CLI, REPL)
  → Board (cursor, selection, zoom state)
    → Tree (node queries, display names)
      → Storage (SQLite, events, file sync)
        → Parser (markdown ↔ nodes)
          → Filesystem (markdown files)
```

Key design choices:
- **Factory functions, not classes** - `createRepo()` returns plain objects, enables DI
- **Explicit dependencies** - Pass db/config via `options.inject`, no globals
- **Fail loud** - Throw on programming errors, don't return null defensively
- **Generators for pipelines** - Multi-stage processing uses async generators
- **Concise over verbose** - Don't add lines for "flexibility" or "future needs"

This is a personal project optimized for maintainability by one person + AI agents.
Code should be readable top-to-bottom without jumping between many small functions.

## Project Principles (Quick Reference from docs/principles.md)

### Structure
- Core functions (exports) first - the reason this module exists
- Helpers at bottom - in importance order, narrative flows
- Core logic <15 lines - abstract details to helpers
- Helpers after return or at end of file

### Alignment
- Align variable names with return property names: `{ path, data }` not `{ path: rootPath, data: loadedData }`
- Family names consistent: `getNode`, `getChildren`, `getSubtree` (all `get*`)
- Same-level things get same visual weight - extract all or inline all
- Domain types explicit (documentation), internal types inferred

### Patterns
- `const` over `let`: `const x = transform(initial)` not `let x; x = mutate(x)`
- Spread over manual: `{ ...defaults, ...overrides }` not field-by-field copying
- Compose over call: `withHooks(base)` returns wrapped, not `addHooks()` that mutates
- Early returns (guard clauses at top)
- Lookup objects over switch

### Avoid (delete when you see them)
- `ensure*` checks - lower levels throw naturally
- Getters/setters - use plain properties
- Pure delegators - `f(x)` just calls `g(x)`, call `g(x)` directly
- Compatibility shims - break and fix callers now
- Inline expressions - prefer named helper calls
- `let` with mutation - use `const` with transform

### Keep (deliberate indirection)
- Interfaces at boundaries - `DataStore` enables swapping implementations
- Dependency injection - pass `db` as param, not import singleton
- Hooks for extension - `beforeMutation`/`afterMutation` without modifying core
- Wrappers for concerns - `withHooks(baseRepo)` separates cross-cutting concerns

## Code to Review

File: [file path and which layer it belongs to]

```typescript
[paste code]
```

## Questions

1. Is there repetitive code that could be consolidated? (DRY violations)
2. Could this be shorter while staying clear?
3. Is anything over-engineered for what it does?
4. Are there patterns that conflict with the project principles above?
5. Any `ensure*` checks, getters/setters, or pure delegators that should be deleted?
6. Any `let` with mutation that should be `const` with transform?
7. Any misaligned names that prevent shorthand syntax?
8. Any mixed visual weight (one method much longer than siblings)?
```

### Step 3: Query

```bash
bun llm opinion "[constructed prompt]"
```

### Step 4: Report

Summarize actionable feedback. Filter out suggestions that:
- Add abstraction "for flexibility"
- Suggest classes or DI frameworks
- Increase line count significantly
- Conflict with the stated principles

## Why Include Project Context

Without context, an external LLM might suggest:
- "Use a class with dependency injection" (we use factory functions)
- "Add error handling for null" (we fail loud on programming errors)
- "Extract this into smaller functions" (we prefer concise, readable code)
- "Use a state management library" (we use plain React state + reducers)

The context section prevents these mismatched suggestions.
