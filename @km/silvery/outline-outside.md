---
mentions:
  - km
id: "@km/silvery/outline-outside"
aliases:
  - km-silvery.outline-outside
  - km-silvery-outline-outside
created_by: Bjørn Stabell
created_at: 2026-04-13T23:06:35Z
closed_at: 2026-04-14T05:08:48Z
close_reason: Shipped in silvery 0f745f50. Outside outline implemented via
  separate decoration phase
  (vendor/silvery/packages/ag-term/src/pipeline/decoration-phase.ts).
  Snapshot/restore of overwritten cells via TerminalBuffer.outlineSnapshots.
  Removed OUTLINE_CHILD_BIT and the entire dirty cascade approach. 9 outline
  tests pass at SILVERY_STRICT=2 (basic, realistic 100-node scale, edge
  overflow). km view runs cleanly. Tests consolidated into one file. Generalizes
  to focus rings, hover halos, selection borders.
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.outline-outside
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-13T16:07:11Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery
---

# [x] Silvery: outside outline (CSS-correct semantics) @km/silvery #task #P1

blocks:: [[@km/silvery]]

Change outlineStyle to draw OUTSIDE the box (in gap/margin space between siblings) instead of inside. Required for body block rendering, focus rings, hover highlights. Status: render-box.ts coordinates changed, OUTLINE_CHILD_BIT dirty flag added, 5 STRICT tests pass, but real-world STRICT=2 mismatch at (41,4) — stale outline corner not cleared. Also: render-phase-adapter.ts needs same coordinate fix.

