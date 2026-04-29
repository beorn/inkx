---
id: "@km/tui/omnibox-sigil-substring-filter"
aliases:
  - km-tui.omnibox-sigil-substring-filter
  - km-tui-omnibox-sigil-substring-filter
created_by: Bjørn Stabell
created_at: 2026-04-18T19:17:34Z
closed_at: 2026-04-18T19:36:55Z
close_reason: Fixed in 7bfea0a8c — preserve identity sigil (+/#/@/~) on first
  positive FTS term so FTS5 tokenizer (tokenchars='@#+~') matches sigil-prefixed
  tokens like +taxes. Schema tokenizes +taxes as single token; stripping the
  sigil before FTS missed it and post-filter dropped non-project FTS hits. Now
  FTS sees '+t*' and returns +-prefixed matches directly. 3 new tests in
  apps/km-tui/tests/omnibox.test.ts ('nodeResultsForOmnibox — sigil-preserving
  FTS'). 2344/2344 km-tui tests pass.
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tui.omnibox-sigil-substring-filter
    depends_on_id: km-tui
    type: parent-child
    created_at: 2026-04-18T12:17:34Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [x] +t shows no items but + shows projects — sigil mode substring filter broken @km/tui #bug #P2

blocks:: [[@km/tui]]

Screenshots 11.30.43 + 11.30.48: pressing '+' (Project mode) shows a long list of projects including '+Account Data Pipeline', 'Floating Shelves for 670 Hamilton Ave', 'App Annie / data.ai → SensorTower Sale @office' — all with 't' in the title. Pressing '+t' returns 'No items' even though many items match substring 't'. Expected: substring filter works after the sigil. Likely bug in omnibox-projection.ts or omnibox-ranker.ts filter logic for sigil modes.