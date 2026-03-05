---
description: "Deep project-wide audit: code DRY violations, doc staleness, naming inconsistencies, structural issues, and narrative quality. Use when a project or package needs a systematic health check."
argument-hint: "[<path-or-package>]"
allowed-tools: Task, Read, Glob, Grep, Bash, Edit, Write, AskUserQuestion, EnterPlanMode, ExitPlanMode
---

# Project Audit

**Keywords**: audit, review, health check, DRY, stale docs, cleanup, tech debt, project review

Systematic project-wide quality audit. Produces a prioritized plan covering code, docs, naming, structure, and narrative. Designed for packages and subsystems (not individual files — use `/code clean` for that).

## Quick Actions

| Command | Purpose |
|---------|---------|
| `/project-audit <path>` | Full audit of a package or directory |
| `/project-audit --code-only <path>` | Code DRY + structural issues only |
| `/project-audit --docs-only <path>` | Documentation quality + staleness only |
| `/project-audit --narrative <path>` | README/landing page narrative review |

## Target

**Argument**: $ARGUMENTS

Default target: the current working directory. If a path is given, audit that directory.

## Phase 1: Reconnaissance

Gather the full picture before forming opinions. Run these in parallel:

### 1A: Codebase scan

```
Glob **/*.ts in target — get file count, directory structure
Grep for common DRY violations:
  - Identical function bodies across files (grep function signatures, look for duplicates)
  - Long argument lists repeated verbatim (>5 args, same values)
  - Copy-paste patterns (identical blocks >10 lines)
  - Shared utilities that belong in a common module
```

### 1B: Documentation scan

```
Glob **/*.md in target — inventory all docs
For each doc: note title, line count, last-modified date
Grep for stale references:
  - Old function/hook/API names still referenced in docs
  - Broken internal links (grep for ](path) and verify targets exist)
  - Performance numbers without provenance (dates, environment, methodology)
  - Overlapping content between docs (>50% shared material)
```

### 1C: Naming and consistency

```
Grep for inconsistent project name casing (ProperCase vs lowercase in prose)
Grep for inconsistent terminology (same concept, different names)
Check import paths for unnecessary indirection (re-export chains)
```

### 1D: Structural assessment

```
Read README.md — assess narrative quality (see Phase 4)
Read CLAUDE.md — check accuracy against current codebase
Check file sizes — flag docs >400 lines (likely need splitting)
Directory organization — if a single directory has 20+ files that could be
  grouped by domain/feature, flag as "flat." If there are deeply nested
  subdirectories with only 1-2 files each, flag as "over-organized."
```

### 1E: Security and dependency scan (optional)

```
Secret scan — grep for API_KEY, SECRET=, password=, token= in source files
  (not .env.example). Flag if found committed.
Dependency health — if package.json exists, check for:
  - Major version bumps available (bun outdated or npm outdated)
  - Known vulnerability count (npm audit or equivalent)
License compatibility — spot-check that dependency licenses are compatible
  with the project's license (MIT projects shouldn't depend on GPL-only)
```

## Phase 2: Analysis

Synthesize findings into categorized issues. For each issue, classify:

| Category | Scope | Risk | Example |
|----------|-------|------|---------|
| **Code DRY** | Functions, patterns | Medium | Identical helper in 3 files |
| **Stale docs** | Renamed APIs, wrong numbers | High | useLayout() renamed to useContentRect() 3 months ago |
| **Naming** | Inconsistent casing/terms | Low | "Hightea" vs "hightea" in prose |
| **Structure** | Doc organization, file sizes | Medium | 627-line getting-started is really 2 docs |
| **Overlap** | Duplicate content | Medium | comparison.md and ink-comparison.md share 80% |
| **Narrative** | README doesn't sell the project | High | Tagline undersells, features are a flat dump |
| **Provenance** | Numbers without dates/methodology | Medium | 3 different benchmark runs, no dates |

### Severity rules

- **High**: User-facing misinformation or broken functionality — wrong API names in docs, code examples that throw errors, broken links, misleading benchmarks. Users following these will fail.
- **Medium**: Maintenance drag that doesn't immediately hurt users — DRY violations, doc overlap, poor organization, missing test coverage for critical paths. Slows development.
- **Low**: Purely cosmetic — casing inconsistencies, minor style issues, naming conventions that are consistent within their file.

**Always anchor findings in evidence.** Instead of "Inconsistent terminology," write "Inconsistent terminology: 'widget' vs 'component' — e.g., in Docs/guide.md:42 vs API.md:15." Vague findings are not actionable.

## Phase 3: Plan Generation

Generate a phased remediation plan. Use `EnterPlanMode` for user approval.

### Plan structure

```markdown
## Phase 1: Code DRY Fixes
[Specific extractions, with file paths and line numbers]

## Phase 2: Documentation Correctness
[All text-only fixes — stale refs, wrong names, broken links]
[These are safe, parallelizable, no test risk]

## Phase 3: Documentation Structure
[Splitting, reorganizing, de-duplicating docs]
[Provenance, cross-references, canonical sources]

## Phase 4: README / Narrative
[Tagline, structure, audience, features, trade-offs]
[Informed by competitive analysis and deep research]

## Phase 5: Remaining Cleanup
[Everything else: changelog, troubleshooting, recipes, deprecations]
```

