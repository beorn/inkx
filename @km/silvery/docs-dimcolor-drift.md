---
mentions:
  - km
id: "@km/silvery/docs-dimcolor-drift"
aliases:
  - "@km/all/docs-dimcolor-drift"
  - km-all.docs-dimcolor-drift
  - km-all-docs-dimcolor-drift
created_by: claude:cc081a9a
created_at: 2026-04-26T20:39:40Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-all.docs-dimcolor-drift
    depends_on_id: km-all
    type: parent-child
    created_at: 2026-04-26T13:39:50Z
    created_by: claude:cc081a9a
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-all
---

# [ ] Doc drift: visual-spec/design/rendering still reference removed dimColor prop @km/all #task #P3

blocks:: [[@km/all]]

Found during /complete audit of fix-sweep-0426. Multiple km design and reference docs still describe the deprecated 'dimColor' Text prop:

## Files needing migration to canonical pattern (color="$fg-muted" or <Small>)

- docs/ref/visual-spec.md (multiple sections — lines 185, 186, 198, 204, 278, 279, 286)
- docs/design/ui/rendering.md:100,108
- docs/design/model/kast.md:504,584 (uses '<Text dim>' too)
- docs/design/tea.md:448

## Vendor docs inconsistency

- vendor/silvery/docs/guide/scrolling.md:87 — uses dimColor in example
- vendor/silvery/docs/guide/token-taxonomy.md:250 — explicitly says NOT to use dimColor

This drift PRE-DATES fix-sweep-0426 — silvery removed dim/dimColor from StyleProps before this session. The fix-sweep just surfaced it via the typecheck cleanup.

## Acceptance

- grep -rn 'dimColor' docs/ vendor/silvery/docs/ returns 0 (or only deprecation notices)
- All examples use canonical pattern: color="$fg-muted", <Small>, <H1-H6>, etc.

This is a docs hygiene task, not a regression. Low priority but worth fixing.

