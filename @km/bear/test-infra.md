---
id: "@km/bear/test-infra"
aliases:
  - km-bear.test-infra
  - km-bear-test-infra
created_by: Bjørn Stabell
created_at: 2026-04-17T06:28:31Z
closed_at: 2026-04-17T06:33:55Z
close_reason: "Phase 0 done: LLM-mock harness (mock.ts 160 LOC:
  buildMockQueryModel + scenario helpers + provider stubs) + 9 agent-mode unit
  tests (short-circuit absolute/fraction paths, speculative synth used vs
  disabled, empty-plan round-2 handling, parse-failed fallthrough, time-hint
  preserved vs overridden, zero-variants fallthrough). All 93 bearly history
  tests pass (84 existing + 9 new). /complete verified: mock.ts exists, 1 test
  import of mock, 9 test cases (≥6 target), 0 live API calls during test run.
  Ready for Phase 1 (mcp-wrapper) which depends on this."
---

# [x] Phase 0: Test infra for agent-mode (LLM mocking harness) @km/bear #task #P1 @Bjørn Stabell

blocks:: [[@km/bear]]

Prerequisite for all bear phases. Today 0 tests cover `recallAgent`, `planQuery`, synth path selection, speculative-vs-fresh logic. Shipping bear MCP tools without test coverage repeats the era2 failure (Case Study 5 Lesson 4: new package ships with no tests).

## Scope

- `vendor/bearly/tools/lib/llm/mock.ts` (NEW) — installable mock transport for `queryModel()`. Returns canned plan-JSON or synth-text per test-configured rules. Must override `queryModel` without touching call sites (via module-level stub set before test runs).
- `vendor/bearly/tests/history/agent.test.ts` (NEW) — unit tests exercising the agent orchestration path:
  - short-circuit firing on high absolute coverage
  - speculative synth returns round-1 result when round 2 marginal
  - fresh synth on merged when round 2 substantive
  - empty-plan handling (round 2 planner returns nothing)
  - time-hint application from planner
  - fallthrough when planner fails entirely
- `vendor/bearly/tests/history/plan.test.ts` — extend to use the mock harness for end-to-end planner tests (currently only tests the JSON parser in isolation).

## Delete

- Test file 'plan.test.ts' currently uses inline fixture strings for parser tests only; after this phase, add real mocked-LLM planner tests that exercise the full `planQuery()` call.
- No OldWay code deletion — this is net-new test infrastructure.

## New tests

- `lib/llm/mock.ts` + ≥6 test cases in `agent.test.ts` + ≥3 new cases in `plan.test.ts` covering LLM path.

## /complete criteria (run literally before closing)

```bash
# Mock harness exists and is imported by tests
ls vendor/bearly/tools/lib/llm/mock.ts
rg 'from .*lib/llm/mock' vendor/bearly/tests/  # → ≥1 hit

# Agent test file exists with ≥6 test cases
ls vendor/bearly/tests/history/agent.test.ts
grep -c '^\s*test(' vendor/bearly/tests/history/agent.test.ts  # → ≥6

# No live API calls during test run (env var unset, model names not invoked)
unset ANTHROPIC_API_KEY OPENAI_API_KEY && bun vitest run vendor/bearly/tests/history/ 2>&1 | grep -iE 'claude-haiku|gpt-5|api.anthropic' | wc -l  # → 0

# All new tests pass
bun vitest run vendor/bearly/tests/history/ 2>&1 | tail -5  # → Test Files N passed, 0 failed
```

## MANDATORY first step

Read docs/lessons/refactoring.md IN FULL before writing any code.