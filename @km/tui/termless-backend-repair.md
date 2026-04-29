---
id: "@km/tui/termless-backend-repair"
aliases:
  - km-tui.termless-backend-repair
  - km-tui-termless-backend-repair
created_by: Bjørn Stabell
created_at: 2026-04-19T04:10:42Z
closed_at: 2026-04-19T04:24:57Z
close_reason: "Shipped in parallel /max run. sigil-registry: 20ada24b3
  (parser+projection+ranker → SigilSpec registry, 10 new tests).
  repo-getallnodes: 0b77848f3 (Repo interface widened, type hole closed).
  termless-repair: 4a8ae3279 (dispose ordering, cascade eliminated; individual
  test readiness follow-up orthogonal). 2354 km-tui tests pass."
---

# [x] Termless backend fails to run omnibox tests — 'Terminal is closed' after first test @km/tui #bug #P3

blocks:: [[@km/tui]]

Earlier TEST_BACKEND=termless run hit 'Terminal is closed' uncaught exception across all 27 tests. Suggests cross-test termless handle teardown issue or createApp → createTermless lifecycle gap. Headless backend works; termless doesn't. Need both for ANSI-gen bug parity.

Investigate: does createTestApp's termless branch clean up handles between using-disposes? Is there a shared-state issue?