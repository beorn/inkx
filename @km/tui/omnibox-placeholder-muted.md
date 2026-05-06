---
mentions:
  - km
id: "@km/tui/omnibox-placeholder-muted"
aliases:
  - km-tui.omnibox-placeholder-muted
  - km-tui-omnibox-placeholder-muted
created_by: Bjørn Stabell
created_at: 2026-04-18T19:18:07Z
closed_at: 2026-04-18T19:40:51Z
close_reason: "Fixed. Row layout (6ab93183b): bold title + right-aligned muted
  path. Guide + placeholder muted (287beefef + silvery f5201510): all glyphs in
  PrefixGuide render at muted tokens; TextInput placeholder uses
  placeholderColor prop defaulting to $disabledfg. 7 new tests
  (omnibox-row-layout.test.tsx + omnibox-muted.test.tsx). 2344/2344 km-tui tests
  pass."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tui.omnibox-placeholder-muted
    depends_on_id: km-tui
    type: parent-child
    created_at: 2026-04-18T12:18:07Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-tui
---

# [x] Omnibox placeholder text 'Type a command or search…' doesn't look muted @km/tui #bug #P2

blocks:: [[@km/tui]]

User says the placeholder doesn't look muted. The placeholder is set via chrome.placeholder in UnifiedOmnibox.tsx MODE_CHROME: 'Type a command or search…' etc. TextInput's placeholder color should use the silvery design system's muted token ( or similar).

Check what TextInput uses for placeholder color. If it defaults to $muted but the terminal is rendering it bright, dig into the theme token resolution. Compare against other muted text in the same dialog (e.g. 'esc' in titleRight already looks right).

Read vendor/silvery/docs/guide/styling.md for the canonical token before 'fixing' — use the design-system-approved muted token.

