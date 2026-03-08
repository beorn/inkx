---
description: "Systematic project root cleanup — tracked artifacts, gitignore gaps, file organization. Use when a package root is cluttered or has tracked build/test artifacts."
argument-hint: "[<path>]"
allowed-tools: Bash, Read, Glob, Grep, Agent, AskUserQuestion, Edit, Write
---

# Project Cleanup

**Keywords**: cleanup, declutter, root, gitignore, artifacts, organize, tracked files

Systematic cleanup of project roots. Removes tracked artifacts, fills gitignore gaps, consolidates scattered files, and flags redundant documentation. Produces a structured report and executes changes with verification.

## Quick Actions

| Command | Purpose |
|---------|---------|
| `/project-cleanup <path>` | Full cleanup of a package directory |
| `/project-cleanup --deep <path>` | Include git history analysis (large blobs, tracked-but-ignored) |
| `/project-cleanup --report-only <path>` | Report without execution |

## Target

**Argument**: $ARGUMENTS

Default target: current working directory. If a path is given, clean up that directory.

## Phase 1: Reconnaissance

Gather the full picture before proposing changes. Run these scans **in parallel**:

### 1A: Root Census

Count and classify every item in the project root:

```bash
ls -1A <path>  # All root items including dotfiles
```

Classify each item into one of:

| Classification | Meaning | Examples |
|---|---|---|
| **ESSENTIAL** | Core project files, cannot move | `src/`, `package.json`, `tsconfig.json`, `README.md` |
| **STANDARD** | Normal config files, expected at root | `.gitignore`, `vitest.config.ts`, `CLAUDE.md`, `LICENSE` |
| **MOVABLE** | Belongs in a subdirectory | `benchmarks/` → `tests/benchmarks/`, `CONTRIBUTING.md` → `docs/` |
| **DELETABLE** | Tracked artifact or obsolete file | `.playwright-cli/`, `editset.json`, build output |
| **FLAG** | Needs human decision | Ambiguous files, potential WIP |

Count total root items. Score against [patterns.md](patterns.md) thresholds.

### 1B: Tracked Artifact Scan

Cross-reference `git ls-files` against known artifact patterns from [heuristics.md](heuristics.md):

```bash
git ls-files <path> | head -500
```

Flag any tracked file matching artifact patterns (build output, test artifacts, editor state, cache files, generated content). Group by category for the report.

### 1C: Gitignore Completeness

Read the project's `.gitignore` and compare against expected patterns for the project type (from [patterns.md](patterns.md)):

```bash
cat <path>/.gitignore
```

Identify missing patterns. Check parent `.gitignore` files too — patterns may be inherited.

### 1D: File Organization

Scan for structural issues:
- **Scattered tests**: test files outside `tests/` or `__tests__/`
- **Scattered benchmarks**: benchmark files at root or in multiple dirs
- **Scattered scripts**: utility scripts at root instead of `scripts/`
- **Empty directories**: dirs with no files
- **Single-file directories**: dirs containing only one file (candidate for flattening)
- **Deeply nested single-child paths**: `a/b/c/file.ts` where each dir has one child

### 1E: Documentation Redundancy

Flag documentation issues:
- `AGENTS.md` that duplicates `CLAUDE.md` content (>70% overlap = merge candidate)
- `CONTRIBUTING.md` at root when a `docs/` dir exists (move candidate)
- `CNAME` at root instead of in site/docs build dir
- Multiple README-like files covering the same ground
- Docs referencing removed/renamed APIs

### 1F: Git History Analysis (--deep only)

Only when `--deep` flag is present:

```bash
git rev-list --objects --all -- <path> | git cat-file --batch-check='%(objecttype) %(objectsize) %(rest)' | awk '/^blob/ {print $2, $3}' | sort -rn | head -20
```

- Large blobs (>1MB) that shouldn't be in history
- Files that are `.gitignore`d but still tracked (`git ls-files -i --exclude-standard`)
- Files deleted from tree but taking significant history space

## Phase 2: Analysis

Synthesize reconnaissance into classified findings.

### Severity Levels

