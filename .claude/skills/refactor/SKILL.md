---
description: Plan and execute large refactors — phased migrations, API redesigns, package extractions. Use when a refactor spans multiple files/packages and needs a plan with phases, /complete criteria, and zero-WIP discipline.
argument-hint: [plan|review|phase]
allowed-tools: Task, Read, Glob, Grep, Bash, Agent, Edit, Write, AskUserQuestion
---

# Refactor — Large-Scale Refactoring Plans

**Keywords**: refactor, migration, extract, decompose, split, rename, redesign, phase

Plans and executes large refactors with phased discipline. Not for small renames or one-file cleanups — use `/code clean` for those.

## MANDATORY FIRST STEP

**Read [docs/lessons/refactoring.md](../../docs/lessons/refactoring.md) IN FULL before proceeding.** This is not optional. Use the `Read` tool to read the entire file now — every case study, every lesson. The reasoning behind the rules matters as much as the rules themselves. If you skip this, you will repeat the mistakes documented in it.

## Quick Actions

| Command | Purpose |
|---|---|
| `/refactor plan <scope>` | Create a phased plan |
| `/refactor review` | Review existing plan for gaps and risks |
| `/refactor phase <N>` | Execute a specific phase with /complete |

All commands load the refactoring workflow at [pm/workflows/refactor.md](../pm/workflows/refactor.md).

## When to Use

- Extracting a package from a monolith
- Decomposing a monolithic type/function into composable parts
- Migrating from OldAPI to NewAPI across many consumers
- Splitting a large file/module into multiple
- Any change touching 10+ files that can't be done atomically
