---
id: "@km/silvery/tea-wrap-effect-helper"
aliases:
  - km-silvery.tea-wrap-effect-helper
  - km-silvery-tea-wrap-effect-helper
created_by: claude:8b5b9e1c
created_at: 2026-04-21T06:21:27Z
closed_at: 2026-04-21T22:27:53Z
close_reason: Merged into km-silvery.tea-apply-helpers. Both address the same
  class of issue (effect/result shape footguns). One bead owns the helpers
  story.
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.tea-wrap-effect-helper
    depends_on_id: km-silvery.tea
    type: parent-child
    created_at: 2026-04-20T23:21:27Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
---

# [x] wrapEffect(namespace, eff) helper — prevent type-property spread footgun @km/silvery #task #P2

blocks:: [[@km/silvery/tea]]

Discovered by the 2026-04-21 TEA board-nav spike. When wrapping a domain Effect (e.g. BoardEffect with type:'SELECT') into a runtime Effect with a namespace prefix (e.g. { type: 'board:SELECT', ...eff }), the spread overwrites the namespace type with the inner type.\n\nFix: a tiny helper export from @silvery/create:\n\n  function wrapEffect<N extends string, E extends { type: string }>(namespace: N, eff: E) {\n    const { type, ...rest } = eff\n    return { type: `${namespace}:${type}` as const, ...rest }\n  }\n\nApplies to every domain plugin that has its own Effect union. Without the helper, each plugin reimplements the same destructuring pattern or silently overwrites the namespace.\n\nContext: hub/silvery/experiments/tea-nav-spike/README.md §'Friction points'