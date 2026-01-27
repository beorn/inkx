---
description: Code quality - architecture, types, refactoring. Use when reviewing code structure, improving type safety, or simplifying code.
argument-hint: [review|types|clean]
allowed-tools: Task, Read, Glob, Grep, Bash, TodoWrite, AskUserQuestion, Edit
---

# Code Quality

**Keywords**: code review, architecture, types, clean, quality, layers, over-engineering

Reviews for architecture violations, type safety, and code simplification.

## Quick Actions

| Command        | Purpose                               |
| -------------- | ------------------------------------- |
| `/code review` | Architecture review (layers, smells)  |
| `/code types`  | Type safety review                    |
| `/code clean`  | Simplification and consistency review |

## Sub-Skills

| File                               | Purpose                                         |
| ---------------------------------- | ----------------------------------------------- |
| [review-code.md](review-code.md)   | Layer violations, over-engineering (infrequent) |
| [review-types.md](review-types.md) | Type safety, any removal (infrequent)           |
| [clean.md](clean.md)               | Simplification patterns                         |
