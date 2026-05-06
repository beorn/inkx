---
mentions:
  - km
id: "@km/silvery/comp-diff"
aliases:
  - km-silvery.comp-diff
  - km-silvery-comp-diff
created_by: Bjørn Stabell
created_at: 2026-04-15T23:18:43Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.comp-diff
    depends_on_id: km-silvery.opentui-parity
    type: parent-child
    created_at: 2026-04-15T16:18:43Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery.opentui-parity
---

# [ ] Component: Diff view (side-by-side + unified) @km/silvery #feature #P3

blocks:: [[@km/silvery/opentui-parity]]

Canonical Diff component. Unified + side-by-side modes, syntax highlighting via Code component, theme tokens for +/-/context. OpenTUI ships Diff renderable.

