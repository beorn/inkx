---
description: "Code quality - principles compliance, architecture, design, simplification. Use when reviewing code structure, improving type safety, simplifying code, or stepping back to find dramatic improvements. **Proactively activate `/code quality`** after completing any substantial feature/refactor where the code feels complicated, has repeated patterns, or smells like it's fighting the wrong abstraction."
argument-hint: [quality|review|improve|clean|types|complexity]
allowed-tools: Task, Read, Glob, Grep, Bash, Agent, Edit, Write, AskUserQuestion
---

# Code Quality

**Keywords**: code review, architecture, types, clean, quality, layers, over-engineering, improve, simplify, rethink, principles

Reviews for principles compliance, architecture violations, type safety, code simplification, and design improvement.

**Auto-activate `/code quality`** after completing substantial work when you notice: repeated boilerplate patterns, bare helper functions that should be on namespaces, handlers with 5+ branches doing similar things, functions that feel like they should be 3 lines but are 20, or code that reads like implementation details instead of domain operations. Don't wait for the user to ask — suggest it.

## Quick Actions

| Command             | Purpose                                              |
| ------------------- | ---------------------------------------------------- |
| `/code quality`     | Unified: principles + architecture + design + simplification |
| `/code review`      | Alias for `/code quality` (dry-run)                  |
| `/code improve`     | Alias for `/code quality --fix`                      |
| `/code clean`       | Alias for `/code quality --fix`                      |
| `/code types`       | Type safety review                                   |
| `/code complexity`  | Complexity analysis and refactoring                  |

## Sub-Skills

| File                               | Purpose                                         |
| ---------------------------------- | ----------------------------------------------- |
| [quality.md](quality.md)           | Unified quality (replaces review-code + improve) |
| [review-types.md](review-types.md) | Type safety, any removal (infrequent)           |
| [review-llm.md](review-llm.md)     | External LLM review with km principles          |
| [complexity.md](complexity.md)     | Cyclomatic/cognitive complexity analysis        |
