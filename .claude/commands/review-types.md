---
description: Type safety review - catch bugs, reduce boilerplate, propagate patterns
argument-hint: [scope] (file path, package name, or blank for full scan)
allowed-tools: Task, Read, Glob, Grep, Bash, TodoWrite, AskUserQuestion, Edit
---

# Type Safety Review

Find type issues, fix quick wins, track larger refactors.

**Scope**: $ARGUMENTS → file/package path, or blank for full codebase

**Decision rule**: Every change must catch a real bug OR reduce boilerplate. Otherwise skip.

---

## What to Find

### Safety Issues (bugs hiding in types)

| Pattern | Fix |
|---------|-----|
| `any` in signature | Narrow to specific type or generic |
| `as X` after JSON/fetch | Type guard + runtime validation |
| `x!.prop` non-null | Guard clause or restructure |
| `catch (e) { e.message }` | `if (e instanceof Error)` |
| switch without exhaustive | `default: assertNever(x)` |

**OK to skip**: FFI, JSON.parse with immediate validation, documented perf hack

### Ergonomic Wins (less code, same safety)

| Pattern | Fix |
|---------|-----|
| `const x: T = expr` (T inferrable) | Remove `: T` |
| Explicit return type = inferred | Remove return type |
| Object literal needing validation | Use `satisfies` |
| Repeated inline type | Extract type alias |

**km models**: [vault.ts](packages/km-storage/src/vault.ts) (factory inference), [watch/types.ts](packages/km-storage/src/watch/types.ts) (discriminated unions)

---

## Workflow

### 1. Run Automated Checks First

```bash
# Type coverage baseline
bunx type-coverage --detail --at-least 90

# ESLint type-aware rules (temporarily enable strict rules)
bun eslint --rule '@typescript-eslint/no-unsafe-assignment: error' \
           --rule '@typescript-eslint/no-unsafe-return: error' \
           packages/ apps/ 2>&1 | head -50

# Find explicit any (should be 0 outside tests)
grep -rE ": any\b" packages/ apps/ --include="*.ts" | grep -v test | grep -v ".d.ts" | wc -l
```

### 2. Survey (2 agents)

**Agent 1 - Safety**:
"Find type safety issues in km packages/apps (not tests): (1) `any` in function params/returns, (2) `as X` casts without nearby validation, (3) `!.` non-null assertions, (4) switch on `type` field without exhaustive check. Report file:line with context."

**Agent 2 - Ergonomics**:
"Find unnecessary type annotations in km: (1) explicit return types matching inference, (2) `const x: Type =` where Type is obvious, (3) places where `satisfies` beats `as`. Packages first, then apps. Report file:line."

### 3. Filter & Categorize

- **Quick win**: Single-file, mechanical, no behavior change
- **Refactor**: Multi-file or needs design decision

### 4. Present

```markdown
## Type Safety: [scope]

### Automated Check Results
- Type coverage: X% (target: 90%)
- ESLint unsafe violations: N
- Explicit any count: N

### Manual Findings
#### Safety Issues
- [file:line](path#Lnn) - Description

#### Ergonomic Wins
- [file:line](path#Lnn) - Description

### Quick Wins
1. ...

### Larger Refactors
1. ...
```

AskUserQuestion: "Fix quick wins now?"

### 5. Fix (if yes)

1. TodoWrite with items
2. Fix one file at a time
3. After each: `bun tsc --noEmit`
4. After all: `bun run test:fast`

---

## Execute

Run automated checks first, then launch 2 survey agents in parallel.
