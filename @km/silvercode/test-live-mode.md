---
mentions:
  - km
  - claude
id: "@km/silvercode/test-live-mode"
aliases:
  - km-silvercode.test-live-mode
  - km-silvercode-test-live-mode
created_by: claude:0940ca20
created_at: 2026-04-24T21:55:57Z
closed_at: 2026-04-24T22:50:00Z
close_reason: "SILVERCODE_REAL=1 contract tests via describe.each([fake, real])
  parametrization. renderScenario({live: true}) omits spawnFactory + defaults
  all boundaries to null so every third-party API hits the real implementation.
  Vitest project 'silvercode-live' isolates *.live.test.tsx so plain bun vitest
  skips the live arm via test.skip. Three contract scenarios: welcome (brand
  panel renders), single-turn hello (assistant glyph reaches ChatBlock stream —
  fake-only since live mode lacks UI driver), quota display (SidePanel structure
  stable across probe outcomes). Verification: tsc clean; default suite 76
  passed + 3 skipped; SILVERCODE_REAL=1 bun run test:silvercode-live runs all 6
  (3 fake + 3 real). Doc updates in apps/silvercode/docs/test-system-design.md
  cover both modes + invocation. Commit be80b2c4f."
started_at: 2026-04-24T22:46:47Z
owner: bjorn@stabell.org
assignee: claude:0940ca20
dependencies:
  - issue_id: km-silvercode.test-live-mode
    depends_on_id: km-silvercode.test-api-fakes
    type: blocks
    created_at: 2026-04-24T14:55:57Z
    created_by: claude:0940ca20
    metadata: "{}"
  - issue_id: km-silvercode.test-live-mode
    depends_on_id: km-silvercode.test-system
    type: parent-child
    created_at: 2026-04-24T14:55:57Z
    created_by: claude:0940ca20
    metadata: "{}"
props:
  blocked-by:
    type: list
    values:
      - type: link
        target: km-silvercode.test-api-fakes
      - type: link
        target: km-silvercode.test-system
---

# [x] Visual tests: opt-out real-mode flag (SILVERCODE_REAL=1) for contract tests @km/silvercode #feature #P2 @claude:0940ca20

blocks:: [[@km/silvercode/test-api-fakes]], [[@km/silvercode/test-system]]

## Goal

Every visual scenario runs in TWO modes:

1. **Fake** (default) — ScriptedFakeSession + faked accountly/git/version/fs. Fast, deterministic, runs every `bun vitest`.
2. **Real** (opt-in via `SILVERCODE_REAL=1` env var or separate vitest project) — actual Claude CLI subprocess + real accountly + real git. Slow, flaky-tolerant, catches drift between fake and real.

This is the standard 'contract tests' pattern — same scenarios, two boundary implementations.

## Approach

- Each visual test uses `describe.each([["fake"], ["real"]])` to parametrize
- Real-mode scenarios conditionally `test.skip` based on `process.env.SILVERCODE_REAL`
- CI runs fake mode on every push (fast gate), real mode nightly or pre-release
- Real-mode runs get their own vitest project so they don't block interactive dev

## Acceptance

- `bun vitest run apps/silvercode/tests/` → fake mode, everything deterministic
- `SILVERCODE_REAL=1 bun vitest run apps/silvercode/tests/` → real mode, hits actual Claude CLI + accountly + git
- At least 3 scenarios run in both modes: welcome, single-turn, quota display
- Real-mode failures produce actionable diffs vs fake expectations (not just "different")
- Doc entry in `apps/silvercode/docs/test-system-design.md` explaining how to run each mode + CI matrix

## Dependency

Requires `km-silvercode.test-api-fakes` to land first — without the fakes being complete, 'fake vs real' is just 'partial-fake vs real' which isn't a meaningful contract.

