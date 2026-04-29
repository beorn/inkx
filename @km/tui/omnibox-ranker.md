---
id: "@km/tui/omnibox-ranker"
aliases:
  - km-tui.omnibox-ranker
  - km-tui-omnibox-ranker
created_by: Bjørn Stabell
created_at: 2026-04-14T23:24:14Z
closed_at: 2026-04-17T15:39:16Z
close_reason: "Shipped 2026-04-17: rankResults(parsedQuery, candidates) +
  highlightMatches returning typed spans (no HTML, no ANSI). Migrated
  ItemPicker.filterOptions to use parseQuery + rankResults. Canonical fixture
  (29 tests) includes @delei vs @office/.../Delei/SPD case, tiered ranking,
  field weighting, phrase/exclude/task-filter, sticky-selection-by-id for
  fast-typing wrong-Enter protection, and recencyBoost hook stub (wires to
  km-tui.omnibox-recents when that ships). Old fuzzyScore in search-utils.ts
  retained — still consumed by omnibox-projection.ts (command palette,
  off-limits per concurrent-agent scope); follow-up bead can finish the
  deletion. Commits: 18476ffdc, 92b7a5633. Closes km-tui.picker-rank-subpath
  floor."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
dependencies:
  - issue_id: km-tui.omnibox-ranker
    depends_on_id: km-tui.omnibox-unified
    type: parent-child
    created_at: 2026-04-14T16:24:15Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [x] Shared ranker + test fixture (Phase 2, fixes km-tui.picker-rank-subpath) @km/tui #task #P1 @Bjørn Stabell

blocks:: [[@km/tui/omnibox-unified]]

Shared ranker + canonical test fixture + highlighter (Phase 2).

Contract: rankResults(parsedQuery: ParsedQuery, candidates: KNode[]): ScoredResult[]. Does NOT take a raw string — the parsed-query hand-off from @km/tui/omnibox-query-syntax is mandatory so the parser and ranker don't duplicate term logic.

Ranking rules (7 per-match + 5 type weights) as specified in the design doc. Recency bonus from @km/tui/omnibox-recents composes into the final score. highlightMatches(text, parsedQuery) helper extracted — same input type, same span rules, shared by the row renderer and the local-find in-place highlighter.

Migrate ItemPicker.filterOptions and Omnibox's scorer to use rankResults. Closes @km/tui/picker-rank-subpath.

Acceptance: (a) apps/@km/tui/tests/omnibox-ranking.test.ts — canonical fixture table with at minimum the @delei vs @office/.../Delei case; (b) every entry in the table has a hand-written expected order; (c) highlightMatches returns typed spans (not HTML, not ANSI); (d) the old picker and palette scorers are deleted, not adapted; (e) @km/tui/picker-rank-subpath closed with its repro test passing.