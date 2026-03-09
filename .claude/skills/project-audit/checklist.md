---
description: Detailed audit checklist by category
---

# Audit Checklist

## Code DRY

- [ ] **Duplicated functions**: Same function body in 2+ files (grep signatures, compare)
- [ ] **Repeated long argument lists**: Same 5+ args passed to the same constructor/function in multiple call sites
- [ ] **Copy-paste modules**: Two files >70% identical (e.g., canvas/index.ts and dom/index.ts sharing init/lifecycle/reconciler code)
- [ ] **Re-export chains**: A re-exports from B which re-exports from C. Normalize to single source.
- [ ] **Misplaced utilities**: Function in file X that's only used by file Y, or used by many files but lives in a specific module instead of a shared one
- [ ] **Dead code**: Exported functions with zero importers (check with `grep -r "functionName" --include="*.ts"`)

## Documentation Staleness

- [ ] **Renamed APIs**: Grep for old names of functions, hooks, components, props that were renamed. Check source comments AND docs.
- [ ] **Wrong code examples**: Code samples that don't match current API signatures
- [ ] **Broken internal links**: `](path/to/file.md)` where the target doesn't exist or was moved
- [ ] **Performance numbers without provenance**: Benchmark claims without date, environment, methodology, or pointer to reproducible script
- [ ] **Disagreeing numbers**: Same metric with different values in different docs (e.g., "200x faster" in one doc, "100x faster" in another)
- [ ] **Historical docs not marked**: Design RFCs, original proposals that describe planned rather than implemented behavior

## Naming Consistency

- [ ] **Project name casing**: Should the project name be lowercase in prose? (e.g., "silvery" not "Hightea", "iPhone" not "Iphone")
- [ ] **Type name casing**: Are type/interface names consistent? (PascalCase for types, camelCase for functions)
- [ ] **Terminology drift**: Same concept with multiple names (e.g., "layout feedback" vs "two-phase rendering" vs "measure/arrange")
- [ ] **File naming**: Consistent kebab-case, camelCase, or PascalCase across the project

## Documentation Structure

- [ ] **Oversized docs**: Any .md file >400 lines that covers multiple topics (candidate for splitting)
- [ ] **Content overlap**: Two docs covering similar material — run `diff -U 3 fileA.md fileB.md` and check ratio of unchanged lines. If >50% shared, flag for merge or cross-reference. Example: comparison.md vs ink-comparison.md sharing most Ink data.
- [ ] **Missing cross-references**: Doc A discusses topic covered in depth by Doc B but doesn't link to it
- [ ] **Flat organization**: >20 files in a single directory that could be grouped by domain (guides/, reference/, deep-dives/). Conversely, deeply nested dirs with 1-2 files each = over-organized.
- [ ] **Missing table of contents**: No docs/README.md or equivalent index with reading order
- [ ] **Canonical source unclear**: For shared data (benchmarks, version numbers), which doc is the source of truth?

## README / Narrative

See [narrative.md](narrative.md) for the full framework.

- [ ] **Tagline signals scope**: Does it convey "framework" not "feature"?
- [ ] **"Why X?" before "Quick Start"**: Is the reader sold before being told to install?
- [ ] **Features tell stories**: Are features grouped by problem-solved, not just listed?
- [ ] **Trade-offs are acknowledged**: Is there honesty about where alternatives are better?
- [ ] **Audience is clear**: Does it say who this is for?
- [ ] **Speculative items separated**: Are "future" plans clearly marked vs shipping features?
- [ ] **No duplicate sections**: Same table or content appearing twice in the README

## Project Health

- [ ] **CHANGELOG up to date**: Recent significant changes reflected
- [ ] **Troubleshooting doc exists**: Common issues documented for users
- [ ] **Testing docs are user-facing**: Not just contributor/internal — explains how to test YOUR app built with this tool
- [ ] **Deprecation notices**: Legacy code paths marked with clear migration guidance
- [ ] **Examples current**: Example code actually runs against current API
- [ ] **Test coverage**: Do key modules have corresponding test files? If a coverage report exists, note the percentage. Flag untested critical paths.
- [ ] **CI status**: Is CI configured? Do README badges reflect current build status? Is the badge up-to-date?
- [ ] **Quick-start verification**: Does the README's example actually work if run? (If feasible, try it.)

## Security & Dependencies (optional)

- [ ] **Committed secrets**: Grep for `API_KEY`, `SECRET=`, `password=`, `token=` in source. Flag any hardcoded credentials.
- [ ] **Outdated dependencies**: Major version bumps available? Known vulnerabilities?
- [ ] **License compatibility**: Are dependency licenses compatible with the project's license?
- [ ] **Prerequisites documented**: Does the README state required runtime versions, OS support, and external services?
