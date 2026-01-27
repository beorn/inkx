---
name: report-issue
description: Spawn a sub-agent to report and optionally fix an unrelated bug discovered during other work. Use when you find pre-existing bugs, TypeScript errors in untouched code, or technical debt that's not your current focus.
user-invocable: false
---

# Report/Fix Issue

Spawn a sub-agent to handle a bug you discovered while working on something else.

## When to Use

- Pre-existing bug blocking your tests (not caused by your changes)
- TypeScript errors in code you didn't touch
- Incomplete functionality you stumbled upon
- Technical debt that's not your current focus

**Don't use for:** Issues that ARE your current task—just fix those directly.

## Bead ID Naming

**See [bd/naming.md](bd/naming.md) for full conventions.**

Quick reference:

- Package-specific: `km-<scope>.<type>-<N>-<slug>` (e.g., `km-storage.bug-3-core-dump`)
- Cross-cutting: `km-<type>-<slug>` (e.g., `km-bug-watcher-race`)
- Subtasks: parent + `.a`, `.b`, `.c` (e.g., `km-storage.feat-1.a`)

Always check existing: `bd list --all | grep "km-<scope>"` to find next number.

## Modes

| Mode               | Use Case                                    |
| ------------------ | ------------------------------------------- |
| **report-only**    | Record for later; you have other priorities |
| **report-and-fix** | Outsource full fix to sub-agent             |
| **report-blocked** | Depends on another bead first               |

## Mode 1: Report Only

```typescript
Task({
  description: "Report issue: <brief>",
  prompt: `Report this issue as a bead. Do NOT fix.

## Issue
<what's broken, where, repro steps>

## Bead ID
1. Check existing: bd list --all | grep "km-<scope>"
2. Use pattern: km-<scope>.<type>-<N>-<slug> (e.g., km-storage.bug-3-sync-race)
3. For cross-cutting: km-<type>-<slug> (e.g., km-bug-test-flaky)

## Instructions
1. Search existing: bd list --all | grep -i "<keyword>"
2. If found: bd update <id> --priority P1
3. If not: bd create --id <id> --type bug --title "<title>" --description "<description>"
4. Report back the bead ID

Do NOT claim (no bd work). Do NOT fix.`,
  subagent_type: "general-purpose",
  model: "haiku",
})
```

## Mode 2: Report and Fix

```typescript
Task({
  description: "Fix issue: <brief>",
  prompt: `Report and fix this issue.

## Issue
<what's broken, where, repro steps>

## Bead ID
1. Check existing: bd list --all | grep "km-<scope>"
2. Use: km-<scope>.<type>-<N>-<slug> or km-<type>-<slug>

## Phase 1: Report
1. Search existing: bd list --all | grep -i "<keyword>"
2. If found: note ID
3. If not: bd create --id <id> --type bug --title "<title>" --description "<description>"

## Phase 2: Fix
1. bd work <id>
2. Read relevant files
3. Make minimal fix
4. Verify: <specific test command>

## Phase 3: Close
bd close <id>`,
  subagent_type: "general-purpose",
  run_in_background: true,
})
```

## Mode 3: Report as Blocked

```typescript
Task({
  description: "Report blocked issue: <brief>",
  prompt: `Report this issue as blocked by another bead.

## Issue
<what's broken>

## Blocked By
Bead: <blocker-id>
Reason: <why this can't proceed>

## Bead ID
Use: km-<scope>.<type>-<N>-<slug> or km-<type>-<slug>

## Instructions
1. Search existing: bd list --all | grep -i "<keyword>"
2. If not: bd create --id <id> --type bug --title "<title>" \
     --description "<description>" --deps "blocks:<blocker-id>"
3. Report back the bead ID

Do NOT claim or fix.`,
  subagent_type: "general-purpose",
  model: "haiku",
})
```

## Priority

| Priority | When                                    |
| -------- | --------------------------------------- |
| P0       | Blocks current work, breaks tests/build |
| P1       | Important but has workaround            |
| P2       | Nice to fix, not urgent                 |

## Example: TypeScript Errors in km-storage

```typescript
// Check existing beads first
// $ bd list --all | grep "km-storage"
// km-storage.bug-1  Fix watcher race condition
// km-storage.bug-2  Handle empty directories
// → Next ID: km-storage.bug-3

Task({
  description: "Report TS errors in km-storage",
  prompt: `Report TypeScript errors. Do NOT fix.

## Issue
bun typecheck shows errors:
- fake-repo.ts:10 - LoadError not exported
- fuzzer.ts:490 - Wrong argument count

Repro: bun typecheck 2>&1 | grep km-storage

## Bead ID
Use: km-storage.bug-3 (continues existing pattern)

## Instructions
1. bd list --all | grep -i "typescript"
2. If not found: bd create --id km-storage.bug-3 --type=bug --title="TypeScript errors in km-storage tests" --body="..."
3. bd update km-storage.bug-3 --priority P1
4. Report: km-storage.bug-3`,
  subagent_type: "general-purpose",
  model: "haiku",
})
```

## Parallel Issues

Spawn multiple agents in one message:

```typescript
Task({ description: "Fix issue A", ... })
Task({ description: "Fix issue B", ... })
Task({ description: "Report issue C", ... })
```
