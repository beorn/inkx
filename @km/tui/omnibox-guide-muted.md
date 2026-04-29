---
id: "@km/tui/omnibox-guide-muted"
aliases:
  - km-tui.omnibox-guide-muted
  - km-tui-omnibox-guide-muted
created_by: Bjørn Stabell
created_at: 2026-04-18T19:17:55Z
closed_at: 2026-04-18T19:40:48Z
close_reason: "Fixed. Row layout (6ab93183b): bold title + right-aligned muted
  path. Guide + placeholder muted (287beefef + silvery f5201510): all glyphs in
  PrefixGuide render at muted tokens; TextInput placeholder uses
  placeholderColor prop defaulting to $disabledfg. 7 new tests
  (omnibox-row-layout.test.tsx + omnibox-muted.test.tsx). 2344/2344 km-tui tests
  pass."
---

# [x] Omnibox prefix guide: everything except keybindings should be muted @km/tui #feature #P2

blocks:: [[@km/tui]]

The PREFIXES / TASKS guide rendered in UnifiedOmnibox.tsx PrefixGuide() on empty universal buffer. Currently labels + sigils are at default brightness. The user wants all non-keybinding text at muted. Only keybindings/hotkeys (if shown) keep normal contrast. Actually the guide has no keybinding shortcuts — it's just sigil→label pairs. The whole guide should be dim so it reads as affordance, not content.

Check UnifiedOmnibox.tsx GuideRow / GuideHeading / PREFIX_GUIDE definitions.