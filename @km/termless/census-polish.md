---
mentions:
  - km
  - claude
id: "@km/termless/census-polish"
aliases:
  - km-termless.census-polish
  - km-termless-census-polish
created_by: claude:4929065a
created_at: 2026-03-23T00:39:20Z
closed_at: 2026-03-23T00:45:19Z
close_reason: "Fixed: CLI backends/install output clearer, census loads all
  available backends (4 of 9), per-backend result files written"
owner: bjorn@stabell.org
assignee: claude:4929065a
---

# [x] Census polish: per-backend results, CLI improvements, all backends @km/termless #task #P1 @claude:4929065a

Issues from user review:

1. Report should write per-backend-version files: census/results/xtermjs-5.5.0.json
2. bun cli install should list available backends and suggest --all
3. bun cli backends: Status column shows termless version not upstream, * not explained, upstream missing versions
4. Census should load ALL installed backends (currently only 3-4 of 9)
5. Census probe files are backend-agnostic (correct) but output should be backend-first

