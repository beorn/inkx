---
id: "@km/tui/picker-rank-subpath"
aliases:
  - km-tui.picker-rank-subpath
  - km-tui-picker-rank-subpath
created_by: Bjørn Stabell
created_at: 2026-04-14T20:30:09Z
closed_at: 2026-04-15T04:04:29Z
close_reason: "Fixed in 6de2f918d: search-utils.ts fuzzyScore rewritten with
  tiered scoring (exact > prefix > segment-boundary > substring > fuzzy). The
  '@delei' vs '@office/Finance/Accounts/Delei/SPD' case now ranks correctly.
  Regression test in apps/km-tui/tests/search-utils.test.ts covers the exact
  scenario from the bug. 13 tests passing."
---

# [x] Picker fuzzy ranking: subpath matches rank above exact root matches @km/tui #bug #P2

blocks:: [[@km/tui]]

Screenshot 2026-04-14 13.08.46: search 'Delei' in the Go to context picker puts '@office/Finance/Accounts/Delei/SPD' at the top, ranked above plain '@delei', '@delei.c', '@delei.org' etc.

Root cause hypothesis: fuzzyScore() in apps/@km/tui/src/views/search-utils.ts counts match density but doesn't penalize match offset or reward shorter result paths. A deep subpath match can out-score a shallow exact prefix match.

Desired ranking:
1. Exact sigil body match (@delei)
2. Sigil-prefix match (@delei.co, @delei.org)
3. Substring match at start of each path segment
4. Deep subpath / descendant matches (lowest)

Ties broken by shorter-is-better (path length / total character count).

Fix site: apps/@km/tui/src/views/ItemPicker.tsx filterOptions() + apps/@km/tui/src/views/search-utils.ts fuzzyScore scoring formula.