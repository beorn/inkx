---
description: "Audit and fix package health — metadata, licensing, gitignore, docs, CI. Use when creating packages, publishing, or auditing repos."
argument-hint: "[<path>...]"
allowed-tools: Bash, Read, Glob, Grep, Agent, AskUserQuestion, Edit, Write
---

# Repo Health

**Keywords**: repo health, package health, publish, npm, gitignore, license, metadata, homepage, docs site, github pages, new repo, new package, release prep

Audit and fix package/repo organization issues: missing LICENSE files, tracked build artifacts, incomplete .gitignore, inconsistent package.json metadata, dead docs links, wrong homepage URLs, missing lockfiles. Produces a severity-ranked report and applies fixes with user approval.

## Quick Actions

| Command | Purpose |
|---------|---------|
| `/repo-health <path>` | Full audit + fix of a package directory |
| `/repo-health <path1> <path2> ...` | Audit multiple packages |
| `/repo-health --report-only <path>` | Report without applying fixes |

## Target

**Argument**: $ARGUMENTS

Default target: current working directory. If paths are given, audit each directory. For monorepo vendor packages, pass multiple paths: `/repo-health vendor/silvery vendor/swatch vendor/flexily`.

## Phase 1: Scan

Run all checks **in parallel** across specified paths. For each package, check everything in `checklist.md`. Use subagents for parallelism when auditing 3+ packages.

### Per-package checks (all parallel):

1. **LICENSE** — file exists, matches `package.json` license field
2. **Tracked artifacts** — `git ls-files dist/ coverage/ *.tgz docs/.vitepress/dist docs/.vitepress/cache` should be empty
3. **.gitignore completeness** — compare against template in `templates.md`
4. **package.json metadata** — name, description, keywords, homepage, bugs, repository, author, license all present and correct
5. **Lockfile** — `bun.lock` (text format) exists if package has dependencies
6. **Homepage URL** — matches actual deployed site (check CNAME, GitHub Pages settings)
7. **README quality** — has description, install, quick start, license section
8. **CI/docs workflow** — if VitePress docs exist, deploy workflow exists and GitHub Pages enabled
9. **No secrets** — no .env, credentials, API keys in tracked files

## Phase 2: Report

Present findings as a severity-ranked table:

```
## Repo Health Report: <package-name>

| Sev | Issue | Details |
|-----|-------|---------|
| CRIT | Missing LICENSE | No LICENSE file found |
| STD | Incomplete .gitignore | Missing: docs/.vitepress/dist, *.tgz |
| LOW | No CHANGELOG.md | Consider adding for release history |
```

Severity levels:
- **CRIT** — blocks publishing, legal risk, or data leak
- **STD** — professional quality gap
- **LOW** — consistency improvement

If `--report-only` was specified, stop here.

## Phase 3: Fix

Apply fixes grouped by severity (critical first). For each fix:

1. Show what will change
2. Apply the fix
3. Verify (e.g., `git ls-files dist/` is empty after untracking)

### Fix patterns by issue type:

**Missing LICENSE**: Copy MIT template from `templates.md`, fill in year and author from package.json or git log.

**Tracked build artifacts**:
```bash
git rm -r --cached dist/ docs/.vitepress/dist docs/.vitepress/cache 2>/dev/null
# Then add to .gitignore
```

**Incomplete .gitignore**: Merge missing entries from template, preserving existing custom entries.

**package.json metadata**: Fill missing fields. Derive homepage from repository URL. Set bugs URL from repository URL.

**Missing lockfile**: Run `bun install` to generate `bun.lock`.

**Wrong homepage URL**: Update package.json, README badges, and CNAME to be consistent.

## Phase 4: Summary

After fixes, re-run the scan to confirm all issues resolved. Report final status:

```
## Results

- <package>: 5 issues found, 5 fixed, 0 remaining
- <package>: clean (no issues)
```

## Reference

- [checklist.md](checklist.md) — full checklist with severity levels and fix patterns
- [templates.md](templates.md) — standard file templates (.gitignore, deploy-docs.yml, LICENSE)
