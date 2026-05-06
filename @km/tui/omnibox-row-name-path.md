---
mentions:
  - km
  - Bjørn
id: "@km/tui/omnibox-row-name-path"
aliases:
  - km-tui.omnibox-row-name-path
  - km-tui-omnibox-row-name-path
created_by: Bjørn Stabell
created_at: 2026-04-18T19:17:44Z
closed_at: 2026-04-18T19:40:46Z
close_reason: "Fixed. Row layout (6ab93183b): bold title + right-aligned muted
  path. Guide + placeholder muted (287beefef + silvery f5201510): all glyphs in
  PrefixGuide render at muted tokens; TextInput placeholder uses
  placeholderColor prop defaulting to $disabledfg. 7 new tests
  (omnibox-row-layout.test.tsx + omnibox-muted.test.tsx). 2344/2344 km-tui tests
  pass."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
dependencies:
  - issue_id: km-tui.omnibox-row-name-path
    depends_on_id: km-tui
    type: parent-child
    created_at: 2026-04-18T12:17:44Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-tui
---

# [x] Omnibox row: show name (bold) + path (, right-aligned) for context @km/tui #feature #P2 @Bjørn Stabell

blocks:: [[@km/tui]]

Screenshots 11.29.57 + 11.30.19 show current rows with a single icon + full title. The user wants more context per row:

- Left: bolded name. For '@ne' the name should show '@next' so you can see the match.
- Right:  path, right-aligned.

Current OmniboxRow.tsx composes icon + title + context + hint. The 'context' slot could take the path. The 'title' should include the matched alias/name visibly when different from the content. Path comes from the breadcrumb-style parent chain.

