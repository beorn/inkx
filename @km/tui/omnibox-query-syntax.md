---
id: "@km/tui/omnibox-query-syntax"
aliases:
  - km-tui.omnibox-query-syntax
  - km-tui-omnibox-query-syntax
created_by: Bjørn Stabell
created_at: 2026-04-14T23:23:57Z
closed_at: 2026-04-17T15:39:14Z
close_reason: "Shipped v1 subset 2026-04-17:
  smart/phrase/exclude/sigils/brackets. ^prefix, suffix$, 'exact, and property
  filters (due::, priority::, status::, assignee::, key::value) deferred to v1.1
  with TODO markers in source. Fixture covers all v1 operators plus
  deferred-behavior pins so upgrade is a visible diff. Files:
  apps/km-tui/src/state/omnibox-query-parser.ts (162 LOC),
  apps/km-tui/tests/omnibox-query-parser.test.ts (33 tests). Commit: f2852b2e7."
---

# [x] Query syntax parser: Google + fzf operators, prop filters, bracket family @km/tui #feature #P1 @Bjørn Stabell

blocks:: [[@km/tui/omnibox-unified]]

Parse omnibox query strings into a ParsedQuery value consumed by the ranker and highlighter. Single source of truth for query interpretation.

Output shape: ParsedQuery { terms: QueryTerm[], scope?: SourceScope, filters: { taskStatus?, due?, priority?, assignee?, ... } }. QueryTerm { kind: 'smart'|'phrase'|'exact'|'prefix'|'suffix', value: string, negated: boolean }.

Text operators (Google + fzf, compatible):
- foo (bare) → smart match
- "foo bar" (Google) → exact phrase
- 'foo (fzf) → exact substring
- ^foo (fzf) → starts-with
- foo$ (fzf) → ends-with
- -foo (Google) / !foo (fzf) → exclude
- space = AND

Sigils (existing): @foo, #foo, +foo, [foo (node-only, restored).
Bracket task filters (new, disambiguated by lookahead): [], [ ], [x], [/], [-], [.].
Property filters (new, matching km markdown): due::today, due::>2024-01-01, priority::p0, status::done, assignee::@foo, any key::value.

The parser is a pure function of (searchString, invocationContext, storeState) → ParsedQuery. invocationContext carries the opening chord's defaults; storeState provides the cursor and selection context. View config is derivable from the same ParsedQuery.

Acceptance: (a) parseQuery test fixture covers each operator family + combinations; (b) the ranker consumes ParsedQuery directly (no reparsing); (c) the highlighter consumes ParsedQuery directly; (d) v1 can ship with a minimal parser (smart, phrase, exclude, sigils, brackets) — exact/prefix/suffix and prop filters can be a v1.1 follow-up if time-constrained; (e) document the 'minimal v1' subset explicitly so a narrower cut is possible.