---
id: "@km/tui/nav-garble-wide"
aliases:
  - km-tui.nav-garble-wide
  - km-tui-nav-garble-wide
created_by: claude:8b5b9e1c
created_at: 2026-04-21T05:46:30Z
closed_at: 2026-04-21T06:03:06Z
close_reason: "Test assertion bug, not a rendering bug. The 2026-03-27 migration
  from testEnv (95dcd6574) replaced board.expectIncrementalMatchesFresh() with
  expect(app.text).toContain('UNIQUE_CARD_A') in the parametrized case. The new
  assertion fails whenever INBOX is horizontally scrolled off — correct behavior
  at 200/160 cols where the 6-column fixture cannot fit (formula:
  floor((width-2)/35)). Fix: replace toContain() with the actual garble
  fingerprint (no duplicate card titles, no card text in ╰─..─╯ borders).
  Incremental-vs-fresh correctness is still auto-checked on every press() by
  createTestApp's default checkIncremental: true, the direct successor to the
  original expectIncrementalMatchesFresh(). Root-cause class: headless tests
  cannot detect output-phase cursor drift, so header comment about 'flag emoji
  cursor drift in output phase' is stale — the original output-phase bug was
  fixed in silvery commit a487c3288; the remaining failures were purely the
  wrong assertion. Verified: all 6 tests pass. Commit: ee4d67c7f."
---

# [x] Navigation garble at wide terminals (160/200 cols) with flag-emoji titles @km/tui #bug #P2

blocks:: [[@km/tui]]

apps/@km/tui/tests/nav-garble-wide.test.ts "no screen corruption after j+l at N x M" fails at 200x50 and 160x40 but PASSES at 220x50. After pressing j then l in a board with a flag-emoji column title (🇨🇦 Launch Academy), the INBOX column's UNIQUE_CARD_A becomes invisible.

Test header documents: "flag emoji (🇨🇦) in the title triggers cursor drift in the output phase". But the test uses createTestApp (headless) — no ANSI output — so either the header comment is stale or the bug manifests at the layout/measurement level in flexily as well.

Size-dependent nature suggests: (a) flexily wide-char measurement of regional-indicator clusters, or (b) scroll-phase behavior when PROJECTS column (29 cards) interacts with measurement differences at different widths.

## Repro

    bun vitest run apps/@km/tui/tests/nav-garble-wide.test.ts

## Acceptance

1. All 3 sizes in test.each pass (220, 200, 160 cols)
2. No regression at other widths
3. Investigation documents whether root is output-phase ANSI (cursor drift), layout-phase measurement (flexily wide-char), or board-level navigation (view.tsx)

## Context
Pre-existing bug not caused by 2026-04-21 session. Discovered during /complete audit while finishing the memory-mode + title-undo P2 sweep.