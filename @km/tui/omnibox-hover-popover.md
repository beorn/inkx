---
mentions:
  - km
id: "@km/tui/omnibox-hover-popover"
aliases:
  - km-tui.omnibox-hover-popover
  - km-tui-omnibox-hover-popover
created_by: Bjørn Stabell
created_at: 2026-04-15T06:07:17Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tui.omnibox-hover-popover
    depends_on_id: km-silvery.popover
    type: blocks
    created_at: 2026-04-14T23:07:18Z
    created_by: Bjørn Stabell
    metadata: "{}"
  - issue_id: km-tui.omnibox-hover-popover
    depends_on_id: km-tui
    type: parent-child
    created_at: 2026-04-14T23:07:17Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: list
    values:
      - type: link
        target: km-silvery.popover
      - type: link
        target: km-tui
---

# [ ] Omnibox: hover effects + popover on result rows (tree-view style) @km/tui #feature #P1

blocks:: [[@km/silvery/popover]], [[@km/tui]]

User feedback: omnibox results should behave more like a regular tree view — mouse hover should highlight the row, and a popover should appear showing more detail when hovering a result.

Current state: OmniboxRow just renders state (keyboard cursor highlight only). No mouse events.

What to build:

1. OmniboxRow.tsx — add onMouseEnter / onMouseLeave handlers that track hover state; hover = same visual as keyboard selection (or a dimmer variant)
2. Popover integration — on hover, after a small delay, show a popover with the full node content (for node results), command description (for command results), or preview pane (for search results)
3. Mouse click on a row = select + confirm

Dependencies:

- @km/silvery/popover — the shared Popover component (still open)
- @km/tui/badge-float-layout — the float-positioning primitive

Reach: larger feature; can be landed in phases (hover highlight first, popover second, click-to-confirm third).

Related: @km/tui/omnibox-quality-plateau

