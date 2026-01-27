---
description: Systematic code simplification and consistency review
argument-hint: [file-or-directory] [--dry-run]
---

# Refactor for Simplicity

Systematic review and refactoring for simplicity, conciseness, and consistency.

## Target

$ARGUMENTS

If no target specified, review recently modified files or prompt for scope.

Options:

- `--dry-run`: Analyze only, don't implement changes
- Directory path: Review all files in directory
- File path: Review single file

## Phase 1: Analysis

Use the Task tool with subagent_type=Explore to analyze files in parallel when reviewing a directory.

Catalog opportunities in these categories:

### Simplification Patterns

| Pattern                | Replace With      | Example                                                             |
| ---------------------- | ----------------- | ------------------------------------------------------------------- |
| Switch on value        | Lookup object     | `switch(x){case 'a': return 1}` → `{a:1}[x] ?? default`             |
| Multi-condition if     | Set.has()         | `if(x==='a'\|\|x==='b')` → `new Set(['a','b']).has(x)`              |
| IIFE for derivation    | Direct expression | `const x = (() => {...})()` → ternary chain or named helper         |
| Repeated regex matches | Extract helper    | 4x identical `while(match.exec())` → `extractMatches(str, pattern)` |
| Large destructure      | Dot notation      | `const {a,b,c,d,e,f} = obj` → use `obj.prop` throughout             |
| Verbose conditionals   | Early returns     | Nested if/else → guard clauses at top                               |

### Narrative Flow

- **Top**: Main export (the "what")
- **Middle**: Implementation details
- **Bottom**: Helper functions, constants, types
- Group related code; separate with section comments if large

### Consistency Checks

- Match patterns in sibling files
- Follow design docs (e.g., @docs/08-ui.md for TUI)
- Use established utilities (check imports in similar files)
- Preserve public API (exports, function signatures)

## Phase 2: Present Findings

Summarize with impact assessment:

```markdown
## Analysis: [directory/file]

### Implement (high value)

- **file.ts:30-70**: Switch → lookup object (saves 35 lines)
- **file.ts:120**: Extract shared scroll calc (DRY across 3 files)

### Implement (medium value)

- **file.ts:200**: Simplify nested ternary (clearer intent)

### Skip (low value / risk)

- **file.ts:50**: Minor, saves 2 lines
- **file.ts:180**: Would change export signature
```

**Stop here if `--dry-run`**. Otherwise, ask for confirmation before Phase 3.

## Phase 3: Implementation

1. Create todo list with TodoWrite for tracking
2. Apply one logical change at a time
3. After each file: verify no type errors (IDE diagnostics)
4. Run `bun run test:fast` periodically (every 2-3 files)

### Preserving API

- Keep function signatures unchanged unless explicitly refactoring API
- Re-export moved utilities from original location if needed
- Update imports in consuming files

## Phase 4: Verification

```bash
bun fix            # Lint + format (must pass)
bun run test:fast  # Fast tests (must pass)
```

If all tests pass, summarize changes:

- Files modified: N
- Lines removed: ~X
- Patterns applied: [list]

## Anti-Patterns (Do NOT)

- Extract helpers for single-use code (3 similar lines is fine)
- Create abstractions "for future flexibility"
- Add type complexity that hurts readability
- Remove comments that explain "why" (keep the narrative)
- Change behavior while simplifying (refactor ≠ rewrite)

**Keywords**: refactor, simplify, cleanup, clean up, code review, consistency, refactoring, simplification
