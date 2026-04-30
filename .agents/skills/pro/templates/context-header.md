# km — Project Context for Code Review

## What km Is

km is a workspace for agentic knowledge workers — unified notes, tasks, and calendar with full history and bidirectional markdown sync. It's a TypeScript monorepo using Bun, React (via silvery TUI reconciler), SQLite, and Vitest.

## Architecture

Layered: **App → Board → Tree → Storage → Parser → Filesystem**. Each layer calls only the layer below. UI never touches the filesystem; all edits are bidirectional (TUI ↔ Model ↔ Markdown files).

```
File tree (folders, .md files)
       ↓ parse
Semantic tree (nodes with properties)
       ↓ render
TUI (React via silvery reconciler)
       ↓ edit
Events → SQLite → File (bidirectional sync)
```

### Key Subsystems

- **Storage** (`km-storage`): SQLite with WAL mode, FTS5 full-text search, event sourcing
- **Tree** (`km-tree`): Semantic node tree parsed from markdown
- **Board** (`km-board`): Kanban board model (columns, cards, filters)
- **Commands** (`km-commands`): All discrete keys go through the command system
- **Markdown** (`km-markdown`): mdast/micromark-based parsing and serialization
- **TUI** (`km-tui`): React components via silvery reconciler

### Vendor Packages (part of km)

- **silvery**: General-purpose TUI framework (reconciler, components, theme, tea state management)
- **flexily**: Yoga-compatible flexbox layout engine
- **loggily**: Structured logger
- **termless**: Headless terminal testing

## Code Style & Principles

- **Factory functions** — no classes, no globals, no `require`
- **`using` keyword** for cleanup (RAII-style resource management)
- **Async generators** for composable data flows
- **Explicit dependency injection** — all dependencies passed as arguments
- **Correctness > maintainability > simplicity > performance**
- **Fail loud, fail now** — assertions at boundaries, not defensive code in internals
- **Immutable updates** — especially for state management (Zustand)

### Type Safety

- TypeScript strict mode
- Prefer discriminated unions over boolean flags
- Use `satisfies` for type-safe object literals
- No `any` — use `unknown` with type guards

### Error Handling

- Validate at system boundaries (user input, external APIs, file I/O)
- Trust internal code — don't add redundant null checks for things that can't be null
- Use Result types for expected failures, throw for unexpected ones

## Review Instructions

You are reviewing TypeScript code from this project. Focus on:

1. **Correctness bugs**: Logic errors, off-by-one, wrong types, missed edge cases, broken invariants
2. **Safety**: Resource leaks (missing cleanup/`using`), race conditions in async code, error handling gaps at boundaries
3. **API design**: Inconsistencies, foot-guns, missing validation at system boundaries
4. **Performance**: Unnecessary allocations, O(n^2) where O(n) suffices, blocking the event loop

### Classification

- **P0**: Correctness bugs that WILL cause wrong behavior in production
- **P1**: Important issues (safety, resource leaks, significant quality problems)
- **P2**: Medium (quality improvements, minor inconsistencies)
- **P3**: Style (naming, formatting — only if clearly better)

For each finding, provide: **file path**, **line range**, **classification**, **description**, and a **suggested fix**.

### Do NOT Report

- Style preferences (the codebase has its own style)
- Missing JSDoc/TSDoc (we don't use them — code should be self-documenting)
- Import ordering (handled by linter)
- Missing `else` after `return` (our style)
- Suggestions to add classes (we use factory functions)
- Type annotation additions for already-inferred types
