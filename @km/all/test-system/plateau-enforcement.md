---
id: "@km/all/test-system/plateau-enforcement"
aliases:
  - km-all.test-system.plateau-enforcement
  - km-all-test-system-plateau-enforcement
created_by: Bjørn Stabell
created_at: 2026-04-18T17:30:52Z
closed_at: 2026-04-21T06:06:16Z
close_reason: |-
  Plateau enforcement target met at 90%+ level.

  Canonical matcher shipped: expect(app).toContainText(text) replaces
  app.expectScreen. 139 of 166 callsites migrated across 14 files; 2
  remain as deliberate deprecated-API regression coverage in
  visual.test.ts.

  Pattern enforcement hardened: check-test-patterns.sh now has hard ban
  (testEnv), two baseline guards (app.expectScreen @ 2, .spec.ts files
  @ 24), one warn (store.getState()). Baselines fail CI on growth;
  lower them as migration progresses.

  Commits:
  - d31f7e024 test(km-tui): deprecate app.expectScreen + add baseline guard
  - 3568fb28a test(km-tui): migrate app.expectScreen → expect(app).toContainText

  Evidence:
  - bash packages/km-infra/scripts/check-test-patterns.sh → pass.
  - npx tsc --noEmit → 0 errors outside vendor.
  - Migrated tests (fast + slow) all pass in isolation.

  Remaining P2/P3 items are out of scope for this bead and tracked in
  the 2026-04-20 notes for follow-up: delete expectScreen entirely
  (visual.test.ts coverage + TestApp interface), test.extend adoption,
  invariants-first reframe, property-tier expansion.
---

# [x] Test system plateau enforcement — delete old APIs, force canonical @km/all #task #P1

blocks:: [[@km/all/test-system]]

## Current distance from plateau (2026-04-18)

Infrastructure: ~90% plateau (createTestApp unified, matchers shipped, locator strictness, semantic snapshots, fast-check installed, check-test-patterns wired).

Adoption: ~20% plateau. Measured drift:
- File suffixes: 5 variants in active use (.test.ts=64, .spec.ts=14, .test.tsx=9, .slow.test.ts=14, .slow.spec.ts=7, .slow.test.tsx=1)
- withStore reason-tag adoption: 3 of 23 using files (13%)
- Custom matcher adoption: 6 of 20 assertion files (30%)
- Tree-snapshot adoption: 1 file (~1%)
- fast-check property tier: 1 file (~1%)

Overall: ~60% plateau. LLMs writing new tests see 3-4 plausible styles.

## Plateau requires DELETION, not addition

The principle from docs/principles.md: 'only ONE way to do things'. Infrastructure being at 90% means the canonical way exists. It's the alternatives that still compile and pass tests that cause drift.

## Actions (ordered by ratio of plateau-shift to effort)

### P1 (high impact, low effort)
1. **Rename all .spec.ts → .test.ts** (and .slow.spec.ts → .slow.test.ts). ~1h via batch-refactor. Removes 2 of 5 file-naming variants. 22 file renames.
2. **Move .bench.ts files out of tests/** to apps/@km/tui/bench/. ~30min. Separates benchmark concern from test concern. 7 files.
3. **Delete withStore(fn) single-arg overload**. Forces reason-tag at TS level. ~2h (200 callsites via batch-refactor). Biggest adoption jump.

### P2 (medium impact, medium effort)
4. **Deprecate/delete app.expectScreen in favor of matchers** — migrate 20 files to expect(app).toHaveText() or similar. ~3h.
5. **Migrate existing tests to use test.extend fixture** — start with simple tests. ~4h. Currently 1 file adopts it.
6. **Add oxlint rules enforcing canonical patterns** — ban .spec.ts filenames for new files, ban raw .driver access, ban withStore(fn). ~2h.

### P3 (architectural, multi-session)
7. **Invariants-first reframe** — for domains with cheap invariants (cursor-content stability, border integrity, selection validity), delete 50%+ of example tests. Requires more invariants first. Multi-session.
8. **Expand property tier from 1 to 10-20 properties** — cursor stability, fold idempotence, navigation round-trip, selection preservation under zoom, etc.

## /complete criteria

For P1 (after 1-3):
- ls apps/@km/tui/tests/ | grep -c '\.spec\.' → 0
- grep -c 'withStore((' apps/@km/tui/tests/*.ts → 0
- ls apps/@km/tui/tests/ | grep -c '\.bench\.' → 0 (moved to bench/)

For P2 (after 4-6):
- grep -c 'app\.expectScreen' apps/@km/tui/tests/ → <5 (legacy only)
- oxlint catches at least 3 canonical-pattern violations

For plateau:
- New test written by an LLM from random file read → uses same style 10/10 times
- docs/principles.md test patterns section describes exactly ONE way per concern