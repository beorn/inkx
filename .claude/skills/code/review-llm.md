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

## Project Principles

[paste Quick Reference section from docs/principles.md here]

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
