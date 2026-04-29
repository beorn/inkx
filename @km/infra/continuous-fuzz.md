---
id: "@km/infra/continuous-fuzz"
aliases:
  - km-infra.continuous-fuzz
  - km-infra-continuous-fuzz
created_by: claude:cc081a9a
created_at: 2026-04-27T06:33:59Z
closed_at: 2026-04-28T04:49:16Z
close_reason: "Acceptance met: workflow file at .github/workflows/fuzz.yml
  (valid YAML, parses + dispatches), schedule '7 4 * * *' nightly +
  workflow_dispatch, persistent corpus cache (actions/cache/restore@v4 L88 +
  save@v4 L149), bead-creation script invoked on failure (L188-193,
  fuzz-crash-to-bead.ts). Run 24980853272 demonstrated end-to-end: cache
  restored from key fuzz-corpus-main-3, bead-creation script produced
  well-formed 'bd create --id km-board.fuzz-1xgqy5 ...' from extracted FAIL
  files. Five derisk checks PASS (1-4) + 1 honest skip (tribe broadcast — MCP
  tools unavailable). Workflow 'failures' are pre-existing CI defects (mdspec
  stub, build-info.gen.ts) explicitly noted as parent scope, NOT this bead.
  Target L0 → L3 reached: api/lifecycle structure (CI workflow + script +
  persistent corpus + auto bead creation)."
---

# [x] Continuous fuzz CI — nightly + persistent corpus @km/infra #feature #P1 @claude:cc081a9a

blocks:: [[@km/infra/guardrails]]

Wire fuzz harness (existing *.fuzz.ts files via vitest 'fuzz' project) into CI on a nightly schedule with persistent corpus across runs. New crashes auto-create beads via packages/@km/infra/scripts/fuzz-crash-to-bead.ts.

Origin: @km/all/plateau-90 N1. Pro/Kimi review: 5 fuzz failures in this sweep — fuzz is what's working. Stop fuzzing → regress.

Deliverables:
- .github/workflows/fuzz.yml — schedule + workflow_dispatch, persistent corpus cache, on-failure bead creation script invocation
- packages/@km/infra/scripts/fuzz-crash-to-bead.ts — Bun TS script: parse vitest output, extract seed + test file, generate bead ID, call bd create with seed+repro+workflow URL
- corpus = vimonkey __fuzz_cases__/ directories alongside each fuzz test file (cached across runs)

Target level: L0 → L3 (CI workflow + script + persistent corpus + auto bead creation = api/lifecycle structure).

Acceptance:
- workflow file exists + valid YAML
- gh workflow view fuzz.yml confirms parse
- corpus caching configured (actions/cache@v4)
- bead-creation script exists and is invoked on failure
- bead notes updated with workflow path, schedule, how to test (workflow_dispatch)