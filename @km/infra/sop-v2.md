---
mentions:
  - km
  - Bjørn
id: "@km/infra/sop-v2"
aliases:
  - km-infra.sop-v2
  - km-infra-sop-v2
created_by: Bjørn Stabell
created_at: 2026-04-13T07:12:25Z
closed_at: 2026-04-13T07:45:48Z
close_reason: "Two-layer SOP architecture shipped. sop-runner.ts (382 lines) =
  cached DAG executor using Bun.spawn + git/TTL caching in .sop-cache/.
  sop-tools.ts (276 lines) = 29 task definitions, single source of truth for
  commands + domain→tool mapping. sop.ts refactored from 2057→620 lines (700+
  LoC of parsers deleted). Caching works: second run skips 28/29 tools (lint
  always runs as mutating pre-step). Parallel wave execution via toposort +
  Promise.all. All 5 acceptance criteria verified."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
dependencies:
  - issue_id: km-infra.sop-v2
    depends_on_id: km-infra.sop
    type: parent-child
    created_at: 2026-04-13T00:25:50Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-infra.sop
---

# [x] SOP v2: domain-per-file + shared tool cache @km/infra #task #P0 @Bjørn Stabell

blocks:: [[@km/infra/sop]]

Two-layer SOP architecture replacing the monolithic tools/sop.ts.

## Problem

Three sources of truth for "what checks does a domain run": tools/sop.ts (code), SKILL.md (docs), agent knowledge (context). DRY violation. Also: tools like knip run multiple times because different domains invoke them independently — no shared cache.

## Design

**Layer 1 — Tool Runner** (tools/sop-runner.ts, ~100 LoC)
Cached DAG executor using Bun builtins. No library deps.

- Tasks declare: command, input globs, output file, dependencies
- Runner: toposort DAG → hash inputs (Bun.hash + Bun.file) → skip if cached → Bun.spawn parallel → store outputs to .sop-cache/
- Cache key = content hash of input files. Cache TTL configurable per task.
- 15 tasks, max depth 2. Simple enough that toposort is ~10 lines.

**Layer 2 — LLM Domain Analysis**
The LLM IS the domain layer. No TypeScript parsers needed.

- /sop reads cached tool outputs + SKILL.md domain definitions
- Classifies findings per domain, proposes actions
- Handles format variations and judgment (CVE severity, false positives) that parsers can't

**Tool → Domain mapping** (one tool, multiple lenses):

- knip → code (unused exports/types/files) + packages (unused/unlisted deps)
- bun audit → security (CVEs) + packages (dep health)
- tsc → code (type errors) + code (type coverage)

## Implementation Plan

1. Create tools/sop-runner.ts — DAG executor with Bun.spawn + Bun.hash caching
2. Define tool tasks in tools/sop-tools.ts — each tool: command, inputs, outputs, deps
3. Create Makefile-style entry: `bun tools/sop-runner.ts [--all] [--force]`
4. Update /sop skill to: run sop-runner first (Layer 1), then analyze outputs (Layer 2)
5. Remove parsers from tools/sop.ts — the 250 lines of parser code become unnecessary
6. SKILL.md stays as documentation only — domain definitions read by LLM, not by code

## Current Tools (15)

tsc, knip, depcruise, sherif, bun-audit, lint (oxlint+oxfmt), test-fast, complexity, type-coverage, link-check, nix-freshness, socket, hyperfine, secret-scan, license-check

## Research Summary

Evaluated: Turborepo (package-centric, wrong abstraction), Nx (coupled to workspace model), Nix derivations (sandbox blocks live-repo access), Dagger (container overhead), Taskfile (best CLI option but new binary dep), p-graph (good but unnecessary). Bun builtins (spawn, hash, file, glob) cover everything with zero deps.

