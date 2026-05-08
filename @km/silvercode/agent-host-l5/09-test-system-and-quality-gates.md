---
aliases:
  - km-silvercode.agent-host-l5.09-test-system-and-quality-gates
  - km-silvercode-agent-host-l5-09-test-system-and-quality-gates
created_at: 2026-05-08T06:22:47.106Z
---

# [/] Robust test system and quality gates #feature #P0

Implement transition tests, property tests, golden stream fixtures, raw ledger replay, provider fake/live conformance, visual replay, queue/cancel races, permissions, background/subagent tests, and grep/lint gates.

## Ownership

This phase owns proof and debug tooling:

- Fake providers for deterministic protocol/runtime tests.
- Golden traffic ledgers and replay fixtures for real-world regressions.
- Traffic log viewer/replay as a first-class debug tool.
- Property/state-machine tests for illegal transitions and chunk reconciliation.
- Visual replay and resize/hover/mouse tests for transcript UI.
- Grep/lint gates for L5 naming and legacy deletion.

## Complete Criteria

- One command runs the fast L5 conformance suite for fakes, replay, projection, queue/cancel, permission, background/subagent, and chunk normalization.
- Traffic log viewer can load a captured ledger, inspect raw and normalized events, scrub/replay turns, and export a minimal regression fixture.
- Test migration preserves semantics: pipeline-correctness assertions stay pipeline assertions; user-facing assertions do not over-specify layout.
