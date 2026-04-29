---
id: "@km/silvery/list-default-ux"
aliases:
  - km-silvery.list-default-ux
  - km-silvery-list-default-ux
created_by: Bjørn Stabell
created_at: 2026-04-19T06:44:36Z
closed_at: 2026-04-19T06:59:16Z
close_reason: Shipped at silvery 5f9121ec + km b09ef0070. SelectList defaults to
  indicator='', full-row $cursor-bg on cursor; ListView + SelectList accept
  onItemHover + onItemClick (hover moves cursor, click confirms); Tabs hover
  state via $bg-muted on inactive tabs. 21 new tests pass. Backward-compat
  retained via explicit indicator prop.
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.list-default-ux
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-18T23:44:49Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [x] Make SelectList + ListView + Tabs default to omnibox-style UX (no arrow, mouse, hover) @km/silvery #feature #P2

blocks:: [[@km/silvery]]

Currently SelectList defaults to indicator='▸ ' +  text highlight on selected row. The omnibox (apps/@km/tui/src/views/OmniboxRow.tsx) uses no arrow, full-row $cursor-bg bg, onMouseEnter to move cursor, onClick to confirm. That UX is strictly nicer and should be silvery's default.

Scope:
1. SelectList: change default indicator from '▸ ' to '' (no arrow). Full-row bg $cursor-bg + fg $cursor on the selected row. Keep indicator prop for back-compat (anyone passing '▸ ' still gets it).
2. ListView: accept onItemClick(index) + onItemHover(index) props. When present, renderItem receives hover/click handlers on each row's root element. onItemHover moves the cursor (same as handleCursor). onItemClick confirms (same as handleSelect).
3. Tabs: already has onMouseDown on tab chips. Add visual hover state (subtle bg or border highlight when mouse is over a tab but not active).
4. Storybook scheme-browser should switch to the shared SelectList idiom once shipped.

Acceptance: SelectList without indicator prop renders no arrow, shows full-row highlight on selection, hover moves cursor, click confirms. Existing SelectList callers with indicator='▸' still work. ListView test for mouse events added. Tabs hover state visible in storybook compare.

Out of scope: extracting SelectList into its own package; mobile/touch; right-click menus.