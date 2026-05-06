---
mentions:
  - km
id: "@km/tui/omnibox-local-find"
aliases:
  - km-tui.omnibox-local-find
  - km-tui-omnibox-local-find
created_by: Bjørn Stabell
created_at: 2026-04-14T23:26:06Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tui.omnibox-local-find
    depends_on_id: km-tui.omnibox-dialog
    type: blocks
    created_at: 2026-04-14T16:26:20Z
    created_by: Bjørn Stabell
    metadata: "{}"
  - issue_id: km-tui.omnibox-local-find
    depends_on_id: km-tui.omnibox-query-syntax
    type: blocks
    created_at: 2026-04-14T18:17:20Z
    created_by: Bjørn Stabell
    metadata: "{}"
  - issue_id: km-tui.omnibox-local-find
    depends_on_id: km-tui.omnibox-ranker
    type: blocks
    created_at: 2026-04-14T18:17:20Z
    created_by: Bjørn Stabell
    metadata: "{}"
  - issue_id: km-tui.omnibox-local-find
    depends_on_id: km-tui.omnibox-unified
    type: parent-child
    created_at: 2026-04-14T16:26:06Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: list
    values:
      - type: link
        target: km-tui.omnibox-dialog
      - type: link
        target: km-tui.omnibox-query-syntax
      - type: link
        target: km-tui.omnibox-ranker
      - type: link
        target: km-tui.omnibox-unified
---

# [ ] / local find bottom-left layout (Phase 9) @km/tui #feature #P1

blocks:: [[@km/tui/omnibox-dialog]], [[@km/tui/omnibox-query-syntax]], [[@km/tui/omnibox-ranker]], [[@km/tui/omnibox-unified]]

Wire / to open the omnibox dialog with { initialBuffer: '/', initialDefaultCommand: 'local_find', candidates: currentView.visibleNodes }. DialogOmnibox internally delegates to FindOmnibox (bottom-left layout) when buffer.startsWith('/'). Replace apps/@km/tui/src/views/FindBar.tsx with the FindOmnibox variant.

In-place board highlighting: the anchored pane's board renders match highlights for every node in the result list. The current highlighted row gets a stronger visual. Uses highlightMatches() helper (shared from @km/tui/omnibox-ranker).

Backspace promotion rule: when buffer is just '/' (bare sigil) and user presses backspace, the buffer becomes '', and DialogOmnibox re-derives its layout — no longer starts with '/' → renders CenterDialog instead of FindOmnibox. defaultCommand also transitions from 'local_find' back to 'default'. The promotion is automatic because both are derived from buffer state.

Acceptance:
(a) / chord opens FindOmnibox variant with defaultCommand='local_find' and bottom-left layout
(b) typing after / filters to matches within currentView.visibleNodes
(c) in-place board highlighting renders on the anchor pane
(d) current highlighted row gets the strong visual; others are subtle
(e) backspace through / → layout promotes back to CenterDialog and defaultCommand reverts to 'default'
(f) Enter on a match navigates to the match (via default command type-dispatch)
(g) FindBar.tsx is deleted after this bead closes
(h) journey test for the full flow: open /, type, navigate, Enter, verify cursor

