---
mentions:
  - km
  - claude
id: "@km/silvery/underline-on-style"
aliases:
  - km-silvery.underline-on-style
  - km-silvery-underline-on-style
created_by: claude:c6244087
created_at: 2026-04-23T17:12:11Z
closed_at: 2026-04-23T17:24:06Z
close_reason: Phase 6 shipped. underline-ext.ts deleted; 7 bare exports folded
  into Style/Term methods. Caps bound once at createStyle(caps) — per-call
  threading eliminated. NodeView.tsx uses term.styledUnderline(...). 258 silvery
  + 1813 km-tui tests pass. Silvery 2ca070c7.
owner: bjorn@stabell.org
assignee: claude:c6244087
dependencies:
  - issue_id: km-silvery.underline-on-style
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-23T10:12:11Z
    created_by: claude:c6244087
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery
---

# [x] Phase 6: merge underline-ext helpers into createStyle @km/silvery #task #P1 @claude:c6244087

blocks:: [[@km/silvery]]

Per user approval 2026-04-23. Move curlyUnderline/dottedUnderline/dashedUnderline/doubleUnderline/underlineColor/styledUnderline from bare exports (packages/ansi/src/underline-ext.ts) to methods on the Style returned by createStyle(caps). underline-ext.ts file deletes entirely (−185 LOC). Consumers (NodeView.tsx, storybook.ts) switch to style.curlyUnderline(x) — caps threaded once at createStyle.

