---
description: "Code quality - architecture, types, refactoring, design improvement. Use when reviewing code structure, improving type safety, simplifying code, or stepping back to find dramatic improvements. **Proactively activate `/code improve`** after completing any substantial feature/refactor where the code feels complicated, has repeated patterns, or smells like it's fighting the wrong abstraction."
argument-hint: [review|types|clean|improve|complexity]
allowed-tools: Task, Read, Glob, Grep, Bash, Agent, Edit, Write, AskUserQuestion
---

# Code Quality

**Keywords**: code review, architecture, types, clean, quality, layers, over-engineering, improve, simplify, rethink

Reviews for architecture violations, type safety, code simplification, and design improvement.

**Auto-activate `/code improve`** after completing substantial work when you notice: repeated boilerplate patterns, handlers with 5+ branches doing similar things, functions that feel like they should be 3 lines but are 20, or code that's correct but feels like it's fighting the architecture. Don't wait for the user to ask — suggest it.

## Quick Actions

| Command             | Purpose                                              |
| ------------------- | ---------------------------------------------------- |
| `/code review`      | Architecture review (layers, smells)                 |
| `/code types`       | Type safety review                                   |
| `/code improve`     | Design review + simplification (alias: `/code clean`) |
| `/code complexity`  | Complexity analysis and refactoring                  |

## Sub-Skills

| File                               | Purpose                                         |
| ---------------------------------- | ----------------------------------------------- |
| [review-code.md](review-code.md)   | Layer violations, over-engineering (infrequent) |
| [review-types.md](review-types.md) | Type safety, any removal (infrequent)           |
| [review-llm.md](review-llm.md)     | External LLM review with km principles          |
| [improve.md](improve.md)           | Design + simplification (also: `/code clean`)   |
| [complexity.md](complexity.md)     | Cyclomatic/cognitive complexity analysis        |
