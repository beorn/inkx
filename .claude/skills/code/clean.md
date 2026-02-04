---
description: Systematic code simplification and consistency review
argument-hint: [file-or-directory] [--dry-run]
---

## Usage

```bash
/code clean                           # Review recently modified files or prompt for scope
/code clean packages/km-storage       # Review all files in directory
/code clean src/watch/sync.ts         # Review single file
/code clean --dry-run                 # Analyze only, don't implement changes
/code clean packages/km-storage --dry-run  # Dry run on directory
```

**Arguments**: `[file-or-directory]` `[--dry-run]` (optional, defaults to recent files)

---

# Clean

Systematic simplification for **conciseness** and consistency.

## Core Principle

**Good refactoring reduces or maintains line count while improving clarity.**

If your changes add significant lines, you're probably over-engineering. The best refactorings make code shorter AND clearer. When those conflict, prefer clarity - but be skeptical of "clarity" that requires 50 extra lines.

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

### Alignment Patterns (from docs/principles.md)

| Pattern                | Replace With           | Example                                                          |
| ---------------------- | ---------------------- | ---------------------------------------------------------------- |
| `let` with mutation    | `const` with transform | `let x; x = f(x)` → `const x = f(initial)`                       |
| Manual field copying   | Spread                 | `{a: o.a, b: o.b}` → `{...defaults, ...overrides}`               |
| Mutating wrapper       | Composing wrapper      | `addHooks(obj)` mutates → `withHooks(obj)` returns new           |
| Misaligned names       | Aligned names          | `const rootPath` → `const path` (enables `{path}` shorthand)     |
| Inline complex expr    | Named helper           | `x ? (a && b) : (c \|\| d)` → `const result = computeResult(x)`  |
| Mixed visual weight    | Uniform weight         | 20-line method + one-liners → extract all to same level          |
| `ensure*` checks       | Delete                 | `ensureOpen()` → let lower layer throw naturally                 |
| Getters/setters        | Plain properties       | `get path() { return _path }` → `path` property                  |
| Pure delegators        | Direct call            | `f(x) { return g(x) }` → call `g(x)` directly                    |
| Wrapper types          | Delete                 | `interface XDeps { db: Database }` → use inline or infer         |

### Narrative Flow

- **Top**: Main export (the "what")
- **Middle**: Implementation details
- **Bottom**: Helper functions, constants, types
- Group related code; separate with section comments if large

### Consistency Checks

- Match patterns in sibling files
- Follow design docs (e.g., @docs/ref/ui.md for TUI)
- Use established utilities (check imports in similar files)
- Preserve public API (exports, function signatures)

### Logging Standards

Check for incorrect logging patterns:

| Pattern | Replace With | Exception |
|---------|--------------|-----------|
| `console.log/debug/info/warn` | `@beorn/logger` | CLI user output in `apps/km-cli/src/commands/*` |
| `console.error` | `log.error()` | CLI error messages, crash handlers |
| `import debug from 'debug'` | `@beorn/logger` | None - always migrate |
| Direct `process.stdout.write` | Keep as-is | For raw terminal output (progress bars, etc.) |

**Quick check**: `grep -r "console\." --include="*.ts" packages/ apps/km-tui/src/`

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
4. Run targeted tests on changed files

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

- **Add lines to reduce complexity scores** - if refactoring adds 50+ lines, stop
- **Extract helpers for single-use code** - 3 similar lines is fine, don't create a function
- **Create abstractions "for future flexibility"** - solve today's problem only
- **Add type complexity that hurts readability** - inference is usually enough
- **Remove comments that explain "why"** - keep the narrative
- **Change behavior while simplifying** - refactor ≠ rewrite

**The test**: After refactoring, is the code shorter or the same length? If not, reconsider.

## Related

For major refactoring projects, see [/docs/lessons/refactoring.md](/docs/lessons/refactoring.md).

**Keywords**: clean, simplify, cleanup, refactor, consistency
