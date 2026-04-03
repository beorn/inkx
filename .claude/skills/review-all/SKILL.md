---
description: "Comprehensive health check SOP — modular checklist across code, tests, security, infra, project health, backlog, content, and legal. Run all or pick sections."
argument-hint: "[section] [--skip=seo] [--sites=silvery.dev] [--budget=free|normal|full]"
---

# Review-All — Health Check SOP

**Keywords**: review all, full review, health check, quarterly audit, SOP, checklist

A modular standard operating procedure for verifying everything is in good shape. Like a pilot's pre-flight checklist — organized by area, each section self-contained.

Run all sections for a complete health check, or specify a section for a focused review.

## Usage

```
/review-all              # Full check — all sections in order
/review-all code         # Just the code quality section
/review-all code,tests   # Multiple sections
/review-all --skip=seo   # Everything except SEO
/review-all --budget=free # Skip paid external reviews
```

## How It Works

1. Parse `$ARGUMENTS` for section names, `--skip`, `--sites`, `--budget`
2. For each section: run the checks, record pass/fail, note failures
3. At the end: summary dashboard with per-section status

**Parallelization**: Independent sections can run as parallel Agent sub-agents (following `/max` Option A). Group into waves:
- Wave 1: pre-flight, code, tests, security, infra (engineering core)
- Wave 2: project, backlog, content, legal (health & hygiene)
- Wave 3: external (paid, optional)

**Read-only rule**: Agents MUST NOT edit files, fix issues, publish, or activate fix/improve flows. This is assessment only. Fixes come after.

**Reports**: Write per-section findings to `.claude/reports/review-all-YYYY-MM-DD.md`. Never to project root.

---

## Section 1: Pre-flight

Quick sanity check — is the workspace ready for review?

### Checks

- [ ] **Git clean**: No uncommitted changes that would confuse other checks
  ```bash
  git status --porcelain | head -20
  ```
- [ ] **Tests pass**: Fast suite green
  ```bash
  bun run test:fast 2>&1 | tail -5
  ```
- [ ] **Lint clean**: No formatting/lint errors
  ```bash
  bun fix 2>&1 | tail -10
  ```
- [ ] **No stale locks**: No `.git/index.lock` or other lock files

### Pass/fail

- PASS: All green, workspace clean
- WARN: Uncommitted changes present (review may see stale state)
- FAIL: Tests or lint failing (fix before proceeding — review results would be noisy)

### If it fails

Fix tests/lint first. Stash or commit uncommitted work. Then re-run.

---

## Section 2: Code Quality

Is the code well-designed, maintainable, and free of architectural issues?

### Checks

- [ ] **Architecture**: Layer violations (UI touching filesystem, cross-layer imports)
  - Delegate to: `.claude/skills/code/quality.md`
- [ ] **Complexity**: Hotspots — files >500 lines, functions >50 lines, deep nesting
  - Delegate to: `.claude/skills/code/complexity.md`
- [ ] **Type safety**: Any `any` types, missing return types on public APIs, unsafe casts
  - Delegate to: `.claude/skills/code/review-types.md`
