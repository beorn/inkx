---
id: "@km/silvery/css-select"
aliases:
  - km-silvery.css-select
  - km-silvery-css-select
created_by: Bjørn Stabell
created_at: 2026-04-10T07:59:57Z
closed_at: 2026-04-10T08:14:52Z
close_reason: "Replaced hand-rolled CSS parser with css-select (full CSS3
  engine). ~280 lines deleted, 30 lines of AgNode adapter added. All 1700 km-tui
  tests + 4906 silvery tests pass. Committed: silvery 33d02053, km afd04a196."
---

# [x] AutoLocator: adopt css-select for full CSS selector spec compliance @km/silvery #feature #P2

Replace hand-rolled CSS selector parser in AutoLocator (auto-locator.ts) with css-what (parser) + css-select (matcher engine). These packages work on any tree structure via a custom adapter — we'd write a thin AgNode adapter. Benefits: full CSS3 selector spec (combinators, pseudo-classes, pseudo-elements), battle-tested edge cases, no more hand-rolling each combinator. Current AutoLocator has multi-level chains, >, +, ~, :first-child/:last-child/:nth-child — but many selectors are missing and child/sibling combinators don't work well because the AgNode tree has React wrapper nodes between data-model nodes.