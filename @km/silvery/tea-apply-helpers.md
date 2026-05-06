---
mentions:
  - km
id: "@km/silvery/tea-apply-helpers"
aliases:
  - km-silvery.tea-apply-helpers
  - km-silvery-tea-apply-helpers
created_by: claude:8b5b9e1c
created_at: 2026-04-21T06:12:43Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.tea-apply-helpers
    depends_on_id: km-silvery.tea
    type: parent-child
    created_at: 2026-04-20T23:12:43Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery.tea
---

# [ ] ApplyResult helpers: passThrough / consumed() to avoid [] vs false footgun @km/silvery #task #P2

blocks:: [[@km/silvery/tea]]

Pro review 2026-04-21 flagged return [] as easy to mistake for pass-through. Add helper exports passThrough (=false) and consumed(effects?: Effect[]) to @silvery/create so plugin authors never write bare literals. Add a lint rule flagging bare return [] in apply() bodies. Context: hub/silvery/tea-review-responses.md §1.