| Severity | Criteria | Example |
|---|---|---|
| **Critical** | Tracked artifacts actively inflating repo, secrets, large binaries | 10MB+ tracked build output, `.env` with real credentials |
| **Standard** | Clutter, missing gitignore patterns, movable files | `benchmarks/` at root, missing `*.log` in gitignore |
| **Low** | Minor organization, cosmetic | Single-file dir, empty dir, minor naming |

### Cross-Reference Pre-Check

**Before proposing any MOVE operation**, verify cross-references won't break:

For each file proposed for moving, search for references:

```
Grep pattern="<filename>" path="<project>" glob="*.{ts,tsx,js,json,md,yml,yaml}"
```

Check:
- Import paths in source code
- Script paths in `package.json`
- Config references in `tsconfig.json`, `vitest.config.*`, `playwright.config.*`
- Documentation links in `*.md` files
- CI workflow references in `.github/`
- `.gitignore` patterns that reference the path

Record which references need updating alongside each MOVE proposal.

## Phase 3: Report

Present findings as a structured report. Use `AskUserQuestion` to get approval before execution.

```markdown
# Project Cleanup: <package-name>

## Root Census
| # | Item | Classification | Action |
|---|------|---------------|--------|
| 1 | src/ | ESSENTIAL | keep |
| 2 | .playwright-cli/ | DELETABLE | rm (tracked artifact) |
| ...

**Score**: N root items (target: M for this project type)

## Findings by Severity

### Critical (N)
| # | Issue | Category | Files | Action |
|---|-------|----------|-------|--------|

### Standard (N)
| # | Issue | Category | Files | Action |
|---|-------|----------|-------|--------|

### Low (N)
| # | Issue | Category | Files | Action |
|---|-------|----------|-------|--------|

## Proposed .gitignore Additions
```gitignore
# <category>
pattern1
pattern2
```

## Execution Plan
1. Update .gitignore (safe, no-op on existing files)
2. Remove tracked artifacts (git rm)
3. Move files (git mv + update cross-refs)
4. Delete redundant files (git rm)
5. Verify (typecheck + tests + doc links)
6. Commit (one per logical group)
```

## Phase 4: Execution

After user approval, execute in this order:

### Step 1: Gitignore additions

```bash
# Edit .gitignore — safe, doesn't affect existing tracked files
```

### Step 2: Remove tracked artifacts

```bash
git rm -r --cached <paths>  # Untrack but keep on disk if gitignored
# Or: git rm -r <paths>     # Delete entirely if truly unwanted
```

### Step 3: Move files

```bash
git mv <source> <destination>
# Then update all cross-references found in Phase 2
```

### Step 4: Delete redundant files

```bash
git rm <paths>
```

### Step 5: Verify

```bash
# Typecheck (if applicable)
bun tsc --noEmit 2>&1 | head -20

# Tests
bun vitest run <path>/tests/ 2>&1 | tail -20

# Doc link check
grep -r '](.*<moved-file>' <path>/**/*.md
```

### Step 6: Commit

One commit per logical group for clean history:
- `chore(<pkg>): update .gitignore for <categories>`
- `chore(<pkg>): remove tracked artifacts (<categories>)`
- `chore(<pkg>): reorganize <what> into <where>`
- `chore(<pkg>): remove redundant <files>`

Or a single commit if changes are small:
- `chore(<pkg>): clean up root (artifacts, gitignore, reorganize)`

## Anti-Patterns

- **Moving files without checking cross-references**: Every move can break imports, configs, and doc links. Always search first.
- **Deleting without understanding**: A file that looks like an artifact might be intentionally committed (e.g., `dist/` for type declarations). Check `package.json` `files` field and README.
- **Batch-committing everything**: Separate artifact removal from file moves from gitignore changes. Makes revert granular.
- **Skipping verification**: Always run tests after moves. Import paths break silently.
- **Ignoring parent .gitignore**: Patterns may be inherited from a parent repo's gitignore. Don't duplicate them.

## Sub-Skills

| File | Purpose |
|------|---------|
| [heuristics.md](heuristics.md) | Detection rules by category (artifact patterns, move destinations) |
| [patterns.md](patterns.md) | Ideal root layouts by project type, cross-reference checklist |
