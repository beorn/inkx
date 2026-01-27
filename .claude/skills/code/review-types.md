---
description: Type safety review - catch bugs, reduce boilerplate, propagate patterns
argument-hint: [scope] (file path, package name, or blank for full scan)
allowed-tools: Task, Read, Glob, Grep, Bash, TodoWrite, AskUserQuestion, Edit
---

## Usage

```bash
/code types                        # Review entire codebase for type issues
/code types packages/km-storage    # Review specific package
/code types src/watch/sync.ts      # Review single file
```

**Arguments**: `[scope]` - file path, package name, or blank for full scan (defaults to full codebase)

---

# Type Safety Review

Find type issues, fix quick wins, track larger refactors.

**Scope**: $ARGUMENTS → file/package path, or blank for full codebase

**Decision rule**: Every change must catch a real bug OR reduce boilerplate. Otherwise skip.

**Related**: `/review-code` (architecture), `/review-tests` (test suite)

---

## What to Find

### Safety Issues (bugs hiding in types)

| Pattern                   | Fix                                |
| ------------------------- | ---------------------------------- |
| `any` in signature        | Narrow to specific type or generic |
| `as X` after JSON/fetch   | Type guard + runtime validation    |
| `x!.prop` non-null        | Guard clause or restructure        |
| `catch (e) { e.message }` | `if (e instanceof Error)`          |
| switch without exhaustive | `default: assertNever(x)`          |

**OK to skip**: FFI, JSON.parse with immediate validation, documented perf hack

### Ergonomic Wins (less code, same safety)

| Pattern                            | Fix                |
| ---------------------------------- | ------------------ |
| `const x: T = expr` (T inferrable) | Remove `: T`       |
| Explicit return type = inferred    | Remove return type |
| Object literal needing validation  | Use `satisfies`    |
| Repeated inline type               | Extract type alias |

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

## Follow-up: Create Beads

If larger refactors identified, track in beads:

```bash
DATE_SUFFIX=$(date +%m%d)

# Create review bead with findings
bd create --id "km-rev-types-$DATE_SUFFIX" --type=task --priority=2 \
  --title="Type safety review findings" --body-file /tmp/review.md

# Child beads for each refactor
bd create --id "km-rev-types-$DATE_SUFFIX.a" --title="<finding 1>" \
  --type=task --parent "km-rev-types-$DATE_SUFFIX"
```

---

## Retrospective: Type System Learnings

After completing type safety review and fixes, analyze patterns for future improvements.

### 1. Pattern Recognition

Review type issues found to identify recurring themes:

**Key questions:**

- Which type safety issues were most common? (`any`, casts, non-null assertions, etc.)
- Were issues clustered in specific areas (FFI boundaries, error handling, legacy code)?
- Did ergonomic issues suggest missing type utilities or patterns?
- Were multiple type issues symptoms of a deeper design problem?

### 2. Root Cause Analysis

For each pattern, identify why it occurred:

| Pattern Example           | Root Cause Hypothesis          | Evidence/Context                     |
| ------------------------- | ------------------------------ | ------------------------------------ |
| Many `any` in one file    | FFI boundary without wrapper   | File deals with external API         |
| `as` casts without guards | Trusting upstream without test | No validation after JSON.parse       |
| Non-null assertions       | Control flow not provable      | TypeScript can't infer preconditions |
| Explicit return types     | Auto-generated code            | Pattern seen in migration scripts    |
| Repeated inline types     | Missing shared type definition | Same shape in 5+ places              |

### 3. Process Improvements

Propose concrete improvements based on root causes:

**Type infrastructure:**

- Add runtime validation helpers (e.g., type guards for common patterns)
- Create type utilities for repeated patterns (e.g., `DeepReadonly<T>`)
- Document type patterns in docs/ (e.g., discriminated unions, branded types)
- Add examples showing `satisfies` vs `as` vs explicit types

**Tooling enhancements:**

- Add ESLint rules for type safety (e.g., `no-explicit-any` in production code)
- Enable stricter TypeScript checks incrementally (e.g., `strictNullChecks`)
- Add type coverage to CI (e.g., require 90%+ type coverage)
- Create shared type definitions package to reduce duplication

**Documentation:**

- Document FFI boundary patterns (how to wrap external APIs safely)
- Add error handling type patterns (discriminated unions for Result types)
- Show before/after examples for common type improvements
- Create "Type Safety Checklist" for new code

### 4. Self-Assessment

Evaluate review effectiveness:

| Dimension        | Assessment                                         |
| ---------------- | -------------------------------------------------- |
| Bug detection    | Did we find real bugs hiding in types?             |
| Ergonomic impact | Did fixes reduce code size or improve readability? |
| Coverage         | Did we check all critical paths and boundaries?    |
| Actionability    | Were findings concrete and fixable?                |
| Type-check speed | Did changes affect compilation time?               |
| False positives  | How many "issues" were intentional design choices? |

### 5. Create Process Improvement Beads (Optional)

For significant gaps identified:

```bash
DATE_SUFFIX=$(date +%m%d)

# Example: Missing type infrastructure
bd create --id "km-proc-types-utils-$DATE_SUFFIX" --type=task --priority=3 \
  --title="Create type utilities package" \
  --body="Review found repeated inline types. Add shared utilities for common patterns."

# Example: Documentation gap
bd create --id "km-proc-types-docs-$DATE_SUFFIX" --type=task --priority=3 \
  --title="Document type safety patterns" \
  --body="Add FFI boundary examples, Result type patterns, and type guard recipes to docs/"

# Example: Tooling improvement
bd create --id "km-proc-type-coverage-$DATE_SUFFIX" --type=task --priority=3 \
  --title="Add type-coverage to CI" \
  --body="Enforce 90%+ type coverage to prevent regression"
```

### 6. Update Type Review Workflow

If the review revealed gaps in this review process itself, consider updating [review-types.md](review-types.md):

**New safety patterns to detect:**

- Example: "Unchecked array access (should use .at() or bounds check)"
- Example: "Promise rejection without typed catch (should use typed error)"

**Ergonomic patterns to add:**

- Example: "Type parameters that match defaults (can be inferred)"
- Example: "`Record<string, X>` that should be `Map<string, X>` for iteration"

**Workflow improvements:**

- Example: "Check inference in both directions: param → return and return → param"
- Example: "Add automated check for type complexity (deeply nested generics)"

Make edits directly to this file or create a process improvement bead.

**This creates a continuous learning loop for type system mastery.**

---

## Execute

Run automated checks first, then launch 2 survey agents in parallel.