### Plan principles

1. **Correctness before polish** — fix wrong information before reorganizing
2. **Parallelizable phases** — independent tasks within each phase can run concurrently
3. **One commit per phase** — clean git history
4. **No speculative refactoring** — only fix issues found in the audit, don't add features
5. **Deep research for narrative** — always ask `/deep` for competitive README analysis before rewriting
6. **DRY rule of three** — only flag duplication that appears in 3+ places, or is literally copy-pasted (>10 lines identical). Two similar-but-not-identical patterns may be intentional.

### Execution strategy

For large plans (>5 tasks), recommend team execution:
- Code DRY agents (with tests)
- Doc correctness agents (parallel, no test risk)
- Doc structure agents (after correctness is done)
- README agent (single author for editorial coherence)
- Cleanup agents (parallel, independent)

## Phase 4: Narrative Review (for README/landing pages)

When the audit includes a README, evaluate against best-in-class frameworks. This is NOT a checklist — it's a critical reading.

### Narrative audit questions

1. **10-second hook**: If I land on this README, do I understand what it is and why I should care within 10 seconds? Or does it start with technical details?

2. **Tagline quality**: Does the tagline convey scope (framework, not feature) and differentiation? Or does it sound like a single utility? Compare against: Vite ("Next Generation Frontend Tooling"), tRPC ("Move fast and break nothing"), Astro ("the web framework for content-driven websites").

3. **"Why X?" before "How to use X"**: Is there a section that sells the project BEFORE the quick start? Bun and Astro do this. Most weaker READMEs jump straight to `npm install`.

4. **Feature organization**: Are features organized into meaningful groups that tell stories? Or is it a flat bullet dump? Good: Astro's "Islands, Zero JS, UI-agnostic". Bad: 30 undifferentiated bullets.

5. **Honest trade-offs**: Does it acknowledge where alternatives are better? Bun links to "things that don't work yet." Mature projects own their narrative before competitors do.

6. **Audience clarity**: Does it say who it's for? Astro: "content-driven websites." Redwood: "startups." A framework for everyone is a framework for no one.

7. **Prerequisites**: Does the reader know what they need before installing? Runtime version, OS constraints, external services. "Can I use this?" should be answered before `npm install`.

8. **Speculative content**: Are "Future" items clearly separated from shipping features? Or do they inflate the impression of completeness?

9. **Visual hook**: For UI frameworks or visual tools — is there a screenshot, GIF, or code-output example above the fold?

### Competitive analysis

Always send to `/deep` (background) with:
- The project's current README
- 3-5 competitor READMEs for comparison
- Specific questions about tagline, narrative, and audience targeting

Don't rewrite the README based on intuition alone. Get external input.

## Report Format

```markdown
# Project Audit: <package-name>

## Summary
<2-3 sentences: overall health, biggest issues, recommended priority>

## Findings

### Code DRY (N issues)
| # | Issue | Files | Severity |
|---|-------|-------|----------|

### Stale Documentation (N issues)
| # | Issue | Files | Severity |
|---|-------|-------|----------|

### Naming Inconsistencies (N issues)
| # | Issue | Scope | Severity |
|---|-------|-------|----------|

### Documentation Structure (N issues)
| # | Issue | Details | Severity |
|---|-------|---------|----------|

### Narrative / README (N issues)
| # | Issue | Details | Severity |
|---|-------|---------|----------|

### Other (N issues)
| # | Issue | Details | Severity |
|---|-------|---------|----------|

## Recommended Plan
[Phased remediation — see Phase 3 above]

## Estimated Scope
- Code changes: ~N files
- Doc changes: ~N files
- New files: ~N
- Deleted/merged files: ~N
- Recommended execution: solo / team of N agents
```

## Anti-Patterns

- **Skimming instead of reading**: Read the actual code and docs. Don't just grep for keywords and assume you know what's there.
- **Reporting only obvious issues**: The value is in non-obvious findings — the doc that references an API renamed 3 months ago, the two comparison docs that are 80% identical, the performance numbers with no provenance.
- **Feature-dump recommendations**: "Add error handling, add tests, add docs" is not an audit. Specific file paths, line numbers, and concrete fixes are.
- **Rewriting README from intuition**: Always get competitive analysis via `/deep` before proposing narrative changes. Your gut feeling about what sounds good is less valuable than studying what actually works.
- **Treating all issues as equal**: Stale API names in docs (actively misleading) are more urgent than casing inconsistencies (cosmetic). Prioritize.
- **Auditing without a plan**: The audit produces a plan. The plan gets executed. Don't just list problems — structure the solution.

## Sub-Skills

| File | Purpose |
|------|---------|
| [checklist.md](checklist.md) | Detailed audit checklist for each category |
| [narrative.md](narrative.md) | README narrative analysis framework |
