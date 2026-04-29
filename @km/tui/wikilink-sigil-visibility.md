---
id: "@km/tui/wikilink-sigil-visibility"
aliases:
  - km-tui.wikilink-sigil-visibility
  - km-tui-wikilink-sigil-visibility
created_by: Bjørn Stabell
created_at: 2026-04-15T22:44:50Z
closed_at: 2026-04-16T01:49:59Z
close_reason: "Shipped in 776ba959d: wikilinks colored $link at rest, sigils
  navigable via SigilText resolver, stale closure cache dropped. @office
  normalization asymmetry filed separately as
  km-storage.link-resolution-ambiguity and fixed by normalizeNodeName in
  4caab6f5b."
---

# [x] Make wikilinks visible at rest + sigils navigable @km/tui #bug #P2 @Bjørn Stabell

Three coupled visual fixes: (1) resolved wikilinks at rest have undefined fg color + dotted $border underline, making them nearly invisible on dark bg; should be colored like URLs. (2) Bare sigils (@delei, +taxomatic, #tag) never route through the link renderer — they're colorable but not navigable, even though resolveByName would succeed. (3) Combination means users can't visually distinguish sigil refs from plain text in card titles. Fix: linkTextProps wikilink case gets visible at-rest color; SigilText (or its callers) resolves via ctx.resolveWikiLink and renders with wikilink styling when resolved.