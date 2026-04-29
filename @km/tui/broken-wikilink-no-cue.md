---
id: "@km/tui/broken-wikilink-no-cue"
aliases:
  - km-tui.broken-wikilink-no-cue
  - km-tui-broken-wikilink-no-cue
created_by: Bjørn Stabell
created_at: 2026-04-06T20:44:40Z
closed_at: 2026-04-07T01:16:19Z
close_reason: "Fixed in 47a7945ab: unresolved wikilinks render with $error fg +
  dashed underline in $error. Hover popover preserved. Test in
  inline-rendering.test.ts 'broken wikilink rendering'."
---

# [x] [bug] Broken wikilinks have no visual cue — look like normal text @km/tui #bug #P2 @Bjørn Stabell

InlineWikiLink in apps/@km/tui/src/text/InlineComponents.tsx:299 falls through to plain Text when resolved is null. No color, strikethrough, dashed underline, or warning glyph.

Fix: red dashed underline or  color for unresolved wikilinks.