- [ ] **Design opportunities**: Over-engineering, unnecessary abstractions, things that could be dramatically simpler
  - Delegate to: `.claude/skills/code/quality.md` (report mode only — don't fix)
- [ ] **Gravity wells**: Files that keep growing and touch everything (check `board-actions.ts`, `sync.ts`)

### Pass/fail

- PASS: No layer violations, no >500 line hotspots, types clean
- WARN: Minor complexity hotspots, a few `any` types
- FAIL: Layer violations, fundamental design issues

### If it fails

Create beads for architectural issues. Quick-fix type issues inline.

---

## Section 3: Test Health

Are we testing what matters? Are tests fast, reliable, and well-structured?

### Checks

- [ ] **Coverage gaps**: Packages with few/no tests
  ```bash
  # Count test files per package
  for d in apps/km-tui apps/km-cli packages/km-*; do
    echo "$d: $(find $d/tests -name '*.test.ts' 2>/dev/null | wc -l) tests"
  done
  ```
- [ ] **Test quality**: Are tests checking behavior or implementation details?
  - Delegate to: `.claude/skills/tests/SKILL.md` (review mode)
- [ ] **Slow tests**: Any tests >5s? Are they in the `slow` project?
- [ ] **Flaky tests**: Any intermittent failures in recent CI runs?
- [ ] **Structure alignment**: Do test files mirror source structure?

### Pass/fail

- PASS: Good coverage, fast suite, no flaky tests, structure aligned
- WARN: Minor gaps, a few slow tests
- FAIL: Major coverage gaps, flaky tests, broken test infrastructure

### If it fails

Create beads for coverage gaps. Move slow tests to the `slow` project.

---

## Section 4: Security

Are we safe from secrets exposure, vulnerable deps, and CI/CD risks?

### Checks

- [ ] **Secrets in code**: No API keys, tokens, passwords in tracked files
  ```bash
  grep -rn "sk-\|PRIVATE_KEY\|password.*=.*['\"]" --include='*.ts' --include='*.json' | grep -v node_modules | grep -v '.test.' | head -20
  ```
- [ ] **Secrets in history**: No accidentally committed credentials
  ```bash
  git log --all --diff-filter=D --name-only -- '*.env' '*.pem' '*credentials*' | head -10
  ```
- [ ] **Dependency vulnerabilities**: Check for known CVEs
  ```bash
  bun audit 2>&1 | head -30   # or: bun pm audit
  ```
- [ ] **Outdated deps**: Major version behind on security-relevant packages
- [ ] **CI pipeline security**: No secrets in plain text workflow files
  - Delegate to: CSO skill if available (`~/.claude/skills/cso/SKILL.md` or `.claude/skills/cso/SKILL.md`)

### Pass/fail

- PASS: No secrets, deps current, CI locked down
- WARN: Some deps behind (no known CVEs)
- FAIL: Exposed secrets or known vulnerabilities — fix immediately

### If it fails

Rotate exposed secrets. Update vulnerable deps. This is P0.

---

## Section 5: Infrastructure

Is the plumbing working? CI green, hooks functional, databases healthy?

### Checks

- [ ] **CI pipelines**: All repos green
  ```bash
  for repo in km silvery flexily termless bearly loggily mdspec terminfo.dev; do
    echo -n "$repo: "; gh run list -R beorn/$repo -L 1 --json conclusion -q '.[0].conclusion'
  done
  ```
- [ ] **Git hooks**: Pre-commit and pre-push hooks installed and working
  ```bash
  ls -la .git/hooks/pre-{commit,push} 2>/dev/null
  ```
- [ ] **Database health**: SQLite WAL mode, no corruption
  ```bash
  sqlite3 .km/state.db "PRAGMA integrity_check" 2>/dev/null
  ```
- [ ] **Tribe health**: Daemon running, plugins active
  ```bash
  bun tribe health 2>/dev/null | head -10
  ```
- [ ] **Build system**: Vitest config correct, Bun version current

### Pass/fail

- PASS: All CI green, hooks working, infra clean
- WARN: Minor CI warnings, all functional
- FAIL: CI failures or broken infrastructure

### If it fails

Delegate to: `.claude/skills/infra/SKILL.md` for diagnosis and fixes.

---

## Section 6: Project Health

Is the house in order? Docs fresh, packages healthy, naming consistent?

### Checks

- [ ] **DRY violations**: Copy-pasted code across packages
  - Delegate to: `.claude/skills/project-audit/SKILL.md`
- [ ] **Doc freshness**: READMEs and CLAUDE.md files match current code
- [ ] **Package metadata**: All vendor packages have LICENSE, proper package.json fields
  - Delegate to: `.claude/skills/repo-health/SKILL.md` on each vendor dir
- [ ] **File organization**: No stale artifacts in root, gitignore complete
  - Delegate to: `.claude/skills/project-cleanup/SKILL.md` (report mode)
- [ ] **Naming consistency**: Consistent conventions across packages

### Pass/fail

- PASS: Clean structure, current docs, all packages healthy
- WARN: Minor doc staleness or metadata gaps
- FAIL: Significant structural issues or widespread doc rot

### If it fails

Create beads for doc updates. Fix metadata inline if quick.

---

## Section 7: Backlog Hygiene

Is the plan clean? No duplicates, stale items, or priority drift?

### Checks

- [ ] **Duplicate beads**: Same issue tracked twice
  ```bash
  bd search "" | head -50  # Scan for similar titles
  ```
- [ ] **Stale items**: Open beads with no activity in 30+ days (excluding P4 roadmap items)
  ```bash
  bd stale
  ```
- [ ] **Priority drift**: P0/P1 items that have sat unworked
  ```bash
  bd list --status=open --priority=0,1
  ```
- [ ] **Orphaned dependencies**: Broken dep chains
  ```bash
  bd orphans
  ```
- [ ] **Convention health**: IDs follow `km-<scope>.<slug>` format
  ```bash
  bd doctor --check=conventions
  ```

### Pass/fail

- PASS: Clean backlog, no duplicates, accurate priorities
- WARN: Minor grooming needed
- FAIL: Significant backlog debt

### If it fails

Delegate to: `.claude/skills/pm/workflows/review.md` for full grooming.

---

## Section 8: Content & SEO

Is the public face good? Sites healthy, content fresh, SEO working?

Default sites: silvery.dev, termless.dev, terminfo.dev (override with `--sites=`)

### Checks

- [ ] **Content freshness**: All benchmark articles tested within 3 months
  - Delegate to: `.claude/skills/marketing/workflows/audit.md`
- [ ] **Enrichment health**: Glossary auto-linking working, no broken terms
  ```bash
  cd vendor/silvery && bun run docs:build 2>&1 | grep '\[glossary\]' | tail -5
  ```
- [ ] **SEO basics** (per site):
  - Sitemap exists and is current
  - robots.txt allows crawling
  - Canonical URLs set
  - JSON-LD schemas valid
  - Meta descriptions unique
- [ ] **Broken links**: Internal and external links working
- [ ] **OG images**: Social preview images set for key pages

### Pass/fail

- PASS: Content fresh, SEO healthy, no broken links
- WARN: Minor freshness issues
- FAIL: Broken sitemaps, crawl errors, significant content rot

### If it fails

Delegate to: `.claude/skills/marketing/SKILL.md` for content coordination.

---

## Section 9: Legal & Compliance

Are we compliant? Licenses compatible, privacy covered?

### Checks

- [ ] **License files**: Every published package has a LICENSE file
  ```bash
  for d in vendor/*/; do
    [ -f "$d/LICENSE" ] || echo "MISSING: $d"
  done
  ```
- [ ] **License compatibility**: No GPL deps in MIT packages
  - Delegate to: `.claude/skills/marketing/workflows/legal.md`
- [ ] **Privacy**: Public sites have privacy policy if collecting analytics
- [ ] **Attribution**: Third-party content properly attributed

### Pass/fail

- PASS: All licenses correct, deps compatible, privacy covered
- WARN: Minor attribution gaps
- FAIL: Incompatible licenses or missing privacy policy

### If it fails

Fix license issues immediately — these block releases.

---

## Section 10: External Validation (optional)

What did we miss? Get an outside perspective.

**Cost**: ~$5-15 | **Budget**: requires `--budget=normal` or `full`

### Checks

- [ ] **Pro review**: Send recent changes to GPT 5.4 Pro for independent review
  - Delegate to: `.claude/skills/pro/SKILL.md`
  - Focus: architecture blind spots, subtle bugs, design improvements
- [ ] **Design review**: Visual audit of TUI and public sites
  - Delegate to: `.claude/skills/design-review/SKILL.md`
  - Focus: consistency, spacing, alignment, visual hierarchy

### Pass/fail

- PASS: External review finds nothing significant
- WARN: Minor suggestions
- FAIL: Significant issues found that internal checks missed

### If it fails

Triage findings through `/fp-check` before acting — external reviews have higher false positive rates.

---

## Summary Dashboard

After all sections complete, present:

```
## Health Check — YYYY-MM-DD

| # | Section | Status | Issues | Notes |
|---|---------|--------|--------|-------|
| 1 | Pre-flight | PASS | 0 | Clean workspace |
| 2 | Code Quality | WARN | 3 | 2 complexity hotspots, 1 type issue |
| 3 | Tests | PASS | 0 | 190 files, all passing |
| 4 | Security | PASS | 0 | No secrets, deps current |
| 5 | Infrastructure | WARN | 1 | flexily CI flaky |
| 6 | Project Health | WARN | 2 | 2 stale READMEs |
| 7 | Backlog | PASS | 0 | Clean |
| 8 | Content & SEO | WARN | 1 | termless.dev freshness |
| 9 | Legal | PASS | 0 | All licenses OK |
| 10 | External | SKIP | — | --budget=free |

**Overall: 7 PASS, 3 WARN, 0 FAIL**
```

Any FAIL section should be highlighted and addressed before the review is considered complete. WARN items get beads created for tracking.

**Blocker rule**: If Security or Legal is FAIL, overall status is BLOCKED regardless of other sections.
