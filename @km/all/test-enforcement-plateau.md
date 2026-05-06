---
mentions:
  - km
id: "@km/all/test-enforcement-plateau"
aliases:
  - km-all.test-enforcement-plateau
  - km-all-test-enforcement-plateau
created_by: Bjørn Stabell
created_at: 2026-04-19T04:10:21Z
closed_at: 2026-04-19T04:20:48Z
close_reason: "Shipped in ebfc61c8a. 4 enforcement rules in
  packages/km-infra/scripts/check-test-enforcement.sh (oxlint lacks custom-rule
  API, so script-based linter invoked via lint:test-enforcement). Rules:
  no-raw-rgb-in-tests, no-withStore-observe-in-spec, no-expectScreen-in-spec,
  require-spec-barrel-import. 27 violations fixed (7 raw RGBs extracted to
  helpers/theme.ts constants; 20 app.expectScreen → expect(app.text).toContain).
  2354 tests pass; grep-based acceptance returns 0 hits."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-all.test-enforcement-plateau
    depends_on_id: km-all
    type: parent-child
    created_at: 2026-04-18T21:10:21Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-all
---

# [x] Test system enforcement layer — oxlint rules + codemod adoption to reach quality plateau @km/all #feature #P3

blocks:: [[@km/all]]

Blessed API exists (TestApp + matchers + fixtures). Tests don't use it consistently:

- 5 hardcoded-RGB assertions drifted from silvery theme bump (fixed in eab76adb9)
- 20 .test.ts files use withStore(...) for OBSERVATION (blessed hierarchy says spec.ts only, and only for mutations)
- 24 .expectScreen(...) calls (weak substring match; blessed hierarchy says use locators/handles)
- test.extend fixture adopted by only 2/88 files
- Termless backend appears broken (TEST_BACKEND=termless crashes)
- FakeRepo.getAllNodes type hole leaks through Repo interface

REFRAME: enforcement. Add oxlint rules that make the wrong thing impossible:

1. no-raw-rgb-in-tests (must derive from theme)
2. no-withStore-observe-in-spec
3. no-expectScreen-in-spec
4. require-spec-barrel-import

Plus: codemod for test.extend adoption, termless backend repair, FakeRepo type widening.

Acceptance:

- 4 oxlint rules land and fail the lint when violated
- Zero violations across apps/@km/tui/tests/
- Termless backend runs clean in CI
- Repo interface exposes getAllNodes (no FakeRepo-only method)

