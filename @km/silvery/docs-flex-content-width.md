---
mentions:
  - km
id: "@km/silvery/docs-flex-content-width"
aliases:
  - km-silvery.docs-flex-content-width
  - km-silvery-docs-flex-content-width
created_by: claude:c6244087
created_at: 2026-04-23T07:59:59Z
closed_at: 2026-04-23T08:18:17Z
close_reason: Doc landed in silvery 416706f9 —
  vendor/silvery/docs/guide/recipes/flex-content-width-bubbles.md (638 words) +
  new Recipes section in guide/index.md. Replaces flexShrink={1} anti-pattern
  with alignItems={flex-end|flex-start} recipe for chat-bubble layouts.
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.docs-flex-content-width
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-23T01:00:05Z
    created_by: claude:c6244087
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery
---

# [x] Docs: content-width flex items with maxWidth cap need alignItems not flexShrink @km/silvery #task #P3

blocks:: [[@km/silvery]]

Discovered in @km/agent-view v0 scaffold (task #14):

Setting `flexShrink={1}` on a bubble column doesn't make it shrink-to-content inside a justified-end row. Solved with `alignItems={isUser ? 'flex-end' : 'flex-start'}` on the bubble column (so inner Text rows right-align within the capped column).

This is non-obvious and worth documenting in silvery styling/layout guide as a 'content-width flex items with maxWidth cap' recipe.

